import type { ProviderConnectionDraft } from "@tasklattice/contracts";
import { ProviderFormSection, ProviderTextField } from "./fields";
import type { ProviderConfiguratorProps } from "./types";
type Draft = Extract<ProviderConnectionDraft, { provider: "vllm" }>;
export function VllmProvider({ disabled, errors, onChange, value }: ProviderConfiguratorProps<Draft>) { return <ProviderFormSection title="vLLM server"><ProviderTextField id="vllm-endpoint" label="OpenAI-compatible base URL" type="url" required value={value.config.endpoint} disabled={disabled} error={errors.endpoint} onChange={(endpoint) => onChange({ ...value, config: { endpoint } })} /><ProviderTextField id="vllm-key" label="API key (optional)" type="password" value={value.credentials.apiKey ?? ""} disabled={disabled} onChange={(apiKey) => onChange({ ...value, credentials: { apiKey: apiKey || undefined } })} /></ProviderFormSection>; }
