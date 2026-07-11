// Thin wrapper around the MCP SDK's own Client + StreamableHTTPClientTransport
// so e2e-smoke.ts's flow reads as plain async calls instead of repeating
// transport/header setup at every call site.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface McpTextResult {
  isError: boolean;
  text: string;
}

export interface McpSession {
  listTools(): Promise<{ name: string; annotations?: Record<string, unknown> }[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpTextResult>;
  close(): Promise<void>;
}

/** Opens one MCP client connection to `url`, optionally presenting `token` via the X-Owner-Token header (creator-mcp's custom-header AuthN — no-op header for servers that don't use it, like runtime-host). */
export async function connectMcp(url: string, token?: string): Promise<McpSession> {
  const client = new Client({ name: "e2e-smoke-client", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: token ? { headers: { "X-Owner-Token": token } } : undefined,
  });
  await client.connect(transport);

  return {
    async listTools() {
      const result = await client.listTools();
      return result.tools;
    },
    async callTool(name, args) {
      const result = await client.callTool({ name, arguments: args });
      const content = result.content as Array<{ type: string; text?: string }>;
      const text = content.find((item) => item.type === "text")?.text ?? "";
      return { isError: Boolean(result.isError), text };
    },
    async close() {
      await client.close();
    },
  };
}

/**
 * Extracts a `**Label:** value` markdown field, as produced by
 * apps/creator-mcp's response formatting — some fields wrap their value in
 * backticks (Job ID, Server ID) and some don't (Stage, Status, Error), so
 * this tries a backtick-wrapped match first and falls back to "everything
 * to the end of the line."
 */
export function extractField(markdown: string, label: string): string | undefined {
  const match = markdown.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(?:\`([^\`]+)\`|([^\\n]+))`));
  return (match?.[1] ?? match?.[2])?.trim();
}

/**
 * Extracts the owner token from creator-mcp's "New owner token issued"
 * notice block. Rather than pinning to the notice's exact line layout, this
 * relies on the one structural fact that's actually load-bearing: an issued
 * token is `<payload>.<hmac>` (contains a literal "."), while every other
 * backtick span in a creator-mcp response (job/server ids, header name) does
 * not.
 */
export function extractIssuedToken(markdown: string): string | undefined {
  if (!markdown.includes("New owner token issued")) return undefined;
  const spans = [...markdown.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
  return spans.find((value) => value.includes("."));
}
