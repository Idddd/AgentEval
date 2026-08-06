import type { AgentStatus, ProvisioningStage } from "@tasklattice/contracts";

export type ProvisioningStepState = "active" | "complete" | "failed" | "pending";

export const provisioningStageDefinitions = [
  { id: "QUEUED", label: "Queued", description: "Request accepted", progress: 8 },
  { id: "PROVIDER", label: "Provider", description: "Prepare inference", progress: 20 },
  { id: "SANDBOX", label: "Sandbox", description: "Apply isolation policy", progress: 38 },
  { id: "POD", label: "Pod", description: "Create and initialize Pod", progress: 58 },
  { id: "RUNTIME", label: "Runtime", description: "Start Agent services in OpenShell", progress: 78 },
  { id: "ENDPOINT", label: "Endpoint", description: "Publish Web UI", progress: 92 },
  { id: "READY", label: "Ready", description: "Runtime available", progress: 100 },
] as const satisfies ReadonlyArray<{
  description: string;
  id: ProvisioningStage;
  label: string;
  progress: number;
}>;

export function resolveProvisioningState({
  stage,
  status,
}: {
  stage?: ProvisioningStage;
  status: AgentStatus;
}) {
  const resolvedStage = status === "READY" ? "READY" : stage ?? "QUEUED";
  const matchedIndex = provisioningStageDefinitions.findIndex((item) => item.id === resolvedStage);
  const activeIndex = Math.max(0, matchedIndex);
  const definition = provisioningStageDefinitions[activeIndex] ?? provisioningStageDefinitions[0];
  const failed = status === "FAILED";
  const destroying = status === "DESTROYING";

  return {
    activeIndex,
    definition,
    progress: definition.progress,
    statusDescription: failed
      ? "Provisioning stopped before the runtime became available."
      : destroying
        ? "The runtime resources are being removed."
        : definition.description,
    statusLabel: failed ? "Provisioning failed" : destroying ? "Removing runtime" : definition.label,
    stepState: (index: number): ProvisioningStepState => {
      if (index < activeIndex || resolvedStage === "READY") return "complete";
      if (index === activeIndex) return failed ? "failed" : "active";
      return "pending";
    },
  };
}
