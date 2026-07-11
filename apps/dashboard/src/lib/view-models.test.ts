import { describe, expect, it } from "vitest";
import { MOCK_SERVERS } from "./mock-data";
import { SERVER_STATUS_FILTERS } from "./status-labels";
import { buildFilterCounts, filterServers, formatTimestamp, toServerCardViewModel } from "./view-models";

describe("toServerCardViewModel (mock data snapshot)", () => {
  it("renders a stable view model per mock server", () => {
    expect(MOCK_SERVERS.map(toServerCardViewModel)).toMatchSnapshot();
  });
});

describe("buildFilterCounts (mock data snapshot)", () => {
  it("counts every filter tab consistently against the mock fixtures", () => {
    expect(buildFilterCounts(MOCK_SERVERS)).toMatchSnapshot();
  });

  it("has one server in every non-'all' bucket", () => {
    const counts = buildFilterCounts(MOCK_SERVERS);
    for (const { filter, count } of counts) {
      if (filter === "all") continue;
      expect(count).toBe(1);
    }
  });
});

describe("filterServers", () => {
  it("'all' returns every server", () => {
    expect(filterServers(MOCK_SERVERS, "all")).toHaveLength(MOCK_SERVERS.length);
  });

  it.each(SERVER_STATUS_FILTERS.filter((f) => f !== "all"))("'%s' returns only that status", (filter) => {
    const result = filterServers(MOCK_SERVERS, filter);
    expect(result.every((server) => server.status === filter)).toBe(true);
  });
});

describe("formatTimestamp", () => {
  it("formats an ISO string as UTC 'YYYY-MM-DD HH:mm' regardless of host timezone", () => {
    expect(formatTimestamp("2026-06-02T01:05:00.000Z")).toBe("2026-06-02 01:05");
  });
});
