import type {
  DemoBusinessEvaluationInput,
  DemoInstance,
  DemoInstanceInput,
  DemoWorkflowActions,
  DemoWorkflowScheduler,
  DemoWorkflowStore,
} from "./model";

const defaultScheduler: DemoWorkflowScheduler = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle),
};

export function createDemoWorkflowActions(
  store: DemoWorkflowStore,
  scheduler: DemoWorkflowScheduler = defaultScheduler,
): DemoWorkflowActions {
  const pending = new Set<ReturnType<typeof setTimeout>>();

  const later = (delayMs: number, callback: () => void) => {
    const handle = scheduler.schedule(() => {
      pending.delete(handle);
      callback();
    }, delayMs);
    pending.add(handle);
  };

  return {
    runTechnicalValidation(revisionId) {
      store.startTechnicalValidation(revisionId, "agent-wizard");
      later(600, () => store.completeTechnicalValidation(revisionId, "PASSED"));
    },
    runBusinessEvaluation(
      revisionId: string,
      input: DemoBusinessEvaluationInput,
    ) {
      store.startBusinessEvaluation(revisionId, input, "admin");
      later(800, () => store.completeBusinessEvaluation(revisionId, "PASSED"));
    },
    provisionInstance(input: DemoInstanceInput): DemoInstance {
      const instance = store.createInstance(input, "end-user");
      later(700, () => store.markInstanceReady(instance.id));
      return instance;
    },
    stopInstance(instanceId: string) {
      store.stopInstance(instanceId, "end-user");
      later(500, () => store.markInstanceStopped(instanceId));
    },
    dispose() {
      for (const handle of pending) scheduler.clear(handle);
      pending.clear();
    },
  };
}
