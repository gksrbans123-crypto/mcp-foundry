import type { ServerSpec } from "@mcp-foundry/spec";
import type { SpecRegistry } from "./types.js";

/**
 * In-memory SpecRegistry — the primary implementation for local dev, tests,
 * and the fixture-first golden path (plan P1: prove interpreter load ->
 * deploy -> public URL -> Inspector pass before the Generator exists).
 * State is process-local and lost on restart.
 */
export class InMemorySpecRegistry implements SpecRegistry {
  private readonly specs = new Map<string, ServerSpec>();

  async get(slug: string): Promise<ServerSpec | null> {
    return this.specs.get(slug) ?? null;
  }

  async set(spec: ServerSpec): Promise<void> {
    this.specs.set(spec.slug, spec);
  }
}
