import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { weatherFixture, loadServerSpec, type ServerSpec } from "@mcp-foundry/spec";
import { LocalFileDeployer } from "./local-file-deployer.js";

describe("LocalFileDeployer", () => {
  let dir: string;
  let spec: ServerSpec;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "mcp-foundry-deployer-"));
    const loaded = loadServerSpec(weatherFixture);
    if (!loaded.ok) throw new Error(`fixture failed to load: ${loaded.errors.join("; ")}`);
    spec = loaded.value;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes the spec as {slug}.json and returns the public URL + deployRef", async () => {
    const deployer = new LocalFileDeployer(dir, "https://foundry.example.com");
    const result = await deployer.deploy(spec);

    expect(result.publicUrl).toBe(`https://foundry.example.com/s/${spec.slug}/mcp`);
    expect(result.deployRef).toBe(`file:${spec.slug}`);

    const written = JSON.parse(await readFile(path.join(dir, `${spec.slug}.json`), "utf8"));
    expect(written).toEqual(spec);
  });

  it("creates the directory if it does not exist yet", async () => {
    const nestedDir = path.join(dir, "nested", "specs");
    const deployer = new LocalFileDeployer(nestedDir, "https://foundry.example.com");
    await deployer.deploy(spec);

    const written = JSON.parse(await readFile(path.join(nestedDir, `${spec.slug}.json`), "utf8"));
    expect(written).toEqual(spec);
  });

  it("remove deletes the file", async () => {
    const deployer = new LocalFileDeployer(dir, "https://foundry.example.com");
    await deployer.deploy(spec);
    await deployer.remove(spec.slug);

    await expect(stat(path.join(dir, `${spec.slug}.json`))).rejects.toThrow();
  });

  it("remove is idempotent — removing an already-absent slug does not throw", async () => {
    const deployer = new LocalFileDeployer(dir, "https://foundry.example.com");
    await expect(deployer.remove("never-deployed")).resolves.toBeUndefined();
  });
});
