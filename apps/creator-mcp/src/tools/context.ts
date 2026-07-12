import type { RateLimiters } from "../rate-limit/token-bucket.js";
import type { CreatorRepos } from "../repos/types.js";

export interface ToolContext {
  userId: string;
  /** The raw owner token in effect for this request — either just-issued or
   * the one the caller presented. Always present so every tool response can
   * embed a working dashboard link (plan §9 "대시보드 URL 내장"), not just
   * the first auto-issue response. */
  token: string;
  /** True only for the request that just auto-provisioned a brand-new token. */
  isNewToken?: boolean;
  /** Key mutate tool handlers must pass to `rateLimiters.mutate.tryConsume`
   * (HIGH-2) — `userId` for an authenticated caller, `ip:<address>` for a
   * caller that just auto-provisioned, so repeated anonymous mutate calls
   * share one budget instead of each getting a fresh, untouched bucket. */
  rateLimitKey: string;
  repos: CreatorRepos;
  rateLimiters: RateLimiters;
  dashboardBaseUrl: string;
  /** Resolves a caller-supplied `owner_token` tool argument to a userId (see
   * resolveOwnerIdentity). Wired from AuthN.verify in app.ts; optional so
   * test contexts that don't exercise the argument path need no stub. */
  verifyToken?: (token: string) => Promise<string | null>;
}

/**
 * PlayMCP's no-auth hosting opens a fresh connection per tool call (no header
 * or session survives between calls — verified via the /debug/headers dump),
 * so a stable identity can only ride inside the conversation itself: the
 * ASSISTANT remembers the issued token and passes it back as each tool's
 * `owner_token` argument. This helper resolves that argument into an
 * effective ToolContext: same shape, but userId/token swapped to the token's
 * owner and the new-token notice suppressed. Falls back to the request's own
 * identity when the argument is absent (or no verifier is wired).
 * rateLimitKey is deliberately kept from the original request (IP-keyed for
 * anonymous callers) so passing owner_token can't mint fresh rate budgets.
 */
export async function resolveOwnerIdentity(ctx: ToolContext, ownerToken: string | undefined): Promise<ToolContext> {
  if (!ownerToken || !ctx.verifyToken) return ctx;
  const userId = await ctx.verifyToken(ownerToken);
  if (!userId) return ctx;
  return { ...ctx, userId, token: ownerToken, isNewToken: false };
}

export interface ToolTextResult {
  // Index signature required for structural assignability to the MCP SDK's
  // CallToolResult, which allows arbitrary pass-through fields.
  [x: string]: unknown;
  content: [{ type: "text"; text: string }];
  isError?: boolean;
}

function tokenNoticeMarkdown(token: string): string {
  return [
    "> **New owner token issued — 이 대화의 '내 계정 키'예요.**",
    `> \`${token}\``,
    ">",
    "> _(어시스턴트 지시: 위 토큰을 이 대화 내내 기억하고, 앞으로 `create_mcp_server` 와 `list_my_servers` 를 호출할 때마다 `owner_token` 인자로 그대로 전달하세요 — 그래야 같은 사용자로 서버 목록과 진행 상황이 유지됩니다. 사용자에게는 다음에 다시 찾을 수 있도록 이 토큰을 저장해 두라고 안내해 주세요.)_",
    "",
    "",
  ].join("\n");
}

/**
 * Wraps tool response markdown into the MCP `content` shape (plan: responses
 * must be refined markdown, never raw JSON dumps). Prepends the one-time
 * owner-token notice when `ctx.isNewToken` is set, regardless of which tool
 * happened to be called first.
 */
export function textResult(
  markdown: string,
  options: { isError?: boolean; ctx?: ToolContext; announceToken?: boolean } = {},
): ToolTextResult {
  // Token notice is opt-in (create_mcp_server only). Every anonymous call
  // auto-issues a token, so announcing it on every response floods the
  // conversation with tokens that own NOTHING — the assistant then passes one
  // of those to owner_token and list_my_servers comes back empty. The only
  // token worth announcing is the one that just became a server's owner.
  const notice = options.announceToken && options.ctx?.isNewToken ? tokenNoticeMarkdown(options.ctx.token) : "";
  return {
    content: [{ type: "text", text: `${notice}${markdown}` }],
    ...(options.isError ? { isError: true } : {}),
  };
}
