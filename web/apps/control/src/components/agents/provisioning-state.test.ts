import { describe, expect, it } from "vitest";
import { resolveProvisioningState } from "./provisioning-state";

describe("resolveProvisioningState", () => {
  it("maps the Pod stage to a stable progress value and active milestone", () => {
    const state = resolveProvisioningState({ stage: "POD", status: "PROVISIONING" });

    expect(state.progress).toBe(58);
    expect(state.statusLabel).toBe("Pod");
    expect(state.stepState(2)).toBe("complete");
    expect(state.stepState(3)).toBe("active");
    expect(state.stepState(4)).toBe("pending");
  });

  it("keeps the failed stage visible instead of reporting false completion", () => {
    const state = resolveProvisioningState({ stage: "RUNTIME", status: "FAILED" });

    expect(state.progress).toBe(78);
    expect(state.statusLabel).toBe("Provisioning failed");
    expect(state.stepState(4)).toBe("failed");
  });
});
