/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { EvaluationLayerProvider } from "@/features/evaluation-layer/mock-provider";
import { DemoWorkflowProvider } from "../provider";
import { createDemoWorkflowStore } from "../store";
import type { DemoWorkflowDependencies } from "../model";
import { CreatePage } from "./create-page";

afterEach(cleanup);

function dependencies(): DemoWorkflowDependencies {
  let id = 0;
  return {
    id: () => `create-${++id}`,
    now: () => "2026-08-20T00:00:00.000Z",
    sessionId: () => "create-session",
  };
}

function renderCreatePage(store: ReturnType<typeof createDemoWorkflowStore>) {
  return render(
    <EvaluationLayerProvider projectId="individual">
      <DemoWorkflowProvider projectId="individual" store={store}>
        <CreatePage />
      </DemoWorkflowProvider>
    </EvaluationLayerProvider>,
  );
}

it("shows demo and session Agents together in one Build list", () => {
  const store = createDemoWorkflowStore("individual", dependencies());
  store.createAgent(
    {
      name: "Returns Triage Assistant",
      owner: "Customer Operations",
      description: "Triages return requests.",
      businessOutcome: "Resolve returns faster",
      targetUsers: "Support specialists",
      typicalScenarios: ["Return eligibility"],
      runtimeType: "Managed interactive",
      model: "Demo reasoning model",
      endpoint: "https://demo.invalid/returns",
      mcpIds: [],
      skillIds: [],
      knowledgeBaseIds: [],
    },
    "agent-wizard",
  );
  renderCreatePage(store);

  const agents = screen.getByRole("list", { name: "Agents" });
  expect(within(agents).getAllByRole("listitem")[0]?.textContent)
    .toContain("Onboarding Assistant");
  for (const name of [
    "Office Assistant",
    "Customer Service",
    "Onboarding Assistant",
    "Deployment Monitor",
    "Sample Security Assistant",
    "Returns Triage Assistant",
  ]) {
    expect(agents.textContent).toContain(name);
  }
  expect(screen.queryByRole("heading", { name: "Default cases" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Session drafts" })).toBeNull();
  expect(screen.queryByText("DEMO")).toBeNull();
  expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "Continue to Evaluate" }).getAttribute("href"))
    .toBe("/individual/evaluation/catalog");
});

it("offers the prebuilt MCP, Skill, and Knowledge Base in the Agent form", async () => {
  const user = userEvent.setup();
  const store = createDemoWorkflowStore("individual", dependencies());
  renderCreatePage(store);

  await user.click(screen.getByRole("button", { name: "Create Agent" }));

  expect(screen.getByLabelText("Owner (optional)")).not.toBeNull();
  expect((screen.getByLabelText("Runtime type") as HTMLSelectElement).value).toBe("Managed cloud");
  expect(screen.getByDisplayValue("GPT-5")).not.toBeNull();
  expect(screen.queryByLabelText("Business outcome")).toBeNull();
  expect(screen.queryByLabelText("Target users")).toBeNull();
  expect(screen.queryByLabelText("Typical scenarios")).toBeNull();
  expect(screen.getByRole("button", { name: "Remove Operations MCP" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Remove Document Summarization" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Remove Permission Policy KB" })).not.toBeNull();
});

it("creates prefilled technical resources and an Agent draft in memory", async () => {
  const user = userEvent.setup();
  const store = createDemoWorkflowStore("individual", dependencies());
  renderCreatePage(store);

  await user.click(screen.getByRole("tab", { name: "MCP Server" }));
  await user.click(screen.getByRole("button", { name: "Create MCP Server" }));
  expect(screen.getByDisplayValue("Customer Records MCP")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Create session resource" }));

  await user.click(screen.getByRole("tab", { name: "Skill" }));
  await user.click(screen.getByRole("button", { name: "Create Skill" }));
  await user.click(screen.getByRole("button", { name: "Create session resource" }));

  await user.click(screen.getByRole("tab", { name: "Knowledge Base" }));
  await user.click(screen.getByRole("button", { name: "Create Knowledge Base" }));
  await user.click(screen.getByRole("button", { name: "Create session resource" }));

  await user.click(screen.getByRole("tab", { name: "Agent" }));
  await user.click(screen.getByRole("button", { name: "Create Agent" }));
  expect(screen.getByDisplayValue("Customer Service Assistant")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Create Agent draft" }));

  expect(store.getState().mcpServers.filter((item) => item.source === "SESSION")).toHaveLength(1);
  expect(store.getState().skills.filter((item) => item.source === "SESSION")).toHaveLength(1);
  expect(store.getState().knowledgeBases.filter((item) => item.source === "SESSION")).toHaveLength(1);
  expect(store.getState().agents.map((agent) => agent.name)).toContain(
    "Customer Service Assistant",
  );
  expect(
    store.getState().agentRevisions.find((revision) => revision.source === "SESSION"),
  ).toMatchObject({
    status: "DRAFT",
    mcpIds: ["create-1"],
    skillIds: ["create-3"],
    knowledgeBaseIds: ["create-5"],
  });
  expect(screen.queryByText("SESSION")).toBeNull();
  expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);

  await user.click(
    screen.getByRole("button", { name: "Edit Customer Service Assistant draft" }),
  );
  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Customer Care Assistant");
  await user.clear(screen.getByLabelText("Model"));
  await user.type(screen.getByLabelText("Model"), "GPT-5 mini");
  await user.click(screen.getByRole("button", { name: "Save Agent draft" }));

  expect(store.getState().agents.map((agent) => agent.name)).toContain(
    "Customer Care Assistant",
  );
  expect(
    store.getState().agentRevisions.find((revision) => revision.source === "SESSION")?.model,
  ).toBe("GPT-5 mini");
});

it("clones read-only demo Agents and resources into editable session drafts", async () => {
  const user = userEvent.setup();
  const store = createDemoWorkflowStore("individual", dependencies());
  renderCreatePage(store);

  expect(screen.queryByRole("button", { name: "Clone Office Assistant" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "View Office Assistant build details" }));
  const sheet = screen.getByRole("dialog", { name: "Office Assistant" });
  expect(within(sheet).getByRole("button", { name: "Edit Office Assistant" })).not.toBeNull();
  await user.click(within(sheet).getByRole("button", { name: "Clone Office Assistant" }));
  expect(store.getState().agents.some((agent) => agent.name === "Office Assistant Copy" && agent.source === "SESSION")).toBe(true);
  await user.click(within(sheet).getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "Edit Office Assistant Copy draft" })).not.toBeNull();

  await user.click(screen.getByRole("tab", { name: "Skill" }));
  expect(screen.queryByRole("button", { name: "Clone Document Summarization" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "View Document Summarization details" }));
  const resourceSheet = screen.getByRole("dialog", { name: "Document Summarization" });
  expect(within(resourceSheet).getByRole("button", { name: "Edit Document Summarization" })).not.toBeNull();
  await user.click(within(resourceSheet).getByRole("button", { name: "Clone Document Summarization" }));
  expect(store.getState().skills.some((skill) => skill.name === "Document Summarization Copy" && skill.source === "SESSION")).toBe(true);
  await user.click(within(resourceSheet).getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "View Document Summarization Copy details" })).not.toBeNull();
});

