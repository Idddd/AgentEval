import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { cloneGuardGovernanceFixtures } from "./fixtures";
import {
  createGuardGovernanceStore,
  type GuardGovernanceStore,
} from "./store";

const GuardGovernanceStoreContext =
  createContext<GuardGovernanceStore | null>(null);

export function GuardGovernanceProvider({
  children,
  projectId,
  store: providedStore,
}: {
  children: ReactNode;
  projectId: string;
  store?: GuardGovernanceStore;
}) {
  const store = useMemo(
    () =>
      providedStore ?? createGuardGovernanceStore(cloneGuardGovernanceFixtures(projectId)),
    [projectId, providedStore],
  );
  return (
    <GuardGovernanceStoreContext.Provider value={store}>
      {children}
    </GuardGovernanceStoreContext.Provider>
  );
}

export function useGuardGovernanceStore() {
  const store = useContext(GuardGovernanceStoreContext);
  if (!store) {
    throw new Error(
      "Guard Governance hooks require GuardGovernanceProvider",
    );
  }
  return store;
}

export function useGuardGovernanceState() {
  const store = useGuardGovernanceStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
