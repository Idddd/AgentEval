/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { useLayoutEffect, type ComponentType, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { DemoRoleProvider, useDemoRole, type DemoPersona } from "@/hooks/use-demo-role";
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
  useProject: () => ({ currentProject: { role: "admin" } }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function SelectPersona({ persona, children }: { persona: DemoPersona; children: ReactNode }) {
  const { setPersona } = useDemoRole();
  useLayoutEffect(() => {
    setPersona(persona);
  }, [persona, setPersona]);
  return children;
}

function renderRoute(
  route: { options: { component?: ComponentType } },
  persona: "admin" | "agent-wizard",
) {
  const Page = route.options.component!;
  const workflowStore = createDemoWorkflowStore("individual");
  const evaluationStore = createEvaluationLayerStore(cloneEvaluationLayerFixtures());
  const Passthrough = ({ children }: { children: ReactNode }) => <>{children}</>;
  const BridgeProvider = ((workflowProviderModule as unknown as {
    BuildEvaluationBridgeProvider?: ComponentType<{ children: ReactNode }>;
  }).BuildEvaluationBridgeProvider ?? Passthrough);
  render(
    <DemoRoleProvider>
      <SelectPersona persona={persona}>
        <EvaluationLayerProvider projectId="individual" store={evaluationStore}>
          <DemoWorkflowProvider projectId="individual" store={workflowStore}>
            <BridgeProvider>
              <Page />
            </BridgeProvider>
          </DemoWorkflowProvider>
        </EvaluationLayerProvider>
      </SelectPersona>
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
