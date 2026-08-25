/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvaluationMockProvider } from "@/features/evaluations/mock-provider";
import { api } from "@/lib/api";
import { getPersonalProfile } from "@/services/personal-profile";
import { getProjects } from "@/services/project";

beforeEach(() => {
  vi.stubGlobal("__TALI_UI_DEMO__", true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("UI Demo service integration", () => {
  it("boots the project and profile shell from fixtures without fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network disabled"));

    await expect(getProjects()).resolves.toMatchObject([
      { id: "individual", name: "Demo Project", role: "admin" },
    ]);
    await expect(getPersonalProfile()).resolves.toMatchObject({
      displayName: "Local Administrator",
      username: "admin",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects unsupported legacy API screens locally without fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network disabled"));

    await expect(api.listTraces()).rejects.toMatchObject({
      message: "This feature is not available in the UI Demo.",
      status: 501,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("restores the complete Agent Garden catalog without fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network disabled"));

    const garden = await api.getAgentGarden();

    expect(garden.agents).toHaveLength(19);
    expect(garden.agents.map((agent) => agent.name)).toEqual(
      expect.arrayContaining([
        "OpenClaw Generalist",
        "Hermes Deep Researcher",
        "Customer Service",
        "Global KYC Agent",
      ]),
    );
    expect(garden.agents.filter((agent) => agent.status === "READY")).toHaveLength(18);
    await expect(api.listAgents()).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("constructs the local evaluation store without probing an API", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network disabled"));

    render(
      <EvaluationMockProvider projectId="individual">
        <span>Evaluation ready</span>
      </EvaluationMockProvider>,
    );

    expect(screen.getByText("Evaluation ready")).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
