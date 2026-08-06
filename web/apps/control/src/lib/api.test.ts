import { describe, expect, it } from "vitest";
import { projectScopedPath } from "./api";

describe("projectScopedPath", () => {
  it("adds the active project to every resource request", () => {
    expect(projectScopedPath("/api/v1/instances", "ai trading")).toBe(
      "/api/v1/projects/ai%20trading/instances",
    );
  });

  it("preserves existing query parameters and replaces stale project context", () => {
    expect(
      projectScopedPath(
        "/api/v1/projects/old/costs/summary?timezone=Asia%2FShanghai",
        "web3",
      ),
    ).toBe(
      "/api/v1/projects/web3/costs/summary?timezone=Asia%2FShanghai",
    );
  });

  it("leaves pre-authentication requests unchanged without a project", () => {
    expect(projectScopedPath("/api/v1/auth/local", null)).toBe(
      "/api/v1/auth/local",
    );
  });
});
