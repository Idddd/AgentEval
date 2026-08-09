import type { AgentPlatformId } from "@tasklattice/contracts";
import { AgentPlatformIcon } from "@/components/agents/agent-platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { agentPlatformPresentations, getAgentPlatformPresentation } from "@/lib/agent-platforms";

export function AgentSelect({
  id,
  onValueChange,
  value,
}: {
  id?: string;
  onValueChange: (value: AgentPlatformId) => void;
  value: AgentPlatformId;
}) {
  const selected = getAgentPlatformPresentation(value);
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as AgentPlatformId)}>
      <SelectTrigger id={id} className="min-h-14 h-auto w-full">
        <SelectValue>
          <AgentIdentity platform={selected} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {agentPlatformPresentations.map((platform) => (
          <SelectItem key={platform.id} value={platform.id} className="py-3">
            <AgentIdentity platform={platform} showDescription />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AgentIdentity({
  platform,
  showDescription = false,
}: {
  platform: ReturnType<typeof getAgentPlatformPresentation>;
  showDescription?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3 text-left">
      <AgentPlatformIcon platform={platform} className="size-8 rounded-sm" imageClassName="size-6" />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <strong className="text-sm">{platform.name}</strong>
          {platform.isDefault ? <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Default</span> : null}
        </span>
        {showDescription ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{platform.description}</span> : null}
      </span>
    </span>
  );
}
