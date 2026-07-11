import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { createCreateMcpServerHandler, createMcpServerInputShape } from "./create-mcp-server.js";
import type { ToolContext, ToolTextResult } from "./context.js";
import { createDeleteServerHandler, deleteServerInputShape } from "./delete-server.js";
import { createGetDashboardLinkHandler, getDashboardLinkInputShape } from "./get-dashboard-link.js";
import { createGetJobStatusHandler, getJobStatusInputShape } from "./get-job-status.js";
import { createGetServerDetailsHandler, getServerDetailsInputShape } from "./get-server-details.js";
import { createListMyServersHandler, listMyServersInputShape } from "./list-my-servers.js";
import { TOOL_METADATA, type ToolName } from "./metadata.js";
import { createRefineMcpServerHandler, refineMcpServerInputShape } from "./refine-mcp-server.js";

type ZodRawShape = Record<string, z.ZodTypeAny>;
// Every per-tool handler validates its own args via its own zod input shape
// at the MCP protocol boundary; this wiring helper only needs to agree with
// the SDK on the *return* shape, so the argument type is deliberately loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (args: any) => Promise<ToolTextResult>;

function registerTool(server: McpServer, name: ToolName, inputShape: ZodRawShape, handler: AnyHandler): void {
  const meta = TOOL_METADATA[name];
  server.registerTool(
    meta.name,
    {
      title: meta.annotations.title,
      description: meta.description,
      inputSchema: inputShape,
      annotations: meta.annotations,
    },
    handler,
  );
}

/** Builds a fresh McpServer with all 7 tools (plan §3) bound to this request's authenticated ToolContext. */
export function createCreatorMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "mcp-creator", version: "0.1.0" });

  registerTool(server, "create_mcp_server", createMcpServerInputShape, createCreateMcpServerHandler(ctx));
  registerTool(server, "get_job_status", getJobStatusInputShape, createGetJobStatusHandler(ctx));
  registerTool(server, "list_my_servers", listMyServersInputShape, createListMyServersHandler(ctx));
  registerTool(server, "get_server_details", getServerDetailsInputShape, createGetServerDetailsHandler(ctx));
  registerTool(server, "refine_mcp_server", refineMcpServerInputShape, createRefineMcpServerHandler(ctx));
  registerTool(server, "delete_server", deleteServerInputShape, createDeleteServerHandler(ctx));
  registerTool(server, "get_dashboard_link", getDashboardLinkInputShape, createGetDashboardLinkHandler(ctx));

  return server;
}
