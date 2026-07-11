import { DEFAULT_MAX_RESPONSE_BYTES, DEFAULT_TIMEOUT_MS, type ToolSpec } from "../schema/index.js";
import { buildRequestBody, buildRequestHeaders, buildRequestUrl } from "./bind.js";
import { renderErrorMarkdown, renderMarkdownTemplate, selectFields } from "./format.js";
import { validateToolArgs } from "./params.js";
import { ResponseTooLargeError, readBodyWithLimit, safeJsonParse } from "./response-body.js";
import type { FetchGuard } from "./types.js";

export interface ExecuteToolOptions {
  fetchGuard: FetchGuard;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Runs one declarative tool call end to end: validate args -> structural
 * bind -> fetch (via the host-injected, egress-guarded fetchGuard) -> size-
 * capped read -> field selection -> markdown render. Every exit path
 * returns markdown text; nothing throws out of this function and no raw
 * upstream body is ever returned verbatim (plan §5.2 / task #3).
 */
export async function executeTool(
  tool: ToolSpec,
  rawArgs: unknown,
  options: ExecuteToolOptions,
): Promise<string> {
  const validated = validateToolArgs(tool, rawArgs);
  if (!validated.ok) {
    return renderErrorMarkdown("Invalid parameters", validated.errors);
  }

  let url: URL;
  try {
    url = buildRequestUrl(tool, validated.value);
  } catch {
    return renderErrorMarkdown("Failed to build the upstream request URL");
  }

  const headers = buildRequestHeaders(tool);
  const body = buildRequestBody(tool, validated.value);
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await options.fetchGuard(url, {
      method: tool.request.method,
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      return renderErrorMarkdown(`Upstream request failed with status ${response.status}`);
    }

    const text = await readBodyWithLimit(response, maxResponseBytes);
    const json = safeJsonParse(text);
    if (json === undefined) {
      return renderErrorMarkdown("Upstream returned a response that was not valid JSON");
    }

    const fields = selectFields(tool.response.fieldSelectors, json);
    return renderMarkdownTemplate(tool.response.markdownTemplate, fields);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return renderErrorMarkdown("Upstream response was too large to process");
    }
    if (controller.signal.aborted) {
      return renderErrorMarkdown("Upstream request timed out");
    }
    return renderErrorMarkdown("Upstream request failed");
  } finally {
    clearTimeout(timer);
  }
}
