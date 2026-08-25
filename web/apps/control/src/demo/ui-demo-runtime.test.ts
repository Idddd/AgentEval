import { afterEach, describe, expect, it, vi } from "vitest";
import { uiDemoRuntime } from "./ui-demo-runtime";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("uiDemoRuntime", () => {
  it("signs in only with the built-in Demo administrator without network access", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(uiDemoRuntime.login("admin", "admin")).resolves.toEqual({
      token: "tali-ui-demo-admin",
    });
    await expect(uiDemoRuntime.login("admin", "wrong")).rejects.toThrow(
      "Sign in failed.",
    );
    await expect(uiDemoRuntime.login("someone", "admin")).rejects.toThrow(
      "Sign in failed.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves only the deterministic Demo token to the local administrator", async () => {
    await expect(
      uiDemoRuntime.currentUser("tali-ui-demo-admin"),
    ).resolves.toMatchObject({
      displayName: "Local Administrator",
      provider: "local",
      systemRole: "super_administrator",
      username: "admin",
    });
    await expect(uiDemoRuntime.currentUser("invalid")).rejects.toThrow(
      "Your session is no longer valid.",
    );
  });

  it("returns fresh project and profile fixtures after caller mutation", async () => {
    const projects = await uiDemoRuntime.listProjects();
    projects[0]!.name = "Changed by caller";
    const profile = await uiDemoRuntime.getProfile();
    profile.city = "Changed by caller";

    expect(await uiDemoRuntime.listProjects()).toEqual([
      {
        id: "individual",
        memberCount: 1,
        name: "Demo Project",
        role: "admin",
        type: "personal",
      },
    ]);
    expect(await uiDemoRuntime.getProfile()).toMatchObject({
      city: "San Francisco",
      displayName: "Local Administrator",
      email: "admin@demo.local",
      systemRole: "super_administrator",
      username: "admin",
    });
  });

  it("returns a deterministic Agent Garden response without network access", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      uiDemoRuntime.tryAgent("office-assistant", "What is the weather?"),
    ).resolves.toMatchObject({
      agentId: "office-assistant",
      prompt: "What is the weather?",
      status: "completed",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
