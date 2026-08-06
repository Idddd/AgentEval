import type { ProviderConnectionDraft } from "@tasklattice/contracts";
import { ProviderFormSection, ProviderTextField } from "./fields";
import type { ProviderConfiguratorProps } from "./types";
type Draft = Extract<ProviderConnectionDraft, { provider: "openai" }>;
export function OpenAIProvider({ disabled, errors, onChange, value }: ProviderConfiguratorProps<Draft>) {
  return <ProviderFormSection title="OpenAI connection"><ProviderTextField id="openai-endpoint" label="API endpoint" type="url" required value={value.config.endpoint} disabled={disabled} error={errors.endpoint} onChange={(endpoint) => onChange({ ...value, config: { ...value.config, endpoint } })} /><ProviderTextField id="openai-organization" label="Organization (optional)" value={value.config.organization ?? ""} disabled={disabled} onChange={(organization) => onChange({ ...value, config: { ...value.config, organization: organization || undefined } })} /><ProviderTextField id="openai-key" label="API key" type="password" required value={value.credentials.apiKey} disabled={disabled} error={errors.apiKey} onChange={(apiKey) => onChange({ ...value, credentials: { apiKey } })} /></ProviderFormSection>;
}
