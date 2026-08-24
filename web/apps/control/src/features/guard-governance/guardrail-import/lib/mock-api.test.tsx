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

  it("persists every source when one Guardrail combines multiple templates", async () => {
    const { result } = renderHook(() => useGuardrailApi(), { wrapper });

    const created = await act(async () =>
      result.current.createGuardrail({
        name: "Combined Protection",
        template_ids: [
          "baseline-pii-protection",
          "prompt-injection-protection",
        ],
        template_parameters: {
          "baseline-pii-protection": {},
          "prompt-injection-protection": {},
        },
      }),
    );

    expect(created.source_template_ids).toEqual([
      "baseline-pii-protection",
      "prompt-injection-protection",
    ]);
    expect(created.source_template_id).toBe("baseline-pii-protection");
    expect(created.controls.length).toBeGreaterThan(0);
    expect(created.purpose).toContain("Baseline PII Protection");
    expect(created.purpose).toContain("Prompt Injection Protection");
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

  it("exposes every built-in Guard policy template with complete metadata", async () => {
    const { result } = renderHook(() => useGuardrailApi(), { wrapper });
    const templates = await result.current.getGuardrailTemplates();

    expect(templates.items.map((item) => item.id)).toEqual([
      "advanced-au-pii-protection",
      "baseline-pii-protection",
      "nsfw-content-filter-australia",
      "nsfw-content-filter-basic",
      "nsfw-content-filter-all-regions",
      "gdpr-eu-pii-protection",
      "eu-ai-act-article5",
      "airline-passenger-data-protection-uae",
      "aviation-operations-security",
      "airline-off-topic-restriction",
      "uae-regulatory-compliance",
      "competitor-mention-detection",
      "topic-filtering",
      "prompt-injection-protection",
      "pdpa-singapore",
      "mas-ai-risk-management",
      "claims-agent-safety",
    ]);
    expect(templates.count).toBe(17);
    expect(
      templates.items.find(
        (item) => item.id === "competitor-mention-detection",
      ),
    ).toMatchObject({
      name: "Competitor Mention Detection",
      source: "LiteLLM OSS · locally built in",
      version: "1.95.0",
      parameters: [
        { name: "brand_name", required: true },
        { name: "competitors", kind: "textarea", required: true },
      ],
      controls: expect.arrayContaining([
        "competitor-input-blocker",
        "competitor-output-blocker",
      ]),
    });
    for (const template of templates.items) {
      expect(template.description).not.toBe("");
      expect(template.domain).not.toBe("");
      expect(template.allowed_topics.length).toBeGreaterThan(0);
      expect(template.restricted_topics.length).toBeGreaterThan(0);
      expect(template.collections?.length).toBeGreaterThan(0);
      expect(template.tags?.length).toBeGreaterThan(0);
      expect(template.limitations?.length).toBeGreaterThan(0);
      expect(template.controls?.length).toBeGreaterThan(0);
    }
  });
});
