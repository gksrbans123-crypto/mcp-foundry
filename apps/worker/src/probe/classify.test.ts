import { describe, expect, it } from "vitest";
import { classifyProbeResult } from "./classify.js";

describe("classifyProbeResult", () => {
  it("classifies a timeout as transient", () => {
    expect(classifyProbeResult("**Error:** Upstream request timed out")).toBe("transient");
  });

  it("classifies a 5xx status as transient", () => {
    expect(classifyProbeResult("**Error:** Upstream request failed with status 503")).toBe("transient");
  });

  it("classifies a 4xx status as a completed (ok) round trip", () => {
    expect(classifyProbeResult("**Error:** Upstream request failed with status 404")).toBe("ok");
  });

  it("classifies a generic network/egress failure as transient", () => {
    expect(classifyProbeResult("**Error:** Upstream request failed")).toBe("transient");
  });

  it("classifies invalid parameters as fatal", () => {
    expect(classifyProbeResult("**Error:** Invalid parameters\n\n- missing required parameter \"city\"")).toBe(
      "fatal",
    );
  });

  it("classifies a URL-build failure as fatal", () => {
    expect(classifyProbeResult("**Error:** Failed to build the upstream request URL")).toBe("fatal");
  });

  it("classifies a successful markdown response as ok", () => {
    expect(classifyProbeResult("### Weather in Seoul\n\n- Temp: 20C")).toBe("ok");
  });

  it("classifies a benign parse/size issue as ok (a response was still obtained)", () => {
    expect(classifyProbeResult("**Error:** Upstream returned a response that was not valid JSON")).toBe("ok");
  });
});
