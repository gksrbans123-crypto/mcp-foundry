import { describe, expect, it } from "vitest";
import { generateSpec } from "./generate.js";
import { MockLLMClient } from "./llm/mock-client.js";

const CLASSIFY_MARKER = "Template ids:";

/** Routes the classify-template prompt to `classifyReply`, any other prompt (descriptor inference) to `inferReply`. */
function router(classifyReply: string, inferReply: string): MockLLMClient {
  return new MockLLMClient((prompt) => (prompt.includes(CLASSIFY_MARKER) ? classifyReply : inferReply));
}

const throwingLlm = new MockLLMClient(() => {
  throw new Error("LLM must not be called for this scenario");
});

const OPENAPI_DOC = {
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/inventory/{sku}": {
      get: {
        summary: "Get inventory status for a product",
        parameters: [{ name: "sku", in: "path", required: true, schema: { type: "string" }, description: "Product SKU." }],
        responses: {
          "200": {
            content: { "application/json": { schema: { properties: { inStock: { type: "boolean" }, quantity: { type: "number" } } } } },
          },
        },
      },
    },
  },
};

const INFERRED_DESCRIPTOR_JSON = JSON.stringify({
  method: "GET",
  url: "https://api.example.com/quote",
  params: [{ name: "symbol", type: "string", description: "Ticker symbol.", in: "query", required: true }],
  responseFieldHints: [{ name: "price", path: "price" }],
  summary: "Get a stock quote",
});

// Plan §8 completion criterion: 5 mock-based sample NL requests, each
// exercising a distinct code path, all without ANTHROPIC_API_KEY.
describe("generateSpec — 5 required sample paths", () => {
  it("1) 날씨 알려주는 서버 — matches the weather template via keyword, no LLM call needed", async () => {
    const result = await generateSpec({ nl: "서울 날씨 알려주는 서버 만들어줘" }, { llm: throwingLlm });
    expect(result.rejected).toBe(false);
    if (result.rejected) return;
    expect(result.spec.tools.some((t) => t.name === "get_current_weather")).toBe(true);
  });

  it("2) 뉴스/트렌드 검색 — no keyword hit, LLM classifies it onto the search template", async () => {
    // Deliberately avoids every template keyword so matchTemplate falls
    // through to its LLM-classification path (search/Wikipedia is the
    // closest curated template to a general "look things up" request —
    // see templates/search.ts's doc comment on the news->search substitution).
    const result = await generateSpec(
      { nl: "요즘 화제인 소식을 알려주는 도구를 만들어줘" },
      { llm: router("search", "unused") },
    );
    expect(result.rejected).toBe(false);
    if (result.rejected) return;
    expect(result.spec.tools.some((t) => t.name === "search_wikipedia")).toBe(true);
  });

  it("3) OpenAPI URL provided — deterministic extraction fallback, no LLM descriptor inference needed", async () => {
    const result = await generateSpec(
      {
        nl: "특정 상품의 재고 현황을 알려주는 도구",
        openapiUrl: "https://api.example.com/openapi.json",
      },
      {
        llm: router("none", "unused"),
        fetchOpenApi: async () => OPENAPI_DOC,
      },
    );
    expect(result.rejected).toBe(false);
    if (result.rejected) return;
    expect(result.spec.tools[0]?.request.urlTemplate).toBe("https://api.example.com/inventory/{sku}");
    // <3 tools from a single-endpoint wrapper, auto-augmented to the minimum.
    expect(result.spec.tools.length).toBe(3);
  });

  it("4) DSL envelope exceeded — rejected before any LLM call, with a reason", async () => {
    const result = await generateSpec(
      { nl: "목록에 있는 도시 각각에 대해 반복해서 조회하면서 온도가 30도 넘으면 알림을 보내는 서버" },
      { llm: throwingLlm },
    );
    expect(result.rejected).toBe(true);
    if (!result.rejected) return;
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("5) tool<3 via pure-NL LLM inference — auto-augmented to 3 and passes validateSpec", async () => {
    const result = await generateSpec(
      { nl: "우리 회사 주가를 조회하는 도구를 만들어줘" },
      { llm: router("none", INFERRED_DESCRIPTOR_JSON) },
    );
    expect(result.rejected).toBe(false);
    if (result.rejected) return;
    expect(result.spec.tools.length).toBe(3);
    expect(new Set(result.spec.tools.map((t) => t.name)).size).toBe(3);
  });
});

describe("generateSpec — additional paths", () => {
  it("rejects with a reason when no template matches and no descriptor can be resolved", async () => {
    const result = await generateSpec({ nl: "완전히 새로운 종류의 요청" }, { llm: router("none", "not json") });
    expect(result.rejected).toBe(true);
    if (!result.rejected) return;
    expect(result.reason).toMatch(/could not determine/);
  });

  it("prefers an explicit endpointDescriptor over OpenAPI extraction and LLM inference", async () => {
    const result = await generateSpec(
      {
        nl: "제품 가격을 알려주는 도구",
        openapiUrl: "https://api.example.com/openapi.json",
        endpointDescriptor: {
          method: "GET",
          url: "https://api.example.com/price/{id}",
          params: [{ name: "id", type: "string", description: "Product id.", in: "path", required: true }],
          responseFieldHints: [{ name: "price", path: "price" }],
          summary: "Get product price",
        },
      },
      { llm: throwingLlm, fetchOpenApi: async () => { throw new Error("must not fetch when descriptor is given"); } },
    );
    expect(result.rejected).toBe(false);
    if (result.rejected) return;
    expect(result.spec.tools[0]?.request.urlTemplate).toBe("https://api.example.com/price/{id}");
  });

  it("falls through to LLM inference when the OpenAPI fetch fails", async () => {
    const result = await generateSpec(
      { nl: "제품 가격을 알려주는 도구", openapiUrl: "https://api.example.com/openapi.json" },
      {
        llm: router("none", INFERRED_DESCRIPTOR_JSON.replace("stock quote", "product price")),
        fetchOpenApi: async () => {
          throw new Error("network error");
        },
      },
    );
    expect(result.rejected).toBe(false);
  });

  it("personalizes the server name for a template match when request.name is given", async () => {
    const result = await generateSpec({ nl: "날씨 서버", name: "My Weather Tool" }, { llm: throwingLlm });
    expect(result.rejected).toBe(false);
    if (result.rejected) return;
    expect(result.spec.name).toBe("My Weather Tool");
  });
});
