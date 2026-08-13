/** @vitest-environment jsdom */
import { renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { expect, it } from "vitest";
import { GuardGovernanceProvider } from "../mock-provider";
import { GuardrailImportProvider } from "./guardrail-import-provider";
import { useGuardAuth } from "./lib/auth-compat";
import { renderImported } from "./test-utils";

function TranslatedProbe() {
  const { t } = useTranslation();
  return <span>{t("guardrails.create")}</span>;
}

it("renders original Guard copy in English and Simplified Chinese", async () => {
  const english = renderImported(<TranslatedProbe />, { language: "en" });
  expect(screen.getByText("Create Guardrail")).not.toBeNull();
  english.unmount();

  renderImported(<TranslatedProbe />, { language: "zh-CN" });
  expect(await screen.findByText(/Guardrail/)).not.toBeNull();
});

it("exposes only the preferred language through auth compatibility", () => {
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <GuardGovernanceProvider projectId="individual">
        <GuardrailImportProvider projectId="individual" language="zh-CN">
          {children}
        </GuardrailImportProvider>
      </GuardGovernanceProvider>
    );
  }
  const { result } = renderHook(() => useGuardAuth(), { wrapper });
  expect(result.current.user?.preferred_language).toBe("zh-CN");
});
