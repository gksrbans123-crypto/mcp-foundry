export class ResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`response body exceeded the ${maxBytes}-byte limit`);
    this.name = "ResponseTooLargeError";
  }
}

/**
 * Reads a fetch Response body incrementally, enforcing maxBytes as it goes
 * rather than trusting Content-Length (which an upstream can omit, lie
 * about, or send as a chunked stream) — this is the runtime half of the
 * "응답 크기 상한" requirement from task #3 / plan §5.2.
 */
export async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError(maxBytes);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
