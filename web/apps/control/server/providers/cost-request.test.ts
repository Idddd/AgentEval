import { describe, expect, it } from "vitest";
import { parseBreakdownQuery, parseCostQuery } from "./cost-request";

describe("cost request parsing", () => {
  it("accepts stable snake_case parameters and applies the request Project scope", () => {
    const request = new Request(
      "http://localhost/api/v1/projects/project-a/costs/breakdown" +
      "?start_time=2026-06-01&end_time=2026-06-30&timezone=Asia%2FShanghai" +
      "&project_id=project-a&environment_id=production&group_by=model_endpoint" +
      "&page=2&page_size=50&sort=requests&direction=asc&search=gpt" +
      `&filters=${encodeURIComponent(JSON.stringify({ provider: ["OpenAI"] }))}`,
    );

    expect(parseBreakdownQuery(request)).toMatchObject({
      startTime: "2026-06-01",
      endTime: "2026-06-30",
      timezone: "Asia/Shanghai",
      projectId: "project-a",
      environmentId: "production",
      groupBy: "model_endpoint",
      page: 2,
      pageSize: 50,
      sort: "requests",
      direction: "asc",
      search: "gpt",
      filters: { provider: ["OpenAI"] },
    });
  });

  it("rejects cross-project scope and malformed filters", () => {
    expect(() => parseCostQuery(new Request(
      "http://localhost/api/v1/projects/project-a/costs/summary?start_time=2026-06-01&end_time=2026-06-30&project_id=project-b",
    ))).toThrow("Project access denied");
    expect(() => parseCostQuery(new Request(
      "http://localhost/api/v1/costs/summary?start_time=2026-06-01&end_time=2026-06-30&filters=not-json",
    ))).toThrow();
  });
});
