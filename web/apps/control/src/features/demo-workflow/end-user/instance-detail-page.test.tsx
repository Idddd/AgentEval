import { expect, it } from "vitest";
import { createDemoWorkflowStore } from "../store";
import { toSessionAgent } from "./instance-detail-page";

it("adapts the session OpenClaw Instance to the original Instance Console model", () => {
  const store = createDemoWorkflowStore("individual", { id: () => "openclaw-instance", now: () => "2026-08-24T10:00:00.000Z", sessionId: () => "detail-session" });
  const instance = store.createInstance({ agentId: "fixture-catalog-openclaw-generalist", revisionId: "fixture-catalog-openclaw-generalist-r1", name: "OpenClaw Generalist Pilot", team: "Operations", intendedUse: "Research and automate approved business tasks." }, "end-user");
  store.markInstanceReady(instance.id);

  const agent = toSessionAgent(store.getState(), instance.id);
  expect(agent).toMatchObject({
    id: instance.id,
    name: "OpenClaw Generalist Pilot",
    agentPlatform: "openclaw",
    runtime: "openshell",
    providerName: "OpenAI",
    model: "GPT-5",
    status: "READY",
    httpEndpoint: { status: "READY", url: "https://openclaw.demo.tasklattice.example" },
  });
});
