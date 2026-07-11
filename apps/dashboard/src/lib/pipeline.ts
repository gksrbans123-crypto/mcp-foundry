import type { JobStage, StatusEvent } from "@mcp-foundry/shared";

/** The stages we render as a GitLab-style pipeline. "queued" is omitted (it's
 * instantaneous) and "generating" has no completed-event of its own (the
 * worker jumps straight to "building"), so completion is inferred from order:
 * reaching a later stage implies the earlier ones are done. */
export const PIPELINE_STAGES = [
  { stage: "generating", label: "생성" },
  { stage: "building", label: "빌드" },
  { stage: "validating", label: "검증" },
  { stage: "probing", label: "측정" },
  { stage: "deploying", label: "배포" },
  { stage: "active", label: "활성" },
] as const satisfies ReadonlyArray<{ stage: JobStage; label: string }>;

export type StageState = "done" | "running" | "failed" | "pending";

interface PipelineJob {
  stage: JobStage;
  status: string;
}

/**
 * Derives per-stage state from a job + its status_events. status_events only
 * record `completed` steps (no per-step failure rows), so:
 *  - a stage is "done" if it — or any later stage — has a completed event
 *    (the pipeline is linear, so a later completion implies earlier ones);
 *  - a failed job marks the first not-yet-done stage as "failed";
 *  - an in-progress job marks that same stage as "running";
 *  - everything after is "pending".
 */
const indexOfStage = (stage: string): number => PIPELINE_STAGES.findIndex((n) => n.stage === stage);

export function derivePipeline(job: PipelineJob | null, events: StatusEvent[]): StageState[] {
  const n = PIPELINE_STAGES.length;
  const pending = (): StageState[] => PIPELINE_STAGES.map(() => "pending");
  if (!job) return pending();

  const isFailed = job.status === "failed" || job.stage === "failed";
  const isActive = !isFailed && (job.status === "active" || job.stage === "active");

  if (isActive) return PIPELINE_STAGES.map(() => "done");

  if (isFailed) {
    // Pinpoint the failed stage: an explicit failed event (mock convention),
    // else the stage right after the last completed one (real events only
    // record "completed"), else the very first stage.
    const failedStep = events.find((e) => e.status === "failed")?.step;
    const completedIdx = events
      .filter((e) => e.status === "completed")
      .map((e) => indexOfStage(e.step))
      .reduce((max, i) => Math.max(max, i), -1);
    let failedIndex = failedStep ? indexOfStage(failedStep) : completedIdx + 1;
    if (failedIndex < 0 || failedIndex >= n) failedIndex = Math.min(Math.max(completedIdx + 1, 0), n - 1);
    return PIPELINE_STAGES.map((_node, i) => (i < failedIndex ? "done" : i === failedIndex ? "failed" : "pending"));
  }

  // In progress: the job's current stage is the running node ("queued" isn't a
  // pipeline node, so it maps to the first one).
  const currentIndex = indexOfStage(job.stage);
  const running = currentIndex < 0 ? 0 : currentIndex;
  return PIPELINE_STAGES.map((_node, i) => (i < running ? "done" : i === running ? "running" : "pending"));
}

export interface PipelineSummary {
  done: number;
  total: number;
  state: "active" | "running" | "failed" | "idle";
}

export function summarizePipeline(states: StageState[]): PipelineSummary {
  const done = states.filter((s) => s === "done").length;
  const state = states.includes("failed")
    ? "failed"
    : states.includes("running")
      ? "running"
      : done === states.length
        ? "active"
        : "idle";
  return { done, total: states.length, state };
}
