import {
  supportsNemoClawTui,
  type RunnerHealth,
  type RuntimeStatus,
} from "@tasklattice/contracts";

export function runtimeStatusFromHealth(
  health: RunnerHealth,
): RuntimeStatus {
  const available = health.ok && supportsNemoClawTui(health.mode);
  const transport =
    health.mode === "openshell-kubernetes"
      ? "openshell"
      : health.mode === "nemoclaw"
        ? "nemoclaw"
        : "none";
  return {
    mode: health.mode,
    terminal: {
      available,
      kind: "nemoclaw-tui",
      transport,
      ...(!available
        ? {
            reason:
              health.mode === "fixture"
                ? "The fixture runner validates provisioning only and is not allowed to expose a host shell. Deploy the OpenShell runtime to launch the NemoClaw TUI."
                : "The active runtime cannot launch the NemoClaw TUI.",
          }
        : {}),
    },
  };
}
