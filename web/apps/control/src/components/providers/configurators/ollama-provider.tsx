import type { ProviderConnectionDraft } from "@tasklattice/contracts";
import { ProviderFormSection, ProviderTextField } from "./fields";
import type { ProviderConfiguratorProps } from "./types";
type Draft = Extract<ProviderConnectionDraft, { provider: "ollama" }>;
export function OllamaProvider({ disabled, errors, onChange, value }: ProviderConfiguratorProps<Draft>) { return <ProviderFormSection title="Ollama runtime" description="Use an address reachable from the TaskLattice control container, not necessarily from this browser."><ProviderTextField id="ollama-endpoint" label="Ollama base URL" type="url" required value={value.config.endpoint} disabled={disabled} error={errors.endpoint} onChange={(endpoint) => onChange({ ...value, config: { endpoint } })} /></ProviderFormSection>; }
