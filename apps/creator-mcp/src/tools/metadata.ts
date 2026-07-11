import { SERVICE_NAME } from "@mcp-foundry/shared";

export const TOOL_NAMES = [
  "create_mcp_server",
  "get_job_status",
  "list_my_servers",
  "get_server_details",
  "refine_mcp_server",
  "delete_server",
  "get_dashboard_link",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolAnnotations5 {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolMetadata {
  name: ToolName;
  description: string;
  annotations: ToolAnnotations5;
}

// Single source of truth for the plan §3 tool table: name, description
// (English + bilingual SERVICE_NAME, plan requirement), and all 5 required
// annotation hints. tools/register.ts wires these onto the McpServer;
// metadata.test.ts asserts every plan §3/§8 compliance rule against this.
export const TOOL_METADATA: Record<ToolName, ToolMetadata> = {
  create_mcp_server: {
    name: "create_mcp_server",
    description:
      `Submits a natural-language spec to ${SERVICE_NAME} to generate a PlayMCP-compliant remote MCP ` +
      "server. Returns a job id and a status URL immediately; code generation, validation (MCP Inspector), " +
      "and deployment run asynchronously. Use `get_job_status` to track progress.",
    annotations: {
      title: "Create MCP Server",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  get_job_status: {
    name: "get_job_status",
    description:
      `Looks up the current stage, status, and any error for a ${SERVICE_NAME} generation job by job id. ` +
      "Use this to poll progress after `create_mcp_server` or `refine_mcp_server`.",
    annotations: {
      title: "Get Job Status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  list_my_servers: {
    name: "list_my_servers",
    description: `Lists the MCP servers you have generated with ${SERVICE_NAME}, optionally filtered by status.`,
    annotations: {
      title: "List My Servers",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  get_server_details: {
    name: "get_server_details",
    description:
      `Returns detailed information for one of your ${SERVICE_NAME} servers: its public URL, tool list, ` +
      "latency probe result, and deploy reference.",
    annotations: {
      title: "Get Server Details",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  refine_mcp_server: {
    name: "refine_mcp_server",
    description:
      `Submits a natural-language change request for an existing ${SERVICE_NAME} server. Enqueues a ` +
      "rebuild job and returns immediately; use `get_job_status` to track progress.",
    annotations: {
      title: "Refine MCP Server",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  delete_server: {
    name: "delete_server",
    description:
      `Deletes one of your ${SERVICE_NAME} servers. Enqueues a teardown job and returns immediately. ` +
      "Deleting an already-deleted server is a no-op.",
    annotations: {
      title: "Delete Server",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  get_dashboard_link: {
    name: "get_dashboard_link",
    description: `Returns the ${SERVICE_NAME} web dashboard URL where you can view and manage all your generated servers.`,
    annotations: {
      title: "Get Dashboard Link",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
};
