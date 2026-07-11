import { describe, expect, it } from "vitest";
import { MockLLMClient } from "../llm/mock-client.js";
import { inferEndpointDescriptor } from "./infer.js";

const VALID_DESCRIPTOR_JSON = JSON.stringify({
  method: "GET",
  url: "https://api.example.com/quote",
  params: [{ name: "symbol", type: "string", description: "Ticker symbol.", in: "query", required: true }],
  responseFieldHints: [{ name: "price", path: "price" }],
  summary: "Get a quote",
});

describe("inferEndpointDescriptor", () => {
  it("parses a valid descriptor on the first attempt", async () => {
    const llm = new MockLLMClient(VALID_DESCRIPTOR_JSON);
    const descriptor = await inferEndpointDescriptor("get me a stock quote", llm);
    expect(descriptor).not.toBeNull();
    expect(descriptor?.summary).toBe("Get a quote");
  });

  it("tolerates a markdown-fenced response", async () => {
    const llm = new MockLLMClient(`\`\`\`json\n${VALID_DESCRIPTOR_JSON}\n\`\`\``);
    const descriptor = await inferEndpointDescriptor("get me a stock quote", llm);
    expect(descriptor).not.toBeNull();
  });

  it("retries once after invalid JSON, then succeeds", async () => {
    let calls = 0;
    const llm = new MockLLMClient(() => {
      calls += 1;
      return calls === 1 ? "not json" : VALID_DESCRIPTOR_JSON;
    });
    const descriptor = await inferEndpointDescriptor("get me a stock quote", llm);
    expect(calls).toBe(2);
    expect(descriptor).not.toBeNull();
  });

  it("returns null after exhausting the retry on persistently invalid JSON", async () => {
    let calls = 0;
    const llm = new MockLLMClient(() => {
      calls += 1;
      return "still not json";
    });
    const descriptor = await inferEndpointDescriptor("get me a stock quote", llm);
    expect(calls).toBe(2);
    expect(descriptor).toBeNull();
  });

  it("returns null when the JSON is well-formed but fails schema validation", async () => {
    const llm = new MockLLMClient(JSON.stringify({ method: "DELETE", url: "https://x", params: [], responseFieldHints: [], summary: "x" }));
    const descriptor = await inferEndpointDescriptor("do something unsupported", llm);
    expect(descriptor).toBeNull();
  });
});
