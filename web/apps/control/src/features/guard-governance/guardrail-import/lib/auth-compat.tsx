import { createContext, useContext, type ReactNode } from "react";
import type { SupportedLanguage } from "../i18n";

type GuardAuthValue = {
  user: {
    id: string;
    display_name: string;
    email: string;
    role: "admin";
    enabled: true;
    preferred_language: SupportedLanguage;
    last_login_at: string | null;
    created_at: string;
    updated_at: string;
  };
};

const GuardAuthContext = createContext<GuardAuthValue | null>(null);

export function GuardAuthProvider({
  children,
  preferredLanguage,
}: {
  children: ReactNode;
  preferredLanguage: SupportedLanguage;
}) {
  const timestamp = "2026-08-11T07:30:00.000Z";
  return (
    <GuardAuthContext.Provider
      value={{
        user: {
          id: "mock-admin",
          display_name: "AgentEval Administrator",
          email: "admin@agenteval.local",
          role: "admin",
          enabled: true,
          preferred_language: preferredLanguage,
          last_login_at: timestamp,
          created_at: timestamp,
          updated_at: timestamp,
        },
      }}
    >
      {children}
    </GuardAuthContext.Provider>
  );
}

export function useGuardAuth() {
  const value = useContext(GuardAuthContext);
  if (!value) throw new Error("useGuardAuth requires GuardAuthProvider");
  return value;
}

export { useGuardAuth as useAuth };
