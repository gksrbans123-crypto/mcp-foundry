import { SERVICE_NAME } from "@mcp-foundry/shared";

const MAX_DESCRIPTION_LENGTH = 1024;

/**
 * Builds a description that always ends with an intact SERVICE_NAME mention
 * (plan §3 bilingual-by-construction), truncating the free-text summary
 * rather than the fixed suffix so the mention survives even a long/garbled
 * LLM-provided summary.
 */
export function buildDescription(summary: string): string {
  const suffix = ` via ${SERVICE_NAME}.`;
  const maxSummaryLength = MAX_DESCRIPTION_LENGTH - suffix.length;
  const trimmedSummary = summary.length > maxSummaryLength ? summary.slice(0, maxSummaryLength) : summary;
  return `${trimmedSummary}${suffix}`;
}
