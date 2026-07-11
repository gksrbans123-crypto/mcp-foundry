import type { AdvanceStagePatch, Queue } from "@mcp-foundry/db";
import type { Job } from "@mcp-foundry/shared";
import type { GenerateRequest, GenerateResult } from "@mcp-foundry/generator";
import type { ServerSpec } from "@mcp-foundry/spec";
import type { ValidateSpecResult } from "@mcp-foundry/validator";
import type { Deployer } from "../deploy/types.js";
import type { ProbeOutcome } from "../probe/types.js";
import type { WorkerRepos } from "../repos/types.js";

/** Everything a stage handler needs, fully dependency-injected so unit
 * tests never touch a real LLM, DB, network, or subprocess. */
export interface PipelineDeps {
  queue: Queue;
  repos: WorkerRepos;
  generate: (request: GenerateRequest) => Promise<GenerateResult>;
  validateSpec: (spec: ServerSpec) => ValidateSpecResult;
  checkCompliance: (spec: ServerSpec) => Promise<ValidateSpecResult>;
  probe: (spec: ServerSpec) => Promise<ProbeOutcome>;
  deployer: Deployer;
}

/** One stage handler's verdict — run-job.ts translates this into the
 * matching Queue.complete/fail call. */
export type StageOutcome =
  | { kind: "advance"; patch: Omit<AdvanceStagePatch, "releaseLock"> }
  | { kind: "retry"; error: string }
  | { kind: "fail"; error: string };

export type StageHandler = (job: Job, deps: PipelineDeps) => Promise<StageOutcome>;
