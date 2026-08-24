import type { ProviderConnectionDraft } from "@tasklattice/contracts";
import { ApiKeyProviderFields } from "./api-key-fields";
import type { ProviderConfiguratorProps } from "./types";
type Draft = Extract<ProviderConnectionDraft, { provider: "zai" }>;
export function ZaiProvider(props: ProviderConfiguratorProps<Draft>) { return <ApiKeyProviderFields {...props} />; }
