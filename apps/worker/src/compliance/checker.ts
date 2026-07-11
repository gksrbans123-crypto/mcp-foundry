import type { InspectorRunnerOptions, ValidateSpecResult } from "@mcp-foundry/validator";
import { runInspectorCheck } from "@mcp-foundry/validator";
import type { FetchGuard, ServerSpec } from "@mcp-foundry/spec";
import { buildSyntheticStringArgs } from "../probe/synthetic-args.js";
import { startEphemeralServer } from "./ephemeral-server.js";

export interface ComplianceCheckOptions {
  /** Injectable for tests, avoids spawning a real `npx` process. */
  inspectorOptions?: Pick<InspectorRunnerOptions, "exec" | "inspectorPackage" | "timeoutMs">;
}

/**
 * Task #7's Inspector-based structural/protocol compliance check, run
 * against the throwaway ephemeral server (never the public deployment
 * target — see ephemeral-server.ts). Only readOnly tools get a real
 * tools/call round trip; non-readOnly tools are covered by Inspector's
 * tools/list shape check alone, so no destructive tool is ever actually
 * invoked here, mirroring R1's probe-side restriction.
 *
 * `@modelcontextprotocol/inspector` must be a *direct* dependency of this
 * package (see package.json), not just a transitive one via
 * @mcp-foundry/validator: runInspectorCheck's default executor shells out to
 * `npx <package>`, resolved relative to this process's cwd, and pnpm's
 * strict node_modules isolation only exposes a dependency's bin there if
 * apps/worker declares it itself (found the hard way via task #12's E2E
 * smoke — npx failed with "command not found" before this was added).
 */
export async function checkCompliance(
  spec: ServerSpec,
  fetchGuard: FetchGuard,
  options: ComplianceCheckOptions = {},
): Promise<ValidateSpecResult> {
  const handle = await startEphemeralServer(spec, fetchGuard);
  try {
    const toolCalls = spec.tools
      .filter((tool) => tool.annotations.readOnlyHint)
      .map((tool) => ({ name: tool.name, args: buildSyntheticStringArgs(tool.inputSchema) }));

    return await runInspectorCheck(handle.url, { toolCalls, ...options.inspectorOptions });
  } finally {
    await handle.close();
  }
}
