/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
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

it("creates prefilled technical resources and an Agent draft in memory", async () => {
  const user = userEvent.setup();
  const store = createDemoWorkflowStore("individual", dependencies());
  render(
    <DemoWorkflowProvider projectId="individual" store={store}>
      <CreatePage />
    </DemoWorkflowProvider>,
  );

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

  expect(store.getState().mcpServers).toHaveLength(1);
  expect(store.getState().skills).toHaveLength(1);
  expect(store.getState().knowledgeBases).toHaveLength(1);
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
  expect(screen.getAllByText("SESSION").length).toBeGreaterThan(0);
});

it("shows duplicate-name validation without losing the prefilled form", async () => {
  const user = userEvent.setup();
  const store = createDemoWorkflowStore("individual", dependencies());
  store.createSkill(
    { name: "Case Resolution", description: "Existing skill" },
    "agent-wizard",
  );
  render(
    <DemoWorkflowProvider projectId="individual" store={store}>
      <CreatePage />
    </DemoWorkflowProvider>,
  );

  await user.click(screen.getByRole("tab", { name: "Skill" }));
  await user.click(screen.getByRole("button", { name: "Create Skill" }));
  await user.click(screen.getByRole("button", { name: "Create session resource" }));

  expect(screen.getByRole("alert").textContent).toContain("already exists");
  expect(screen.getByDisplayValue("Case Resolution")).not.toBeNull();
});

it("combines Create and My Builds under one Build workspace", async () => {
  const user = userEvent.setup();
  const store = createDemoWorkflowStore("individual", dependencies());
  render(
    <DemoWorkflowProvider projectId="individual" store={store}>
      <CreatePage />
    </DemoWorkflowProvider>,
  );

  expect(screen.getByRole("heading", { name: "Build" })).not.toBeNull();
  expect(screen.getByRole("tab", { name: "Create" }).getAttribute("data-state")).toBe("active");

  await user.click(screen.getByRole("tab", { name: "My Builds" }));

  expect(screen.getByText("Build portfolio")).not.toBeNull();
  expect(screen.queryByRole("heading", { name: "My Builds" })).toBeNull();
});
