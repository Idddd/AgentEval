import type { Agent } from "@tasklattice/contracts";

import { EffectiveMcpAccess } from "@/components/access/effective-mcp-access";

export function InstanceEffectiveAccessPreview({ agent }: { agent: Agent }) {
  return <EffectiveMcpAccess agent={agent} />;
}
