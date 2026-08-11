import { useState } from "react";
import { Cable, KeyRound, Plus, X } from "lucide-react";
import { EntityDetailList, EntitySheet } from "@/components/shared/entity-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGuardGovernanceState, useGuardGovernanceStore } from "../mock-provider";
import type { GuardIntegration, IntegrationEnvironment, IntegrationProtocol } from "../model";
import { GovernancePage, GovernanceMetric } from "../shared/governance-page";
import { GovernanceStatusBadge } from "../shared/governance-status";

export function IntegrationsPage() {
  const state = useGuardGovernanceState();
  const store = useGuardGovernanceStore();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selected, setSelected] = useState<GuardIntegration | null>(null);
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState<IntegrationProtocol>("litellm");
  const [environment, setEnvironment] = useState<IntegrationEnvironment>("staging");
  const [credential, setCredential] = useState("");
  const [error, setError] = useState("");
  const healthy = state.integrations.filter((item) => item.health === "HEALTHY").length;

  const register = () => {
    try {
      const result = store.registerIntegration({ name, protocol, environment });
      setCredential(result.credential);
      setRegisterOpen(false);
      setName("");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to register Integration");
    }
  };

  return (
    <GovernancePage title="Integrations" description="Register model gateways that can submit traffic to Guard Governance." actions={<Button onClick={() => setRegisterOpen(true)}><Plus />Register Integration</Button>}>
      <div className="grid gap-3 sm:grid-cols-3"><GovernanceMetric label="Integrations" value={state.integrations.length} /><GovernanceMetric label="Healthy" value={healthy} /><GovernanceMetric label="Enabled" value={state.integrations.filter((item) => item.enabled).length} /></div>
      {credential ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-medium text-emerald-800"><KeyRound className="size-4" />Credential created</p><p className="mt-1 text-sm text-muted-foreground">Copy this mock Credential now. It is not retained in readable state.</p><code className="mt-3 block rounded-md border bg-background px-3 py-2 text-sm">{credential}</code></div><Button aria-label="Dismiss Credential" size="icon" variant="ghost" onClick={() => setCredential("")}><X /></Button></div></div> : null}
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Cable className="size-4 text-primary" />Gateway registry</CardTitle><CardDescription>Health and enablement are simulated locally.</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y bg-muted/35 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Integration</th><th className="px-4 py-3 font-medium">Protocol</th><th className="px-4 py-3 font-medium">Environment</th><th className="px-4 py-3 font-medium">Health</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead><tbody className="divide-y">{state.integrations.map((integration) => <tr key={integration.id}><td className="px-4 py-4"><p className="font-medium">{integration.name}</p><p className="mt-1 font-mono text-xs text-muted-foreground">Credential {integration.credentialHint}</p></td><td className="px-4 py-4 uppercase">{integration.protocol}</td><td className="px-4 py-4 capitalize">{integration.environment}</td><td className="px-4 py-4"><GovernanceStatusBadge status={integration.health} /></td><td className="px-4 py-4 text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setSelected(integration)}>View</Button><Button size="sm" variant="ghost" onClick={() => store.toggleIntegration(integration.id, !integration.enabled)}>{integration.enabled ? "Disable" : "Enable"}</Button></div></td></tr>)}</tbody></table></div></CardContent></Card>

      <EntitySheet open={registerOpen} onOpenChange={setRegisterOpen} eyebrow="Guard Governance" title="Register Integration" description="This creates a local mock gateway and returns a one-time mock Credential." footer={<><Button variant="outline" onClick={() => setRegisterOpen(false)}>Cancel</Button><Button onClick={register}>Register</Button></>}><div className="grid gap-5"><Field label="Name"><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Protocol"><select className="h-11 rounded-md border bg-background px-3" value={protocol} onChange={(event) => setProtocol(event.target.value as IntegrationProtocol)}><option value="litellm">LiteLLM</option><option value="http">HTTP</option><option value="a2a">A2A</option></select></Field><Field label="Environment"><select className="h-11 rounded-md border bg-background px-3" value={environment} onChange={(event) => setEnvironment(event.target.value as IntegrationEnvironment)}><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option><option value="test">Test</option></select></Field>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</div></EntitySheet>
      <EntitySheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }} title={selected?.name ?? "Integration"} description="Mock registration details and current simulated health." footer={<Button variant="outline" onClick={() => setSelected(null)}>Close</Button>}>{selected ? <EntityDetailList items={[{ label: "ID", value: selected.id, mono: true }, { label: "Protocol", value: selected.protocol.toUpperCase() }, { label: "Environment", value: selected.environment }, { label: "Health", value: <GovernanceStatusBadge status={selected.health} /> }, { label: "Credential", value: selected.credentialHint, mono: true }]} /> : null}</EntitySheet>
    </GovernancePage>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>; }
