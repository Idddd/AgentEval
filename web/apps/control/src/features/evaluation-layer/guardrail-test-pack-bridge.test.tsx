/** @vitest-environment jsdom */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cloneGuardGovernanceFixtures } from "@/features/guard-governance/fixtures";
import { GuardGovernanceProvider } from "@/features/guard-governance/mock-provider";
import { createGuardGovernanceStore } from "@/features/guard-governance/store";
import { cloneEvaluationLayerFixtures } from "./fixture-validation";
import { GuardrailTestPackBridge } from "./guardrail-test-pack-bridge";
import { EvaluationLayerProvider } from "./mock-provider";
import { createEvaluationLayerStore } from "./mock-store";

afterEach(cleanup);

describe("GuardrailTestPackBridge", () => {
  it("publishes a validated immutable Guardrail release to Eval without a refresh", async () => {
    const governanceStore = createGuardGovernanceStore(
      cloneGuardGovernanceFixtures("individual"),
      { id: (() => { let value = 0; return () => value++ === 0 ? "guardrail-session" : `generated-${value}`; })() },
    );
    const evaluationStore = createEvaluationLayerStore(cloneEvaluationLayerFixtures());

    render(
      <GuardGovernanceProvider projectId="individual" store={governanceStore}>
        <EvaluationLayerProvider projectId="individual" store={evaluationStore}>
          <GuardrailTestPackBridge />
        </EvaluationLayerProvider>
      </GuardGovernanceProvider>,
    );

    act(() => {
      governanceStore.createGuardrail({
        name: "Session customer boundary",
        purpose: "Protect confidential customer data while permitting approved service guidance.",
        safetyLevel: "strict",
        outputDelivery: "window_buffered",
        allowedTopics: ["Approved service guidance"],
        restrictedTopics: ["Confidential customer data"],
        controls: [{ risk: "topic_control", action: "redirect", enabled: true }],
        policyBindings: [{
          policyId: "policy-prompt-injection",
          policyVersion: "1",
          action: "reject",
          parameterValues: {},
          enabledRuleIds: ["rule-prompt-injection"],
          ruleActions: {},
          enabledRails: ["input"],
        }],
      });
    });

    await waitFor(() => {
      expect(evaluationStore.getState().guardrailTemplates).not.toContainEqual(
        expect.objectContaining({ sourceGuardrailId: "guardrail-session" }),
      );
    });

    act(() => {
      governanceStore.validateGuardrail("guardrail-session");
      governanceStore.publishGuardrail("guardrail-session");
    });

    await waitFor(() => {
      expect(evaluationStore.getState().guardrailTemplates).toContainEqual(
        expect.objectContaining({
          id: "guardrail-template:guardrail-session:R1",
          sourceGuardrailRevisionId: "guardrail-session:R1",
          available: true,
          sourcePolicies: [expect.objectContaining({ id: "policy-prompt-injection", version: "1" })],
        }),
      );
    });
  });
});
