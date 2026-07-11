// Minimal stateless Streamable HTTP MCP server used only to spike Inspector CLI
// headless behavior (task #6). Not part of the shipped product.
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const server = new McpServer({ name: "spike-echo-server", version: "0.0.1" });

server.registerTool(
  "echo",
  {
    description: "Echoes back the provided text.",
    inputSchema: { text: z.string() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ text }) => ({ content: [{ type: "text", text: `echo: ${text}` }] }),
);

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = Number(process.env.SPIKE_PORT ?? 3999);
app.listen(port, () => console.log(`spike server listening on :${port}`));
