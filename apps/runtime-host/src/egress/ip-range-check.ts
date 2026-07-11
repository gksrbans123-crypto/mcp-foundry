import net from "node:net";

function ipv4ToInt(ip: string): number {
  return ip
    .split(".")
    .map(Number)
    .reduce((acc, part) => acc * 256 + part, 0);
}

// Loopback, RFC1918 private ranges, link-local (incl. cloud metadata
// 169.254.169.254), CGNAT shared space, documentation/benchmark ranges,
// multicast, and reserved space — plan §5.2 "사설 IP(RFC1918/link-local)/
// metadata IP(169.254.169.254) 거부".
const IPV4_BLOCKED_RANGES: ReadonlyArray<readonly [string, string]> = [
  ["0.0.0.0", "0.255.255.255"],
  ["10.0.0.0", "10.255.255.255"],
  ["100.64.0.0", "100.127.255.255"],
  ["127.0.0.0", "127.255.255.255"],
  ["169.254.0.0", "169.254.255.255"],
  ["172.16.0.0", "172.31.255.255"],
  ["192.0.0.0", "192.0.0.255"],
  ["192.0.2.0", "192.0.2.255"],
  ["192.168.0.0", "192.168.255.255"],
  ["198.18.0.0", "198.19.255.255"],
  ["198.51.100.0", "198.51.100.255"],
  ["203.0.113.0", "203.0.113.255"],
  ["224.0.0.0", "255.255.255.255"],
];

const IPV4_BLOCKED_RANGE_INTS = IPV4_BLOCKED_RANGES.map(
  ([start, end]) => [ipv4ToInt(start), ipv4ToInt(end)] as const,
);

function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return IPV4_BLOCKED_RANGE_INTS.some(([start, end]) => value >= start && value <= end);
}

const IPV4_MAPPED_IPV6_PATTERN = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/;
const HEX_GROUP_PATTERN = /^[0-9a-f]{1,4}$/i;

/**
 * Numeric value of the leading hextet, honoring `::` compression (an
 * address starting with `::` has an implicit all-zero first hextet). Used
 * instead of a raw string-prefix match so e.g. "fca::1" (hextet 0x0fca)
 * isn't mistaken for the fc00::/7 ULA range (0xfc00-0xfdff).
 */
function firstHextetValue(ip: string): number {
  if (ip.startsWith("::")) return 0;
  const end = ip.indexOf(":");
  const first = end === -1 ? ip : ip.slice(0, end);
  const value = Number.parseInt(first, 16);
  return Number.isNaN(value) ? -1 : value;
}

/** Parses `ip` (already known valid via net.isIP) into its 8 hextet strings, expanding any `::` compression. */
function expandIpv6(ip: string): string[] | null {
  const withoutZone = ip.split("%")[0]!;
  const doubleColonParts = withoutZone.split("::");
  if (doubleColonParts.length > 2) return null;

  if (doubleColonParts.length === 1) {
    const groups = withoutZone.split(":");
    return groups.length === 8 ? groups : null;
  }

  const head = doubleColonParts[0]!.length > 0 ? doubleColonParts[0]!.split(":") : [];
  const tail = doubleColonParts[1]!.length > 0 ? doubleColonParts[1]!.split(":") : [];
  const missing = 8 - head.length - tail.length;
  return missing >= 0 ? [...head, ...Array(missing).fill("0"), ...tail] : null;
}

function hextetValue(hextet: string): number {
  return HEX_GROUP_PATTERN.test(hextet) ? Number.parseInt(hextet, 16) : -1;
}

/**
 * Detects an IPv4 address embedded in the low 32 bits of an IPv6 literal —
 * the IPv4-mapped hex form (`::ffff:0:0/96`, e.g. "::ffff:a9fe:a9fe" — the
 * non-dotted-quad sibling of IPV4_MAPPED_IPV6_PATTERN above) or the NAT64
 * well-known prefix (`64:ff9b::/96`, RFC 6052) — and decodes it so the IPv4
 * blocklist applies. Without this, a malicious/compromised DNS response
 * could hand back a syntactically-valid IPv6 literal encoding a blocked
 * IPv4 address (e.g. cloud metadata) purely in a form the dotted-quad-only
 * regex misses (security review LOW-7).
 */
function extractEmbeddedIpv4(ip: string): string | null {
  const hextets = expandIpv6(ip);
  if (!hextets) return null;
  const values = hextets.map(hextetValue);
  if (values.some((value) => value < 0)) return null;

  const isIpv4Mapped =
    values[0] === 0 && values[1] === 0 && values[2] === 0 && values[3] === 0 && values[4] === 0 && values[5] === 0xffff;
  const isNat64 =
    values[0] === 0x64 && values[1] === 0xff9b && values[2] === 0 && values[3] === 0 && values[4] === 0 && values[5] === 0;
  if (!isIpv4Mapped && !isNat64) return null;

  const high = values[6]!;
  const low = values[7]!;
  return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join(".");
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  const first = firstHextetValue(normalized);
  const isLinkLocal = first >= 0xfe80 && first <= 0xfebf; // fe80::/10
  const isUniqueLocal = first >= 0xfc00 && first <= 0xfdff; // fc00::/7 (ULA)
  if (isLinkLocal || isUniqueLocal) return true;

  const mappedDotted = normalized.match(IPV4_MAPPED_IPV6_PATTERN);
  if (mappedDotted?.[1] !== undefined) return isBlockedIpv4(mappedDotted[1]);

  const embedded = extractEmbeddedIpv4(normalized);
  if (embedded !== null) return isBlockedIpv4(embedded);

  return false;
}

/**
 * Rejects loopback/private/link-local/metadata/CGNAT/documentation/
 * multicast/reserved addresses (SSRF gate, plan §5.2). Applied to every
 * DNS-resolved address for a host, not just the first — a multi-A-record
 * response can't slip a disallowed address through. Anything that isn't a
 * recognizable IPv4/IPv6 literal fails closed (treated as disallowed).
 */
export function isDisallowedAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true;
}
