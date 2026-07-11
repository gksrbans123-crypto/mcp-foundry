import { describe, expect, it } from "vitest";
import { MockLLMClient } from "../llm/mock-client.js";
import { TEMPLATES } from "../templates/index.js";
import { matchTemplate } from "./match-template.js";

const unusedLlm = new MockLLMClient(() => {
  throw new Error("LLM should not be called when a keyword match is found");
});

describe("matchTemplate", () => {
  it("matches the weather template on a Korean keyword without calling the LLM", async () => {
    const match = await matchTemplate("서울 날씨 알려주는 서버 만들어줘", TEMPLATES, unusedLlm);
    expect(match?.id).toBe("weather");
  });

  it("matches the search template on an English keyword", async () => {
    const match = await matchTemplate("I want a wikipedia search tool", TEMPLATES, unusedLlm);
    expect(match?.id).toBe("search");
  });

  it("matches the currency template on a Korean keyword", async () => {
    const match = await matchTemplate("환율 조회 서버", TEMPLATES, unusedLlm);
    expect(match?.id).toBe("currency");
  });

  it("does not keyword-match the currency template on a stock-trading request", async () => {
    const llm = new MockLLMClient("none");
    const match = await matchTemplate("키움증권 REST API로 주식 매수/매도 주문과 계좌 잔고를 조회하는 MCP 서버", TEMPLATES, llm);
    expect(match).toBeNull();
  });

  it("does not keyword-match the currency template on an English stock request", async () => {
    const llm = new MockLLMClient("none");
    const match = await matchTemplate("an MCP server for stock trading with my brokerage account", TEMPLATES, llm);
    expect(match).toBeNull();
  });

  it("falls back to the LLM classifier when no keyword matches", async () => {
    const llm = new MockLLMClient("weather");
    const match = await matchTemplate("tell me what it's like outside right now", TEMPLATES, llm);
    expect(match?.id).toBe("weather");
  });

  it("returns null when the LLM classifier says none", async () => {
    const llm = new MockLLMClient("none");
    const match = await matchTemplate("build me a todo list manager", TEMPLATES, llm);
    expect(match).toBeNull();
  });

  it("returns null when the LLM returns an unrecognized id", async () => {
    const llm = new MockLLMClient("garbage-id");
    const match = await matchTemplate("build me a todo list manager", TEMPLATES, llm);
    expect(match).toBeNull();
  });
});
