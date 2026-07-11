/**
 * Cookie name shared by the client bridge (TokenSessionBridge) and the
 * server-side resolver (owner-token.ts). Kept in its own module with NO
 * `next/headers` import so importing the constant into a Client Component
 * doesn't drag server-only code into the client bundle.
 */
export const OWNER_TOKEN_COOKIE = "mcpf_owner_token";
