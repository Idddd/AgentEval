import type { ProviderConnectionDraft } from "@tasklattice/contracts";
import { ProviderFormSection, ProviderTextField } from "./fields";
import type { ProviderConfiguratorProps } from "./types";

type ApiKeyDraft = ProviderConnectionDraft & {
  config: { endpoint: string };
  credentials: { apiKey?: string };
};

export function ApiKeyProviderFields<T extends ApiKeyDraft>({ disabled, errors, onChange, value }: ProviderConfiguratorProps<T>) {
  return (
    <ProviderFormSection title="Connection" description="The credential is sent only to TaskLattice and LiteLLM. It is never returned by the API.">
      <ProviderTextField id={`${value.provider}-endpoint`} label="API endpoint" type="url" value={value.config.endpoint} required disabled={disabled} error={errors.endpoint} onChange={(endpoint) => onChange({ ...value, config: { ...value.config, endpoint } })} />
      <ProviderTextField id={`${value.provider}-api-key`} label="API key" type="password" value={value.credentials.apiKey ?? ""} required disabled={disabled} error={errors.apiKey} onChange={(apiKey) => onChange({ ...value, credentials: { ...value.credentials, apiKey } })} />
    </ProviderFormSection>
  );
}
