import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { createApiEvaluationStore } from "./api-store";
import { createEvaluationStore, type EvaluationStore } from "./mock-store";
import { cloneEvaluationFixtures } from "./fixture-validation";
import { isUiDemoBuild } from "@/demo/ui-demo-runtime";
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
    () => isUiDemoBuild()
      ? createEvaluationStore(cloneEvaluationFixtures())
      : createApiEvaluationStore({}),
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
