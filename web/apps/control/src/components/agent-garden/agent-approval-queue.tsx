import { useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffectiveProjectRole } from "@/hooks/use-project-permissions";

interface PendingAgent {
  id: string;
  name: string;
  description: string;
  owner: string;
  submittedAt: string;
  tags: string[];
}

/**
 * Demo-only approval queue. There is no backend workflow behind it;
 * approving or rejecting simply removes the entry and surfaces a notice
 * that (in a real deployment) would be recorded in the Audit Logs.
 */
const INITIAL_PENDING_AGENTS: PendingAgent[] = [
  {
    id: "pending-invoice-reconciler",
    name: "Invoice Reconciler",
    description:
      "Matches invoices against purchase orders and flags discrepancies for finance review.",
    owner: "finance-ops@tasklattice.demo",
    submittedAt: "2026-08-03T09:24:00.000Z",
    tags: ["finance", "read-only"],
  },
  {
    id: "pending-hr-onboarding",
    name: "HR Onboarding Assistant",
    description:
      "Guides new hires through paperwork, account provisioning, and policy acknowledgements.",
    owner: "people-team@tasklattice.demo",
    submittedAt: "2026-08-04T14:02:00.000Z",
    tags: ["hr", "employee-data"],
  },
  {
    id: "pending-vendor-risk-scanner",
    name: "Vendor Risk Scanner",
    description:
      "Scans vendor documents for compliance gaps and produces a risk summary.",
    owner: "procurement@tasklattice.demo",
    submittedAt: "2026-08-04T16:40:00.000Z",
    tags: ["compliance", "documents"],
  },
];

export function AgentApprovalQueue({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const role = useEffectiveProjectRole();
  const [pending, setPending] = useState<PendingAgent[]>(
    INITIAL_PENDING_AGENTS,
  );

  if (role !== "admin" || pending.length === 0) return null;

  const decide = (agent: PendingAgent, approved: boolean) => {
    setPending((current) =>
      current.filter((candidate) => candidate.id !== agent.id),
    );
    onNotice(
      approved
        ? `${agent.name} was approved and can now be connected. The decision was recorded in the Audit Logs.`
        : `${agent.name} was rejected. The decision was recorded in the Audit Logs.`,
    );
  };

  return (
    <section className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-amber-600" />
        <h2 className="text-sm font-semibold">
          Pending approval
          <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs tabular-nums text-amber-700">
            {pending.length}
          </span>
        </h2>
        <p className="ml-auto hidden text-xs text-muted-foreground md:block">
          Only Admins can approve newly registered Agents before they become
          connectable.
        </p>
      </div>
      <ul className="divide-y rounded-md border bg-background">
        {pending.map((agent) => (
          <li
            key={agent.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{agent.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {agent.description}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Submitted by {agent.owner} ·{" "}
                {new Date(agent.submittedAt).toLocaleString()} ·{" "}
                {agent.tags.join(", ")}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => decide(agent, false)}
              >
                <X /> Reject
              </Button>
              <Button size="sm" onClick={() => decide(agent, true)}>
                <Check /> Approve
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
