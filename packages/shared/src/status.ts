export const JOB_STAGES = [
  "queued",
  "generating",
  "building",
  "validating",
  "probing",
  "deploying",
  "active",
  "failed",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

// Job.status shares the stage domain (plan §7 data model) rather than a
// separate lifecycle vocabulary — kept as its own alias so call sites can
// name the field they mean without implying two different value sets exist.
export type JobStatus = JobStage;

export const JOB_TYPES = ["create", "refine", "redeploy", "delete"] as const;
export type JobType = (typeof JOB_TYPES)[number];

// "disabled" = owner paused it from the dashboard (reversible): the spec file
// stays deployed but runtime-host only serves "active" servers, so a disabled
// server 404s until re-enabled. Distinct from "deleted" (permanent, spec file
// removed).
export const SERVER_STATUSES = ["active", "building", "failed", "deleted", "disabled"] as const;
export type ServerStatus = (typeof SERVER_STATUSES)[number];
