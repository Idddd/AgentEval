import { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffectiveProjectRole } from "@/hooks/use-project-permissions";
import { cn } from "@/lib/utils";

/**
 * Guardrail management (frontend-only demo, admin role only).
 * Rules and hit counters are mock data seeded from the evaluation demo's
 * incidents; toggles live in component state and are not persisted.
 */

type GuardrailCategory = "Input filtering" | "Permission enforcement" | "Data protection" | "Action control" | "Tool governance";

interface GuardrailRule {
  id: string;
  name: string;
  description: string;
  category: GuardrailCategory;
  enabled: boolean;
  hits: number;
  lastHit: string;
}

const INITIAL_RULES: GuardrailRule[] = [
  {
    id: "prompt-injection-filter",
    name: "Prompt-injection filter",
    description: "Blocks prompts matching known jailbreak / injection patterns (e.g. \"ignore permissions\") before they reach the agent.",
    category: "Input filtering",
    enabled: true,
    hits: 14,
    lastHit: "jailbreak-guard-bypass · 2026-07-30",
  },
  {
    id: "deny-execution-enforcement",
    name: "DENY execution enforcement (fail-closed)",
    description: "Hard-blocks any Tool invocation after a DENY permission decision. A fail-open here caused the jailbreak guard-bypass incident.",
    category: "Permission enforcement",
    enabled: true,
    hits: 1,
    lastHit: "jailbreak-guard-bypass · 2026-07-30",
  },
  {
    id: "sensitive-data-redaction",
    name: "Sensitive data redaction",
    description: "Redacts salary, HR, and PII fields from Tool outputs returned to roles without the required scope.",
    category: "Data protection",
    enabled: true,
    hits: 3,
    lastHit: "salary-employee-deny · 2026-07-30",
  },
  {
    id: "privileged-action-confirmation",
    name: "Privileged action confirmation",
    description: "Requires an admin confirmation step before privileged Tools such as SystemRestartTool may execute.",
    category: "Action control",
    enabled: false,
    hits: 0,
    lastHit: "—",
  },
  {
    id: "mcp-tool-allowlist",
    name: "MCP Tool allowlist",
    description: "Only allowlisted MCP Tools can be invoked by agents; unknown or unreviewed MCP Tools are rejected.",
    category: "Tool governance",
    enabled: true,
    hits: 2,
    lastHit: "Operations MCP · 2026-07-29",
  },
];

export function GuardrailsPage() {
  const role = useEffectiveProjectRole();
  const [rules, setRules] = useState(INITIAL_RULES);
  if (role !== "admin") {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Admin only"
        description="Guardrail management is restricted to the admin role. Use the View-as switcher to demo it."
      />
    );
  }
  const active = rules.filter((rule) => rule.enabled);
  const totalHits = rules.reduce((sum, rule) => sum + rule.hits, 0);
  const toggle = (id: string) =>
    setRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, enabled: !rule.enabled } : rule)),
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Guardrails"
        description="Manage safety guardrails enforced around every agent Tool call. Frontend-only demo — changes are not persisted."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Active guardrails</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{active.length} / {rules.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total interceptions</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{totalHits}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Latest incident</CardDescription></CardHeader>
          <CardContent><p className="text-sm font-medium">jailbreak-guard-bypass (fail-open)</p></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Guardrail rules</CardTitle>
          <CardDescription>Disabled guardrails stop intercepting immediately; the jailbreak incident shows what a fail-open looks like.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-4 border-b px-4 py-4 last:border-b-0",
                !rule.enabled && "opacity-60",
              )}
            >
              {rule.enabled ? (
                <ShieldCheck className="size-5 text-emerald-500" />
              ) : (
                <ShieldAlert className="size-5 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{rule.name}</strong>
                  <Badge variant="outline">{rule.category}</Badge>
                  {!rule.enabled ? <Badge variant="secondary">Disabled</Badge> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{rule.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {rule.hits} interception{rule.hits === 1 ? "" : "s"} · Last: {rule.lastHit}
                </p>
              </div>
              <Badge variant={rule.hits > 0 ? "secondary" : "outline"}>{rule.hits} hits</Badge>
              <Button size="sm" variant={rule.enabled ? "outline" : "default"} onClick={() => toggle(rule.id)}>
                {rule.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
