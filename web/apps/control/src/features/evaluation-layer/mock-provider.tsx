import {
  createContext,
  useEffect,
  useState,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { cloneEvaluationLayerFixtures } from "./fixture-validation";
import {
  createEvaluationLayerStore,
  type EvaluationLayerStore,
} from "./mock-store";
import type { EvaluationLayerState } from "./model";

const EvaluationLayerStoreContext = createContext<EvaluationLayerStore | null>(
  null,
);

const EvaluationLayerAutoRunContext = createContext<{
  autoRun: boolean;
  setAutoRun(enabled: boolean): void;
} | null>(null);

export function EvaluationLayerProvider({
  projectId,
  children,
  store: providedStore,
}: {
  projectId: string;
  children: ReactNode;
  store?: EvaluationLayerStore;
}) {
  const store = useMemo(
    () => providedStore ?? createEvaluationLayerStore(cloneEvaluationLayerFixtures()),
    [projectId, providedStore],
  );
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  const [autoRun, setAutoRun] = useState(true);
  const selectedRun = state.runs.find(
    (run) => run.id === state.settings.selectedRunId,
  );
  const pendingCase = selectedRun?.results.find(
    (result) => result.status === "PENDING",
  );
  const autoRunContext = useMemo(
    () => ({ autoRun, setAutoRun }),
    [autoRun],
  );

  useEffect(() => {
    store.startSimulation(4000);
    return () => store.stopSimulation();
  }, [store]);

  useEffect(() => {
    if (
      !autoRun ||
      !selectedRun ||
      !["QUEUED", "RUNNING"].includes(selectedRun.status) ||
      !pendingCase
    ) {
      return;
    }
    const timer = setTimeout(() => {
      store.advanceRun(selectedRun.id);
    }, 900);
    return () => clearTimeout(timer);
  }, [
    autoRun,
    pendingCase?.caseId,
    pendingCase?.guardrailTemplateId,
    selectedRun?.id,
    selectedRun?.status,
    store,
  ]);

  return (
    <EvaluationLayerStoreContext value={store}>
      <EvaluationLayerAutoRunContext value={autoRunContext}>
        {children}
      </EvaluationLayerAutoRunContext>
    </EvaluationLayerStoreContext>
  );
}

export function useEvaluationLayerStore(): EvaluationLayerStore {
  const store = useContext(EvaluationLayerStoreContext);
  if (!store) {
    throw new Error(
      "useEvaluationLayerStore must be used inside EvaluationLayerProvider",
    );
  }
  return store;
}

export function useEvaluationLayerState(): EvaluationLayerState {
  const store = useEvaluationLayerStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useEvaluationLayerAutoRun() {
  const context = useContext(EvaluationLayerAutoRunContext);
  if (!context) {
    throw new Error(
      "useEvaluationLayerAutoRun must be used inside EvaluationLayerProvider",
    );
  }
  return context;
}
