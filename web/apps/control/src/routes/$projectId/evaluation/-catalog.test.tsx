/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { DemoRoleProvider } from "@/hooks/use-demo-role";
import { cloneEvaluationLayerFixtures } from "@/features/evaluation-layer/fixture-validation";
import { EvaluationLayerProvider } from "@/features/evaluation-layer/mock-provider";
import { createEvaluationLayerStore } from "@/features/evaluation-layer/mock-store";
import { DemoWorkflowProvider } from "@/features/demo-workflow/provider";
import * as workflowProviderModule from "@/features/demo-workflow/provider";
import { createDemoWorkflowStore } from "@/features/demo-workflow/store";
import { Route as CatalogRoute } from "./catalog";
import { Route as TechnicalValidationRoute } from "../technical-validation";

vi.mock("@/hooks/use-project", () => ({
  useCurrentProjectId: () => "individual",
}));

vi.mock("@/hooks/use-project-permissions", () => ({
  useEffectiveProjectRole: () =>
    window.localStorage.getItem("tasklattice.demo-role") === "agent-wizard"
      ? "member"
      : "admin",
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderRoute(
  route: { options: { component?: ComponentType } },
  persona: "admin" | "agent-wizard",
) {
  window.localStorage.setItem("tasklattice.demo-role", persona);
  const Page = route.options.component!;
  const workflowStore = createDemoWorkflowStore("individual");
  const evaluationStore = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
  const Passthrough = ({ children }: { children: ReactNode }) => <>{children}</>;
  const BridgeProvider = ((workflowProviderModule as unknown as {
    BuildEvaluationBridgeProvider?: ComponentType<{ children: ReactNode }>;
  }).BuildEvaluationBridgeProvider ?? Passthrough);
  render(
    <DemoRoleProvider>
      <EvaluationLayerProvider projectId="individual" store={evaluationStore}>
        <DemoWorkflowProvider projectId="individual" store={workflowStore}>
          <BridgeProvider>
            <Page />
          </BridgeProvider>
        </DemoWorkflowProvider>
      </EvaluationLayerProvider>
    </DemoRoleProvider>,
  );
}

it("renders original Evaluate for Agent Wizard and Business Eval for Admin", () => {
  renderRoute(CatalogRoute, "agent-wizard");
  expect(screen.getByRole("heading", { name: "Evaluate" })).not.toBeNull();
  cleanup();

  renderRoute(CatalogRoute, "admin");
  expect(screen.getByRole("heading", { name: "Business Eval" })).not.toBeNull();
});

it("keeps Technical Validation as a compatibility URL for Evaluate", () => {
  renderRoute(TechnicalValidationRoute, "agent-wizard");
  expect(screen.getByRole("heading", { name: "Evaluate" })).not.toBeNull();
  expect(screen.queryByRole("heading", { name: "Technical Validation" })).toBeNull();
});
