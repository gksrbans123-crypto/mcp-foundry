import { describe, expect, it } from "vitest";
import { checkEnvelope } from "./check-envelope.js";

describe("checkEnvelope", () => {
  it("passes an ordinary single-endpoint request", () => {
    expect(checkEnvelope({ nl: "날씨 알려주는 서버 만들어줘" })).toEqual({ withinEnvelope: true });
  });

  it("rejects a conditional-branching request in English", () => {
    const result = checkEnvelope({ nl: "if the temperature is above 30 then send an alert" });
    expect(result.withinEnvelope).toBe(false);
  });

  it("rejects a conditional-branching request in Korean", () => {
    const result = checkEnvelope({ nl: "온도가 30도가 넘으면 알림을 보내줘" });
    expect(result.withinEnvelope).toBe(false);
  });

  it("rejects other genuine Korean conditionals (존재/실패/이라면)", () => {
    expect(checkEnvelope({ nl: "재고가 없으면 품절이라고 표시해줘" }).withinEnvelope).toBe(false);
    expect(checkEnvelope({ nl: "호출이 실패하면 재시도해줘" }).withinEnvelope).toBe(false);
    expect(checkEnvelope({ nl: "값이 참이라면 A를, 거짓이면 B를 반환해줘" }).withinEnvelope).toBe(false);
  });

  it("does NOT false-positive on ordinary '요청/입력/조회 …하면' request→response phrasing", () => {
    // Regression: "요청하면" (= "when requested") previously tripped the broad
    // "[가-힣]+(으)?면" rule and wrongly rejected plain single-endpoint requests.
    expect(
      checkEnvelope({ nl: "테슬라 주가를 요청하면 현재 테슬라의 주가를 반환하는 MCP 서버를 만들어줘" }).withinEnvelope,
    ).toBe(true);
    expect(checkEnvelope({ nl: "도시를 입력하면 날씨를 알려주는 서버 만들어줘" }).withinEnvelope).toBe(true);
    expect(checkEnvelope({ nl: "단어를 조회하면 뜻을 알려주는 사전 서버" }).withinEnvelope).toBe(true);
    expect(checkEnvelope({ nl: "키워드로 검색하면 결과를 보여주는 서버" }).withinEnvelope).toBe(true);
  });

  it("rejects a looping request in English", () => {
    const result = checkEnvelope({ nl: "for each city in my list, get the weather" });
    expect(result.withinEnvelope).toBe(false);
  });

  it("rejects a looping request in Korean", () => {
    const result = checkEnvelope({ nl: "목록에 있는 도시 각각에 대해 날씨를 조회해줘" });
    expect(result.withinEnvelope).toBe(false);
  });

  it("rejects a chained multi-step request", () => {
    const result = checkEnvelope({ nl: "search for a city then use the result to call the weather API" });
    expect(result.withinEnvelope).toBe(false);
  });

  it("rejects a request whose endpointDescriptor requires authentication", () => {
    const result = checkEnvelope({
      nl: "get my private account balance",
      endpointDescriptor: {
        method: "GET",
        url: "https://api.example.com/balance",
        params: [],
        auth: { type: "bearer" },
        responseFieldHints: [{ name: "balance", path: "balance" }],
        summary: "Get balance",
      },
    });
    expect(result.withinEnvelope).toBe(false);
    if (!result.withinEnvelope) expect(result.reason).toMatch(/authenticated/);
  });

  it("passes a request whose endpointDescriptor explicitly declares no auth", () => {
    const result = checkEnvelope({
      nl: "get public widget info",
      endpointDescriptor: {
        method: "GET",
        url: "https://api.example.com/widgets",
        params: [],
        auth: { type: "none" },
        responseFieldHints: [{ name: "count", path: "count" }],
        summary: "List widgets",
      },
    });
    expect(result.withinEnvelope).toBe(true);
  });
});
