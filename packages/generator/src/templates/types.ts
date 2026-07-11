import type { ServerSpec } from "@mcp-foundry/spec";

export interface Template {
  id: string;
  /** Lowercase substrings checked against the lowercased NL request. */
  keywords: string[];
  /** Returns a fresh spec each call (never a shared mutable instance). `name` optionally personalizes the server name/slug. */
  buildSpec: (overrides?: { name?: string }) => ServerSpec;
}