it("shows duplicate-name validation without losing the prefilled form", async () => {
  const user = userEvent.setup();
  const store = createDemoWorkflowStore("individual", dependencies());
  store.createSkill(
    { name: "Case Resolution", description: "Existing skill" },
    "agent-wizard",
  );
  renderCreatePage(store);

  await user.click(screen.getByRole("tab", { name: "Skill" }));
  await user.click(screen.getByRole("button", { name: "Create Skill" }));
  await user.click(screen.getByRole("button", { name: "Create session resource" }));

  expect(screen.getByRole("alert").textContent).toContain("already exists");
  expect(screen.getByDisplayValue("Case Resolution")).not.toBeNull();
});

it("opens a demo Agent build in a right-side detail sheet without a My Builds list", async () => {
  const user = userEvent.setup();
  const store = createDemoWorkflowStore("individual", dependencies());
  renderCreatePage(store);

  expect(screen.getByRole("heading", { name: "Build" })).not.toBeNull();
  expect(screen.queryByRole("tab", { name: "My Builds" })).toBeNull();
  expect(screen.queryByText("Build portfolio")).toBeNull();
  expect(screen.queryByText("View details")).toBeNull();

  await user.click(
    screen.getByRole("button", { name: "View Office Assistant build details" }),
  );

  const sheet = screen.getByRole("dialog", { name: "Office Assistant" });
  const lifecycle = within(sheet).getByRole("list", { name: "Build lifecycle" });
  const version = within(lifecycle).getByRole("combobox", { name: "Build version" });
  expect(within(version).getAllByRole("option")).toHaveLength(2);
  expect((version as HTMLSelectElement).value).toBe("demo-permission-compliance-r2");
  expect(lifecycle.textContent).toContain("EvaluationCompleted");
  expect(within(sheet).getByText("6/8 passed")).not.toBeNull();
  expect(
    sheet.querySelector('a[href="/individual/evaluation/runs/run-permission-baseline"]'),
  ).not.toBeNull();
  expect(
    sheet.querySelector('a[href="/individual/evaluation/reports/report-permission-baseline"]'),
  ).not.toBeNull();
  expect(within(sheet).queryByText("Technical configuration")).toBeNull();
  expect(within(sheet).queryByText("Connected resources")).toBeNull();
  expect(within(sheet).getByText("Agent setup")).not.toBeNull();
  expect(within(sheet).getByText("Managed cloud")).not.toBeNull();
  expect(within(sheet).getByText("GPT-5")).not.toBeNull();

  await user.selectOptions(version, "demo-permission-compliance-r1");
  expect(within(sheet).getByText("Previous build")).not.toBeNull();
  expect(within(sheet).getByText("Not evaluated")).not.toBeNull();
  expect(within(sheet).getByText("No evaluation results")).not.toBeNull();
});

it("opens a session Agent draft from Create and sends it to Evaluate", async () => {
  const user = userEvent.setup();
  const store = createDemoWorkflowStore("individual", dependencies());
  store.createAgent(
    {
      name: "Returns Triage Assistant",
      owner: "Customer Operations",
      description: "Triages return requests.",
      businessOutcome: "Resolve returns faster",
      targetUsers: "Support specialists",
      typicalScenarios: ["Return eligibility"],
      runtimeType: "Managed interactive",
      model: "Demo reasoning model",
      endpoint: "https://demo.invalid/returns",
      mcpIds: [],
      skillIds: [],
      knowledgeBaseIds: [],
    },
    "agent-wizard",
  );
  renderCreatePage(store);

  await user.click(
    screen.getByRole("button", {
      name: "View Returns Triage Assistant build details",
    }),
  );

  const sheet = screen.getByRole("dialog", { name: "Returns Triage Assistant" });
  expect(within(sheet).getByText("Draft")).not.toBeNull();
  await user.click(
    within(sheet).getByRole("button", { name: "Mark ready for Evaluate" }),
  );

  expect(
    store.getState().agentRevisions.find((revision) => revision.source === "SESSION")
      ?.status,
  ).toBe("READY_FOR_VALIDATION");
  expect(within(sheet).getByText("Ready for validation")).not.toBeNull();
});
