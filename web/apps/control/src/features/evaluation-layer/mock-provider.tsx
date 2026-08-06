import {
  createContext,
  useEffect,
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

export function EvaluationLayerProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const store = useMemo(
    () => createEvaluationLayerStore(cloneEvaluationLayerFixtures()),
    [projectId],
  );
  useEffect(() => {
    store.startSimulation(4000);
    return () => store.stopSimulation();
  }, [store]);
  return (
    <EvaluationLayerStoreContext value={store}>
      {children}
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
