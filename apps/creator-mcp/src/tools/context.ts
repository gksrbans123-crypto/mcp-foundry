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
    "> **New owner token issued — save it now.**",
    "> Send it back as the `X-Owner-Token` header on every future request; it's the only way to access your jobs and servers again.",
    ">",
    `> \`${token}\``,
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
  options: { isError?: boolean; ctx?: ToolContext } = {},
): ToolTextResult {
  const notice = options.ctx?.isNewToken ? tokenNoticeMarkdown(options.ctx.token) : "";
  return {
    content: [{ type: "text", text: `${notice}${markdown}` }],
    ...(options.isError ? { isError: true } : {}),
  };
}
