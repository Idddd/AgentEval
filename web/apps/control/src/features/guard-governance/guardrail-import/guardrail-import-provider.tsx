import { useMemo, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { Toaster } from "./components/ui/sonner";
import "./guardrail-theme.css";
import { createGuardrailI18n, type SupportedLanguage } from "./i18n";
import { GuardAuthProvider } from "./lib/auth-compat";
import { GuardrailMockApiProvider, type MockScenario } from "./lib/mock-api";

export function GuardrailImportProvider({
  children,
  language = "en",
  scenario = "populated",
}: {
  children: ReactNode;
  projectId: string;
  language?: SupportedLanguage;
  scenario?: MockScenario;
}) {
  const i18n = useMemo(() => createGuardrailI18n(language), [language]);
  return (
    <I18nextProvider i18n={i18n}>
      <GuardAuthProvider preferredLanguage={language}>
        <GuardrailMockApiProvider scenario={scenario}>
          <div className="guardrail-import min-w-0">{children}</div>
          <Toaster position="bottom-right" richColors />
        </GuardrailMockApiProvider>
      </GuardAuthProvider>
    </I18nextProvider>
  );
}
