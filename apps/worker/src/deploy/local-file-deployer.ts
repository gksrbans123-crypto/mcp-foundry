import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ServerSpec } from "@mcp-foundry/spec";
import { buildPublicServerUrl } from "./public-url.js";
import type { DeployResult, Deployer } from "./types.js";

/**
 * Writes/removes `{specStoreDir}/{slug}.json` — byte-for-byte the same file
 * convention apps/runtime-host's FileSpecRegistry.get()/.set() use (task
 * #4), so the two processes hand off a deployment purely through the
 * filesystem, with no bespoke IPC. Both processes must be pointed at the
 * same SPEC_STORE_DIR.
 *
 * KNOWN LIMITATION (flagged by task #4's author, decision recorded here):
 * apps/runtime-host's McpServerPool caches a resolved spec/fetchGuard per
 * slug in-memory with no cross-process invalidation trigger. A brand-new
 * slug (a `create` job) is unaffected — nothing is cached yet, so the first
 * real request loads fresh. A `refine` that reuses an existing slug will
 * only be picked up once that process's cache entry is naturally evicted
 * (currently: never, short of a restart). Wiring a live invalidation
 * channel would require either an admin endpoint on runtime-host or a
 * pub/sub layer, both out of scope here to avoid editing another task's
 * actively-developed package; documented so a follow-up can pick a
 * mechanism deliberately rather than discovering the gap in a demo.
 */
export class LocalFileDeployer implements Deployer {
  constructor(
    private readonly specStoreDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  private pathFor(slug: string): string {
    return path.join(this.specStoreDir, `${slug}.json`);
  }

  async deploy(spec: ServerSpec): Promise<DeployResult> {
    await mkdir(this.specStoreDir, { recursive: true });
    await writeFile(this.pathFor(spec.slug), JSON.stringify(spec, null, 2), "utf8");
    return {
      publicUrl: buildPublicServerUrl(this.publicBaseUrl, spec.slug),
      deployRef: `file:${spec.slug}`,
    };
  }

  async remove(slug: string): Promise<void> {
    await rm(this.pathFor(slug), { force: true });
  }
}
