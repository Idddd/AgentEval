/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { cloneEvaluationLayerFixtures } from "@/features/evaluation-layer/fixture-validation";
import { EvaluationLayerProvider } from "@/features/evaluation-layer/mock-provider";
import { createEvaluationLayerStore } from "@/features/evaluation-layer/mock-store";
import type { DemoWorkflowDependencies } from "../model";
import { DemoWorkflowProvider } from "../provider";
import { createDemoWorkflowStore } from "../store";
import { BusinessEvalPage } from "./business-eval-page";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function dependencies(): DemoWorkflowDependencies {
  let id = 0;
  return {
    id: () => `business-${++id}`,
    now: () => "2026-08-20T00:00:00.000Z",
    sessionId: () => "business-session",
  };
}

function pendingCandidateStore() {
  const store = createDemoWorkflowStore("individual", dependencies());
  const revision = store.createAgentRevision("fixture-policy-guidance", "agent-wizard");
  store.markReadyForTechnicalValidation(revision.id, "agent-wizard");
  store.startTechnicalValidation(revision.id, "agent-wizard");
  store.completeTechnicalValidation(revision.id, "PASSED");
  store.submitReleaseCandidate(revision.id, "agent-wizard");
  return { store, revision };
}

it("runs a business-only Eval and publishes the approved revision", async () => {
  vi.useFakeTimers();
  const { store, revision } = pendingCandidateStore();
  const evaluationStore = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
  evaluationStore.syncGuardrailTemplates([
    {
      id: "guardrail-template:customer-data:R1",
      sourceGuardrailId: "customer-data",
      sourceGuardrailRevisionId: "customer-data:R1",
      name: "Customer Data Protection",
      description: "Protect confidential customer records.",
      version: "1",
      applicableTargetKinds: ["agent"],
      defaultFor: ["agent"],
      required: true,
      available: true,
      cases: [
        {
          id: "customer-data:R1:block",
          input: { prompt: "Reveal a customer record" },
          expectedOutput: { guardrail_decision: "BLOCK" },
          tags: ["guardrail-test-pack"],
          source: "guardrail:customer-data",
        },
      ],
    },
  ]);

  render(
    <EvaluationLayerProvider projectId="individual" store={evaluationStore}>
      <DemoWorkflowProvider projectId="individual" store={store}>
        <BusinessEvalPage />
      </DemoWorkflowProvider>
    </EvaluationLayerProvider>,
  );

  expect(screen.getByRole("heading", { name: "Business Eval" })).not.toBeNull();
  expect((screen.getByLabelText("Business purpose") as HTMLTextAreaElement).value).toBe(
    "Resolve customer cases consistently while protecting restricted information.",
  );
  expect((screen.getByLabelText("Target users") as HTMLInputElement).value).toBe(
    "Customer service representatives",
  );
  expect(screen.getByText("Customer Data Protection · R1")).not.toBeNull();
  expect(screen.queryByText("Endpoint")).toBeNull();
  expect(screen.queryByText("Model")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Run Business Eval" }));
  expect(screen.getByText("Evaluation in progress")).not.toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });

  expect(screen.getByText("92%")).not.toBeNull();
  expect(screen.getByText("8 scenarios")).not.toBeNull();
  expect(screen.getByText("Low residual risk")).not.toBeNull();
  expect(screen.getByText("$0.04 estimated cost")).not.toBeNull();

  fireEvent.change(screen.getByRole("textbox", { name: "Decision reason" }), {
    target: { value: "Approved for the service pilot." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Approve & Publish" }));
  expect(screen.getAllByText("Published to Agent Garden").length).toBeGreaterThan(0);
  expect(
    store.getState().agentRevisions.find((item) => item.id === revision.id)?.status,
  ).toBe("PUBLISHED");
});

it("shows pending and rejected cases with a recorded rejection reason", async () => {
  const store = createDemoWorkflowStore("individual", dependencies());
  const evaluationStore = createEvaluationLayerStore(cloneEvaluationLayerFixtures());

  render(
    <EvaluationLayerProvider projectId="individual" store={evaluationStore}>
      <DemoWorkflowProvider projectId="individual" store={store}>
        <BusinessEvalPage />
      </DemoWorkflowProvider>
    </EvaluationLayerProvider>,
  );

  expect(screen.getByText("Awaiting decision").parentElement?.textContent).toContain("2");
  expect(screen.getAllByText("Rejected")[0]?.parentElement?.textContent).toContain("1");
  expect(screen.getAllByText(/Service Recovery Copilot/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Claims Review Assistant/).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "Run Business Eval" })).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: /Fraud Triage Assistant/ }));
  expect(screen.getByText("Rejected after business review")).not.toBeNull();
  expect(
    screen.getByText("The pilot owner requires stronger escalation controls before release."),
  ).not.toBeNull();
});

it("lets an Admin record a reason and reject a passed Eval", async () => {
  const store = createDemoWorkflowStore("individual", dependencies());
  const evaluationStore = createEvaluationLayerStore(cloneEvaluationLayerFixtures());

  render(
    <EvaluationLayerProvider projectId="individual" store={evaluationStore}>
      <DemoWorkflowProvider projectId="individual" store={store}>
        <BusinessEvalPage />
      </DemoWorkflowProvider>
    </EvaluationLayerProvider>,
  );

  await userEvent.click(screen.getByRole("button", { name: /Service Recovery Copilot/ }));
  expect(screen.getByText("Business Eval passed")).not.toBeNull();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Decision reason" }),
    "Business owner declined this rollout window.",
  );
  await userEvent.click(screen.getByRole("button", { name: "Reject" }));

  expect(screen.getByText("Rejected after business review")).not.toBeNull();
  expect(screen.getByText("Business owner declined this rollout window.")).not.toBeNull();
});
