/**
 * Interface boundary for owner identity (plan §0.1 principle 5, §9 decision
 * tree). `verify` resolves a presented credential to a userId (or null if
 * missing/invalid — callers must treat null as 401 Unauthorized per the
 * PlayMCP review policy's "HTTP 응답" requirement, docs/g-a-oauth-decision.md
 * §3-1). `issueToken` is the separate auto-provisioning path used the first
 * time a client calls with no credential at all — that is NOT a verify()
 * failure, it's a distinct "no credential presented yet" case.
 */
export interface AuthN {
  issueToken(): Promise<{ userId: string; token: string }>;
  verify(token: string | undefined): Promise<string | null>;
}
