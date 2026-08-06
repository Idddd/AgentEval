import { describe, expect, it } from "vitest";
import {
  demoAgentCard,
  demoAgentDefinitions,
  runDemoAgentMessage,
} from "./demo-agent-runtime";

describe("demo Agent runtime", () => {
  it("publishes the database-backed example store and runtime demos", () => {
    expect(
      demoAgentDefinitions.filter(
        (agent) => agent.integrationType === "a2a",
      ),
    ).toHaveLength(15);
    expect(
      demoAgentDefinitions.filter(
        (agent) => agent.integrationType === "langgraph",
      ),
    ).toHaveLength(1);
    expect(
      demoAgentDefinitions.filter(
        (agent) => agent.catalogKind === "EXAMPLE_BLUEPRINT",
      ),
    ).toHaveLength(12);
  });

  it("publishes an Agent Card with callable skills", () => {
    const card = demoAgentCard("a2a-github-daily-triage");
    expect(card).toMatchObject({
      name: "GitHub Daily Triage",
      protocolVersion: "1.0",
      capabilities: { streaming: false },
    });
    expect(card.supportedInterfaces[0]).toMatchObject({
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    });
    expect(card.skills.map((skill) => skill.id)).toContain(
      "daily-repository-triage",
    );
  });

  it("returns a deterministic A2A message with an interaction trace", () => {
    const response = runDemoAgentMessage(
      "langgraph-support-escalation-router",
      {
        jsonrpc: "2.0",
        id: "preview-1",
        method: "message/send",
        params: {
          message: {
            kind: "message",
            messageId: "message-1",
            role: "user",
            parts: [
              {
                kind: "text",
                text: "Route an enterprise billing outage.",
              },
            ],
          },
        },
      },
    );

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "preview-1",
      result: {
        kind: "message",
        role: "agent",
        metadata: {
          demo: true,
          integrationType: "langgraph",
          trace: [
            "Classify",
            "Policy check",
            "Approval gate",
            "Response handoff",
          ],
        },
      },
    });
    expect(response.result.parts[0]?.text).toContain(
      "LangGraph workflow preview",
    );
  });
});
