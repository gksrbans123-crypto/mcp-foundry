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
