import type { CommandResult, EvaluationLayerStore } from "./mock-store";

export function advanceEvaluationScenario(
  store: EvaluationLayerStore,
  runId: string,
): CommandResult<{ complete: boolean }> {
  return store.advanceRun(runId);
}
