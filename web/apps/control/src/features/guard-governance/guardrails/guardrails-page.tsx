import { useMemo, useState } from "react";
import { FlaskConical, Plus, ShieldCheck } from "lucide-react";
import { EntitySheet } from "@/components/shared/entity-sheet";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGuardGovernanceState, useGuardGovernanceStore } from "../mock-provider";
import type {
  GuardrailControl,
  GuardrailOutputDelivery,
  GuardrailRisk,
  GuardrailSafetyLevel,
} from "../model";
import { GovernancePage, GovernanceMetric } from "../shared/governance-page";
import { GovernanceStatusBadge } from "../shared/governance-status";

const controlChoices: Array<{
  risk: GuardrailRisk;
  label: string;
  action: GuardrailControl["action"];
}> = [
  { risk: "prompt_injection", label: "Prompt injection", action: "reject" },
  { risk: "pii", label: "Sensitive data", action: "redact" },
  { risk: "secrets", label: "Secrets", action: "reject" },
  { risk: "content_safety", label: "Content safety", action: "reject" },
  { risk: "topic_control", label: "Topic control", action: "redirect" },
  { risk: "company_policy", label: "Company policy", action: "rewrite" },
];

export function GuardrailsPage({ projectId }: { projectId: string }) {
  const state = useGuardGovernanceState();
  const store = useGuardGovernanceStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [safetyLevel, setSafetyLevel] = useState<GuardrailSafetyLevel>("standard");
  const [outputDelivery, setOutputDelivery] = useState<GuardrailOutputDelivery>("interruptible");
  const [selectedRisks, setSelectedRisks] = useState<GuardrailRisk[]>(["prompt_injection"]);
  const [allowedTopics, setAllowedTopics] = useState("");
  const [restrictedTopics, setRestrictedTopics] = useState("");
  const [error, setError] = useState("");
  const assignmentCounts = useMemo(
    () =>
      new Map(
        state.guardrails.map((guardrail) => [
          guardrail.id,
          state.assignments.filter((item) => item.guardrailId === guardrail.id).length,
        ]),
      ),
    [state.assignments, state.guardrails],
  );
  const ready = state.guardrails.filter((item) => item.status === "READY").length;

  const resetForm = () => {
    setName("");
    setPurpose("");
    setSafetyLevel("standard");
    setOutputDelivery("interruptible");
    setSelectedRisks(["prompt_injection"]);
    setAllowedTopics("");
    setRestrictedTopics("");
    setError("");
  };

  const create = () => {
    try {
      store.createGuardrail({
        name,
        purpose,
        safetyLevel,
        outputDelivery,
        allowedTopics: lines(allowedTopics),
        restrictedTopics: lines(restrictedTopics),
        controls: controlChoices
          .filter((choice) => selectedRisks.includes(choice.risk))
          .map((choice) => ({
            risk: choice.risk,
            action: choice.action,
            enabled: true,
          })),
      });
      setCreateOpen(false);
      resetForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create Guardrail");
    }
  };

  return (
    <GovernancePage
      title="Guardrails"
      description="Define model I/O safety controls, test expected decisions, and promote verified policies to Ready."
      actions={<Button onClick={() => setCreateOpen(true)}><Plus />Create Guardrail</Button>}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <GovernanceMetric label="Guardrails" value={state.guardrails.length} />
        <GovernanceMetric label="Ready" value={ready} detail="Eligible for Assignment" />
        <GovernanceMetric label="Needs testing" value={state.guardrails.length - ready} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" />Policy catalog</CardTitle>
          <CardDescription>Guardrails remain isolated from the existing Security demo page.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-y bg-muted/35 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Guardrail</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Controls</th>
                  <th className="px-4 py-3 font-medium">Assignments</th>
                  <th className="px-4 py-3 font-medium">Latest test</th>
                  <th className="px-4 py-3 text-right font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {state.guardrails.map((guardrail) => (
                  <tr key={guardrail.id} className="hover:bg-muted/20">
                    <td className="px-4 py-4"><p className="font-medium">{guardrail.name}</p><p className="mt-1 max-w-md truncate text-xs text-muted-foreground">{guardrail.purpose}</p></td>
                    <td className="px-4 py-4"><GovernanceStatusBadge status={guardrail.status} /></td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">{guardrail.controls.filter((item) => item.enabled).length} enabled</td>
                    <td className="px-4 py-4 font-mono text-xs">{assignmentCounts.get(guardrail.id) ?? 0}</td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">{guardrail.latestTestRun?.status ?? "Not run"}</td>
                    <td className="px-4 py-4 text-right"><Button asChild size="sm" variant="outline"><a href={`/${encodeURIComponent(projectId)}/governance/guardrails/${encodeURIComponent(guardrail.id)}`}>View</a></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <EntitySheet
        open={createOpen}
        onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}
        eyebrow="Guard Governance"
        title="Create Guardrail"
        description="Create a draft policy. Add Test Cases and run them before assigning it to traffic."
        footer={<><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={create}><FlaskConical />Create</Button></>}
      >
        <div className="grid gap-5">
          <Field label="Name"><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Purpose"><Textarea rows={3} value={purpose} onChange={(event) => setPurpose(event.target.value)} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Safety level"><select className="h-11 rounded-md border bg-background px-3" value={safetyLevel} onChange={(event) => setSafetyLevel(event.target.value as GuardrailSafetyLevel)}><option value="standard">Standard</option><option value="strict">Strict</option><option value="maximum">Maximum</option></select></Field>
            <Field label="Output delivery"><select className="h-11 rounded-md border bg-background px-3" value={outputDelivery} onChange={(event) => setOutputDelivery(event.target.value as GuardrailOutputDelivery)}><option value="interruptible">Interruptible</option><option value="windowed">Windowed</option><option value="full_buffered">Full buffered</option></select></Field>
          </div>
          <fieldset className="grid gap-2"><legend className="mb-2 text-sm font-medium">Controls</legend>{controlChoices.map((choice) => <label key={choice.risk} className="flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm"><input type="checkbox" checked={selectedRisks.includes(choice.risk)} onChange={() => setSelectedRisks((current) => current.includes(choice.risk) ? current.filter((item) => item !== choice.risk) : [...current, choice.risk])} />{choice.label}<span className="ml-auto text-xs text-muted-foreground">{choice.action}</span></label>)}</fieldset>
          <Field label="Allowed topics" hint="One topic per line"><Textarea rows={3} value={allowedTopics} onChange={(event) => setAllowedTopics(event.target.value)} /></Field>
          <Field label="Restricted topics" hint="One topic per line"><Textarea rows={3} value={restrictedTopics} onChange={(event) => setRestrictedTopics(event.target.value)} /></Field>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
      </EntitySheet>
    </GovernancePage>
  );
}

function Field({ children, hint, label }: { children: React.ReactNode; hint?: string; label: string }) {
  return <label className="grid gap-2 text-sm font-medium">{label}{children}{hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}</label>;
}

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}
