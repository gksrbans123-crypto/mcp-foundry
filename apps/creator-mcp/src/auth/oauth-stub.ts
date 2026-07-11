import type { AuthN } from "./authn.js";

const NOT_IMPLEMENTED_MESSAGE =
  "OAuth AuthN (impl B) is not implemented. docs/g-a-oauth-decision.md concluded OAuth is not required " +
  "(PlayMCP's custom-header auth is an explicitly supported alternative), so impl A " +
  "(signed-owner-token.ts) is wired by default. This stub exists only so the AuthN interface can swap " +
  "to OAuth later without touching callers, per plan §9's redirect URI " +
  "(https://playmcp.kakao.com/api/v1/applied-mcps/{mcpId}/authorize/oauth:callback).";

/** AuthN impl B stub (plan §9 decision tree, NO-branch alternative). Not wired by default. */
export function createOAuthStubAuthN(): AuthN {
  return {
    issueToken() {
      return Promise.reject(new Error(NOT_IMPLEMENTED_MESSAGE));
    },
    verify() {
      return Promise.reject(new Error(NOT_IMPLEMENTED_MESSAGE));
    },
  };
}
