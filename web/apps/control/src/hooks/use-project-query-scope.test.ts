import { describe, expect, it } from "vitest";
import { projectQueryKey } from "./use-project-query-scope";

describe("projectQueryKey", () => {
  it("isolates the same resource key by project", () => {
    expect(projectQueryKey("individual", "cost", "summary")).not.toEqual(
      projectQueryKey("devops", "cost", "summary"),
    );
  });

  it("keeps the project prefix available for targeted invalidation", () => {
    expect(projectQueryKey("devops", "instances")).toEqual([
      "project",
      "devops",
      "instances",
    ]);
  });
});
