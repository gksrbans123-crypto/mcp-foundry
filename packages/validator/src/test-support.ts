import { SERVICE_NAME } from "@mcp-foundry/shared";
import type { ServerSpec, ToolSpec } from "@mcp-foundry/spec";

// Test-only factory for a minimally valid ServerSpec, used across
// rules/*.test.ts to build boundary cases by overriding one field at a
// time rather than hand-writing a full spec object in every test.
function makeTool(overrides: Partial<ToolSpec> = {}): ToolSpec {
  return {
    name: "get_widget",
    title: "Get widget",
    description: `Get a widget via ${SERVICE_NAME}, backed by a free upstream API.`,
    annotations: {
      title: "Get widget",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Widget id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    request: {
      method: "GET",
      urlTemplate: "https://api.example.com/widgets/{id}",
      headers: [],
      query: [],
      body: null,
    },
    response: {
      fieldSelectors: [{ name: "name", path: "name" }],
      markdownTemplate: "**Widget**: {{name}}",
    },
    cacheTtlSeconds: 60,
    ...overrides,
  };
}

export interface SpecFactoryOptions {
  server?: Partial<Omit<ServerSpec, "tools">>;
  toolCount?: number;
  toolOverrides?: Array<Partial<ToolSpec>>;
}

export function makeValidSpec(options: SpecFactoryOptions = {}): ServerSpec {
  const toolOverrides = options.toolOverrides ?? [];
  const toolCount = options.toolCount ?? Math.max(toolOverrides.length, 3);
  const tools = Array.from({ length: toolCount }, (_, index) =>
    makeTool({ name: `tool_${index}`, title: `Tool ${index}`, ...(toolOverrides[index] ?? {}) }),
  );

  return {
    name: "Widget Server",
    slug: "widget-server",
    description: `A widget lookup server via ${SERVICE_NAME}, backed by a free upstream API.`,
    mcpVersion: "2025-06-18",
    ...options.server,
    tools,
  };
}
