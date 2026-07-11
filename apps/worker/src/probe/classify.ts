export type ProbeSampleClassification = "ok" | "transient" | "fatal";

/**
 * executeTool (packages/spec) never throws — every outcome, success or
 * failure, comes back as a rendered markdown string (see its own
 * `renderErrorMarkdown` call sites). This classifies that string against
 * executeTool's known, stable error messages to implement R3: "업스트림
 * 일시 도달불가(연결실패/5xx)"는 retry-with-backoff, only "느림(비준수)"
 * (or a fatal probe-construction problem) hard-fails.
 *
 * - "transient": no HTTP response was obtained at all (timeout, DNS/egress
 *   failure, connection refused, 5xx) — worth retrying.
 * - "fatal": the probe's own synthetic arguments or URL binding failed —
 *   not an upstream signal, indicates a genuine spec problem.
 * - "ok": a response was obtained (any status code) — the round trip
 *   completed and its latency is a valid sample, regardless of status,
 *   since probing measures reachability/latency, not response semantics.
 */
export function classifyProbeResult(markdown: string): ProbeSampleClassification {
  if (markdown.includes("Upstream request timed out")) return "transient";

  const statusMatch = markdown.match(/Upstream request failed with status (\d+)/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    return status >= 500 ? "transient" : "ok";
  }

  if (markdown.includes("Upstream request failed")) return "transient";
  if (markdown.includes("Invalid parameters")) return "fatal";
  if (markdown.includes("Failed to build the upstream request URL")) return "fatal";

  return "ok";
}
