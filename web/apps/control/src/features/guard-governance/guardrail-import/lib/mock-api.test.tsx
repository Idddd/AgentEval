/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { GuardGovernanceProvider } from "../../mock-provider";
import { GuardrailMockApiProvider, useGuardrailApi } from "./mock-api";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <GuardGovernanceProvider projectId="individual">
      <GuardrailMockApiProvider>{children}</GuardrailMockApiProvider>
    </GuardGovernanceProvider>
  );
}

function scenarioWrapper(scenario: "empty" | "error") {
  return function ScenarioWrapper({ children }: { children: ReactNode }) {
    return (
      <GuardGovernanceProvider projectId="individual">
        <GuardrailMockApiProvider scenario={scenario}>
          {children}
        </GuardrailMockApiProvider>
      </GuardGovernanceProvider>
    );
  };
}

describe("Guard-compatible mock API", () => {
  it("returns complete snake_case Guard structures without fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useGuardrailApi(), { wrapper });

    const collection = await result.current.getGuardrails();
    const detail = await result.current.getGuardrail("guardrail-production");

    expect(collection.items.length).toBeGreaterThan(1);
    expect(detail).toMatchObject({
      tested_current: true,
      latest_test_run: { results: expect.any(Array) },
    });
    expect(detail.latest_test_run?.results[0]).toMatchObject({
      findings: expect.any(Array),
      trace: expect.any(Array),
    });
    expect(
      detail.latest_test_run?.results.some((item) =>
        item.findings.some(
          (entry) =>
            entry.grounding?.length &&
            entry.claims?.length &&
            entry.reasoning?.length,
        ),
      ),
    ).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("persists mutations and creates immutable versions", async () => {
    const { result } = renderHook(() => useGuardrailApi(), { wrapper });

    await act(async () => {
      await result.current.createTestRun("guardrail-production");
    });
    const versions = await result.current.getGuardrailVersions(
      "guardrail-production",
    );

    expect(versions.items.at(0)?.active).toBe(true);
  });

  it("provides deterministic empty and error scenarios", async () => {
    const emptyHook = renderHook(() => useGuardrailApi(), {
      wrapper: scenarioWrapper("empty"),
    });
    await expect(emptyHook.result.current.getGuardrails()).resolves.toEqual({
      items: [],
      count: 0,
    });

    const errorHook = renderHook(() => useGuardrailApi(), {
      wrapper: scenarioWrapper("error"),
    });
    await expect(errorHook.result.current.getGuardrails()).rejects.toThrow(
      "Mock Guardrail request failed",
    );
  });
});
