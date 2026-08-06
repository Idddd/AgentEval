import type { ComponentType } from "react";
import type { ProviderConnectionDraft } from "@tasklattice/contracts";

export interface ProviderConfiguratorProps<T extends ProviderConnectionDraft = ProviderConnectionDraft> {
  value: T;
  onChange: (value: T) => void;
  errors: Record<string, string>;
  disabled: boolean;
}

export type ProviderConfigurator = ComponentType<ProviderConfiguratorProps<any>>;
