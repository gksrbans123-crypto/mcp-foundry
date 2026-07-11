/** Thrown for any egress-policy rejection (host not allowlisted, resolved to
 * a disallowed address, DNS failure). Callers should treat this the same as
 * any other upstream failure — executeTool (packages/spec) converts every
 * thrown error into a sanitized markdown message, never a raw stack/detail
 * leak to the MCP client. */
export class EgressBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EgressBlockedError";
  }
}
