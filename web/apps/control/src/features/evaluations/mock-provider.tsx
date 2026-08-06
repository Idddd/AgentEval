import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { cloneEvaluationFixtures } from "./fixture-validation";
import {
  createEvaluationStore,
  type EvaluationStore,
} from "./mock-store";
import type { EvaluationState } from "./model";

const EvaluationStoreContext = createContext<EvaluationStore | null>(null);

export function EvaluationMockProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const store = useMemo(
    () => createEvaluationStore(cloneEvaluationFixtures()),
    [projectId],
  );
  return (
    <EvaluationStoreContext value={store}>
      {children}
    </EvaluationStoreContext>
  );
}

export function useEvaluationStore(): EvaluationStore {
  const store = useContext(EvaluationStoreContext);
  if (!store) {
    throw new Error(
      "useEvaluationStore must be used inside EvaluationMockProvider",
    );
  }
  return store;
}

export function useEvaluationState(): EvaluationState {
  const store = useEvaluationStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
