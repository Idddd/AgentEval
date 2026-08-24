import type { ProviderConnectionDraft } from "@tasklattice/contracts";
import { ApiKeyProviderFields } from "./api-key-fields";
import type { ProviderConfiguratorProps } from "./types";
type Draft = Extract<ProviderConnectionDraft, { provider: "custom-anthropic-compatible" }>;
export function CustomAnthropicProvider(props: ProviderConfiguratorProps<Draft>) { return <ApiKeyProviderFields {...props} />; }
