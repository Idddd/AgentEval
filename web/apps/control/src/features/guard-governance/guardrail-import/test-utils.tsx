import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { GuardGovernanceProvider } from "../mock-provider";
import { GuardrailImportProvider } from "./guardrail-import-provider";
import type { SupportedLanguage } from "./i18n";
import type { MockScenario } from "./lib/mock-api";
import type { GuardGovernanceStore } from "../store";
import { TooltipProvider } from "@/components/ui/tooltip";

type Options = {
  language?: SupportedLanguage;
  projectId?: string;
  scenario?: MockScenario;
  store?: GuardGovernanceStore;
};

export function renderImported(
  node: ReactNode,
  {
    language = "en",
    projectId = "individual",
    scenario = "populated",
    store,
  }: Options = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GuardGovernanceProvider projectId={projectId} {...(store ? { store } : {})}>
        <GuardrailImportProvider
          projectId={projectId}
          language={language}
          scenario={scenario}
        >
          <TooltipProvider>{node}</TooltipProvider>
        </GuardrailImportProvider>
      </GuardGovernanceProvider>
    </QueryClientProvider>,
  );
}
