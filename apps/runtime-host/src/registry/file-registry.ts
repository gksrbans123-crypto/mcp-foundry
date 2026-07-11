import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadServerSpec, type ServerSpec } from "@mcp-foundry/spec";
import type { SpecRegistry } from "./types.js";

/**
 * File-backed SpecRegistry: one JSON file per slug under `directory`. This
 * is the "DB 없으면 파일 폴백" path from task #4, and doubles as the
 * simplest possible deploy mechanism — a future deployer can hand off a
 * spec just by writing a JSON file here, no custom protocol required.
 * Every read is re-validated through loadServerSpec, since a file on disk
 * is untrusted input like any other boundary.
 */
export class FileSpecRegistry implements SpecRegistry {
  constructor(private readonly directory: string) {}

  private pathFor(slug: string): string {
    return path.join(this.directory, `${slug}.json`);
  }

  async get(slug: string): Promise<ServerSpec | null> {
    let raw: string;
    try {
      raw = await readFile(this.pathFor(slug), "utf8");
    } catch {
      return null;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return null;
    }

    const result = loadServerSpec(parsedJson);
    return result.ok ? result.value : null;
  }

  async set(spec: ServerSpec): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(spec.slug), JSON.stringify(spec, null, 2), "utf8");
  }
}
