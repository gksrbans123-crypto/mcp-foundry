import { describe, expect, it } from "vitest";
import { isDisallowedAddress } from "./ip-range-check.js";

describe("isDisallowedAddress", () => {
  it.each([
    ["10.0.0.1", "RFC1918 class A"],
    ["10.255.255.255", "RFC1918 class A upper bound"],
    ["172.16.0.1", "RFC1918 class B lower bound"],
    ["172.31.255.255", "RFC1918 class B upper bound"],
    ["192.168.1.1", "RFC1918 class C"],
    ["127.0.0.1", "loopback"],
    ["169.254.169.254", "cloud metadata"],
    ["169.254.1.1", "link-local"],
    ["0.0.0.0", "unspecified"],
    ["100.64.0.1", "CGNAT shared space"],
    ["224.0.0.1", "multicast"],
    ["203.0.113.5", "documentation range"],
    ["192.0.2.1", "TEST-NET-1"],
  ])("blocks %s (%s)", (ip) => {
    expect(isDisallowedAddress(ip)).toBe(true);
  });

  it.each([
    ["172.15.255.255", "just below RFC1918 class B"],
    ["172.32.0.1", "just above RFC1918 class B"],
    ["8.8.8.8", "public DNS"],
    ["1.1.1.1", "public DNS"],
    ["93.184.216.34", "public host"],
  ])("allows %s (%s)", (ip) => {
    expect(isDisallowedAddress(ip)).toBe(false);
  });

  it.each([
    ["::1", "loopback"],
    ["fe80::1", "link-local"],
    ["fc00::1", "unique-local (fc)"],
    ["fd12:3456::1", "unique-local (fd)"],
    ["::ffff:10.0.0.1", "IPv4-mapped private address (dotted-quad form)"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata address (dotted-quad form)"],
    ["::ffff:a9fe:a9fe", "IPv4-mapped metadata address (hex-group form, LOW-7)"],
    ["::ffff:a00:1", "IPv4-mapped private address (hex-group form, leading zeros omitted, LOW-7)"],
    ["64:ff9b::a9fe:a9fe", "NAT64-embedded metadata address (RFC 6052, LOW-7)"],
    ["64:ff9b::a00:1", "NAT64-embedded private address (LOW-7)"],
    ["0064:ff9b:0000:0000:0000:0000:a9fe:a9fe", "NAT64-embedded metadata address, fully expanded (no :: compression)"],
  ])("blocks IPv6 %s (%s)", (ip) => {
    expect(isDisallowedAddress(ip)).toBe(true);
  });

  it.each([
    ["2001:4860:4860::8888", "public DNS (Google)"],
    ["::ffff:8.8.8.8", "IPv4-mapped public address (dotted-quad form)"],
    ["::ffff:808:808", "IPv4-mapped public address (hex-group form, LOW-7)"],
    ["64:ff9b::808:808", "NAT64-embedded public address (LOW-7)"],
    ["fca::1", "hextet 0x0fca is outside fc00::/7 despite the 'fc' prefix"],
  ])("allows IPv6 %s (%s)", (ip) => {
    expect(isDisallowedAddress(ip)).toBe(false);
  });

  it("fails closed for a value that is not a recognizable IP literal", () => {
    expect(isDisallowedAddress("not-an-ip")).toBe(true);
    expect(isDisallowedAddress("localhost")).toBe(true);
  });
});
