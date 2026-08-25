import { createContext, useContext, useState, type ReactNode } from "react";
import type { ProjectRole } from "@/types/project";

export type DemoPersona = "admin" | "agent-wizard" | "end-user";

export const DEMO_PERSONAS: ReadonlyArray<{
  value: DemoPersona;
  label: string;
}> = [
  { value: "admin", label: "Admin" },
  { value: "agent-wizard", label: "Agent Wizard" },
  { value: "end-user", label: "End user" },
];

export function projectRoleForDemoPersona(persona: DemoPersona): ProjectRole {
  if (persona === "agent-wizard") return "member";
  if (persona === "end-user") return "frt";
  return "admin";
}

function personaForLegacyRole(role: ProjectRole | null): DemoPersona {
  if (role === "member" || role === "ada" || role === "iss") return "agent-wizard";
  if (role === "frt") return "end-user";
  return "admin";
}

export interface DemoRoleContextValue {
  persona: DemoPersona;
  setPersona: (persona: DemoPersona) => void;
  /** Existing permission consumers continue to receive a ProjectRole. */
  roleOverride: ProjectRole;
  setRoleOverride: (role: ProjectRole | null) => void;
}

const DemoRoleContext = createContext<DemoRoleContextValue>({
  persona: "admin",
  setPersona: () => undefined,
  roleOverride: "admin",
  setRoleOverride: () => undefined,
});

export function DemoRoleProvider({ children }: { children: ReactNode }) {
  const [persona, setPersona] = useState<DemoPersona>("admin");
  const setRoleOverride = (role: ProjectRole | null) => {
    setPersona(personaForLegacyRole(role));
  };

  return (
    <DemoRoleContext
      value={{
        persona,
        setPersona,
        roleOverride: projectRoleForDemoPersona(persona),
        setRoleOverride,
      }}
    >
      {children}
    </DemoRoleContext>
  );
}

export function useDemoRole(): DemoRoleContextValue {
  return useContext(DemoRoleContext);
}
