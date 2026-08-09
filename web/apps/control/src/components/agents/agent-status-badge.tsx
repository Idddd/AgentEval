import type { AgentStatus } from "@tasklattice/contracts";
import { Badge } from "@/components/ui/badge";

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return (
    <Badge
      variant={
        status === "READY"
          ? "default"
          : status === "FAILED"
            ? "destructive"
            : "secondary"
      }
    >
      {status}
    </Badge>
  );
}
