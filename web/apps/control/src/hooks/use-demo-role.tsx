import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { ProjectRole } from "@/types/project";

const STORAGE_KEY = "tasklattice.demo-role";

const PROJECT_ROLES: readonly ProjectRole[] = ["admin", "member", "compliance", "ada", "frt", "iss"];

function readStoredOverride(): ProjectRole | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return PROJECT_ROLES.includes(stored as ProjectRole)
      ? (stored as ProjectRole)
      : null;
  } catch {
    return null;
  }
}

export interface DemoRoleContextValue {
  /**
   * Frontend-only "view as" override used to demo role-based access control.
   * `null` means the real project role is used. Never sent to the backend.
   */
  roleOverride: ProjectRole | null;
  setRoleOverride: (role: ProjectRole | null) => void;
}

const DemoRoleContext = createContext<DemoRoleContextValue>({
  roleOverride: null,
  setRoleOverride: () => undefined,
});

export function DemoRoleProvider({ children }: { children: ReactNode }) {
  const [roleOverride, setRoleOverrideState] = useState<ProjectRole | null>(
    readStoredOverride,
  );
  const setRoleOverride = (role: ProjectRole | null) => {
    setRoleOverrideState(role);
    try {
      if (role) window.localStorage.setItem(STORAGE_KEY, role);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable (private mode); keep the in-memory override.
    }
  };
  return (
    <DemoRoleContext value={{ roleOverride, setRoleOverride }}>
      {children}
    </DemoRoleContext>
  );
}

export function useDemoRole(): DemoRoleContextValue {
  return useContext(DemoRoleContext);
}
