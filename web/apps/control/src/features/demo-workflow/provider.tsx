import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { createDemoWorkflowActions } from "./simulation";
import { createDemoWorkflowStore } from "./store";
import type {
  DemoWorkflowActions,
  DemoWorkflowState,
  DemoWorkflowStore,
} from "./model";

interface DemoWorkflowContextValue {
  store: DemoWorkflowStore;
  actions: DemoWorkflowActions;
}

const DemoWorkflowContext = createContext<DemoWorkflowContextValue | null>(
  null,
);

export function DemoWorkflowProvider({
  projectId,
  store: providedStore,
  children,
}: {
  projectId: string;
  store?: DemoWorkflowStore;
  children: ReactNode;
}) {
  const store = useMemo(
    () => providedStore ?? createDemoWorkflowStore(projectId),
    [projectId, providedStore],
  );
  const actions = useMemo(() => createDemoWorkflowActions(store), [store]);
  const context = useMemo(() => ({ store, actions }), [actions, store]);

  useEffect(() => () => actions.dispose(), [actions]);

  return (
    <DemoWorkflowContext.Provider value={context}>
      {children}
    </DemoWorkflowContext.Provider>
  );
}

function useDemoWorkflowContext(): DemoWorkflowContextValue {
  const context = useContext(DemoWorkflowContext);
  if (!context) {
    throw new Error(
      "Demo workflow hooks require DemoWorkflowProvider",
    );
  }
  return context;
}

export function useDemoWorkflowStore(): DemoWorkflowStore {
  return useDemoWorkflowContext().store;
}

export function useDemoWorkflowActions(): DemoWorkflowActions {
  return useDemoWorkflowContext().actions;
}

export function useDemoWorkflowState(): DemoWorkflowState {
  const store = useDemoWorkflowStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
