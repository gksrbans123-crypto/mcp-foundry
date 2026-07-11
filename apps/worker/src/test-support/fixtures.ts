import type { Job } from "@mcp-foundry/shared";
import type { ServerSpec, ToolSpec } from "@mcp-foundry/spec";

/** A minimal, schema-valid readOnly tool — override any field per test. */
export function buildTestTool(overrides: Partial<ToolSpec> = {}): ToolSpec {
  return {
    name: "get_weather",
    title: "Get Weather",
    description: "Gets the current weather for a city.",
    annotations: {
      title: "Get Weather",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: { city: { type: "string", description: "City name" } },
      required: ["city"],
      additionalProperties: false,
    },
    request: {
      method: "GET",
      urlTemplate: "https://api.example.com/weather",
      headers: [],
      query: [{ key: "city", param: "city" }],
      body: null,
    },
    response: {
      fieldSelectors: [{ name: "temp", path: "temp" }],
      markdownTemplate: "Temp: {{temp}}",
    },
    ...overrides,
  };
}

/** A minimal, schema-valid ServerSpec wrapping the given tools. */
export function buildTestSpec(tools: ToolSpec[], overrides: Partial<ServerSpec> = {}): ServerSpec {
  return {
    name: "Test Server",
    slug: "test-server",
    description: "A test server used only in apps/worker's unit tests.",
    mcpVersion: "2025-06-18",
    tools,
    ...overrides,
  };
}

/** A job at the "queued" stage of a fresh `create` job — override per test. */
export function buildTestJob(overrides: Partial<Job> = {}): Job {
  const now = new Date().toISOString();
  return {
    id: "job-1",
    userId: "user-1",
    serverId: null,
    type: "create",
    input: { nl: "make me a weather server" },
    parsedSpec: null,
    stage: "queued",
    status: "queued",
    error: null,
    attempts: 0,
    lockedAt: now,
    lockedBy: "worker-1",
    idempotencyKey: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
