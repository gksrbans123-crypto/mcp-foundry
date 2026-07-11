import type { ServerSpec } from "@mcp-foundry/spec";

// Input contract (plan §4): NL is mandatory, OpenAPI/descriptor are optional
// hints that let generation skip LLM inference for the endpoint shape.
export interface GenerateRequest {
  nl: string;
  openapiUrl?: string;
  endpointDescriptor?: EndpointDescriptor;
  /** Optional user-facing server name hint (from create_mcp_server's `name` param). */
  name?: string;
}

export type ParamType = "string" | "number" | "integer" | "boolean";

export interface EndpointDescriptorParam {
  name: string;
  type: ParamType;
  description: string;
  in: "query" | "path";
  required: boolean;
}

export interface EndpointDescriptorAuth {
  /** DSL v1 cannot carry a secret (see constants.ts ALLOWED_HEADER_NAMES) — anything but "none" is out of envelope. */
  type: "none" | "apiKey" | "bearer" | "basic";
}

export interface EndpointDescriptor {
  method: "GET" | "POST";
  /** May contain `{param}` path tokens matching a `params` entry with `in: "path"`. */
  url: string;
  params: EndpointDescriptorParam[];
  auth?: EndpointDescriptorAuth;
  responseFieldHints: Array<{ name: string; path: string }>;
  /** Short human description of what the endpoint/tool does; feeds description/markdown generation. */
  summary: string;
}

// Plan R7: a DSL-envelope-exceeding request is a graceful rejection with a
// reason, never a broken spec.
export type GenerateResult = { rejected: false; spec: ServerSpec } | { rejected: true; reason: string };
