import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { GuardGovernanceProvider } from "../mock-provider";
import { GuardrailImportProvider } from "./guardrail-import-provider";
import type { SupportedLanguage } from "./i18n";
import type { MockScenario } from "./lib/mock-api";

type Options = {
  language?: SupportedLanguage;
  projectId?: string;
  scenario?: MockScenario;
};

export function renderImported(
  node: ReactNode,
  {
    language = "en",
    projectId = "individual",
    scenario = "populated",
  }: Options = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GuardGovernanceProvider projectId={projectId}>
        <GuardrailImportProvider
          projectId={projectId}
          language={language}
          scenario={scenario}
        >
          {node}
        </GuardrailImportProvider>
      </GuardGovernanceProvider>
    </QueryClientProvider>,
  );
}
