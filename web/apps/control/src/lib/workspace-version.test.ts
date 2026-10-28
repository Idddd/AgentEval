import { expect, it } from "vitest";
import { isMockWorkspace, workspaceVersion } from "./workspace-version";
it("defaults to V2 while retaining the explicit V1 entry", () => {
  expect(workspaceVersion("https://marketplace.internal/")).toBe("v2");
  expect(workspaceVersion("https://marketplace.internal/guardrails")).toBe("v2");
  expect(workspaceVersion("https://marketplace.internal/v1/guardrails")).toBe("v1");
  expect(workspaceVersion("https://marketplace.internal/v2/guardrails")).toBe("v2");
  expect(workspaceVersion("/v3/guardrails?role=tech#Guardrail/tests/")).toBe("v3");
});

it("keeps the old mock prefix as a compatible alias", () => {
  expect(workspaceVersion("/v2-mock/guardrails?role=tech#Guardrail/repository/")).toBe("v2-mock");
  expect(workspaceVersion("/v2-mock")).toBe("v2-mock");
  expect(workspaceVersion("/v2-mockery/guardrails")).toBe("v2");
});

it("selects mock data only for V2 and its legacy alias", () => {
  expect(isMockWorkspace("v2")).toBe(true);
  expect(isMockWorkspace("v2-mock")).toBe(true);
  expect(isMockWorkspace("v3")).toBe(false);
  expect(isMockWorkspace("v1")).toBe(false);
});
