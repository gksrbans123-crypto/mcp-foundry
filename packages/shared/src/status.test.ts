import { describe, expect, it } from "vitest";
import { JOB_STAGES, JOB_TYPES, SERVER_STATUSES } from "./status.js";

describe("status enums", () => {
  it("defines the full job pipeline stage set in order", () => {
    expect(JOB_STAGES).toEqual([
      "queued",
      "generating",
      "building",
      "validating",
      "probing",
      "deploying",
      "active",
      "failed",
    ]);
  });

  it("defines the job types", () => {
    expect(JOB_TYPES).toEqual(["create", "refine", "redeploy", "delete"]);
  });

  it("defines the server statuses", () => {
    expect(SERVER_STATUSES).toEqual(["active", "building", "failed", "deleted", "disabled"]);
  });
});
