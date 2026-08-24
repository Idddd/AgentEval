import { useState } from "react";
import { Activity, Cable, KeyRound, Plus, ShieldCheck } from "lucide-react";
import { EntityDetailList, EntitySheet } from "@/components/shared/entity-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGuardGovernanceState, useGuardGovernanceStore } from "../mock-provider";
import type { GuardIntegration, IntegrationEnvironment, IntegrationProtocol } from "../model";
import { GovernancePage } from "../shared/governance-page";
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
  const status = state.systemStatus;

  const register = () => {
    try {
      const result = store.registerIntegration({ name, protocol, environment });
      setCredential(result.credential);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to register Integration");
    }
  };

  const closeRegistration = () => {
    setRegisterOpen(false);
    setCredential("");
    setName("");
  };

  return (
    <GovernancePage
      title="Integrations"
      description="Register gateways, inspect trusted traffic adapters, and monitor the local enforcement runtime."
      actions={<Button onClick={() => setRegisterOpen(true)}><Plus />Register Integration</Button>}
    >
      <Card>
        <CardHeader className="border-b bg-muted/25 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Activity className="size-4 text-primary" />System health</CardTitle>
            <CardDescription className="mt-1">{status.status === "healthy" ? "All configured enforcement capabilities are available." : "Core enforcement is online; one optional capability is not configured."}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>{status.activeAssignments} active assignments</span>
            <span>{status.onlineIntegrations} / {status.totalIntegrations} integrations online</span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-px bg-border p-0 sm:grid-cols-2 xl:grid-cols-4">
          <Capability name="Local deterministic detection" ready={status.capabilities.deterministic} />
          <Capability name="Fast semantic" ready={status.capabilities.fastSemantic} />
          <Capability name="Deep judge" ready={status.capabilities.deepJudge} />
          <Capability name="Automated reasoning" ready={status.capabilities.automatedReasoning} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Cable className="size-4 text-primary" />Gateway registry</CardTitle><CardDescription>Runtime activity and verification are deterministic mock values.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-y bg-muted/35 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Integration</th><th className="px-4 py-3 font-medium">Environment</th><th className="px-4 py-3 font-medium">Traffic</th><th className="px-4 py-3 font-medium">Runtime</th><th className="px-4 py-3 font-medium">Verification</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead>
              <tbody className="divide-y">{state.integrations.map((integration) => (
                <tr key={integration.id}>
                  <td className="px-4 py-4"><p className="font-medium">{integration.name}</p><p className="mt-1 text-xs text-muted-foreground">{protocolLabel(integration.protocol)}</p></td>
                  <td className="px-4 py-4 capitalize">{integration.environment}</td>
                  <td className="px-4 py-4 font-mono text-xs">{integration.requestCount.toLocaleString("en-US")} requests / {integration.errorCount.toLocaleString("en-US")} errors</td>
                  <td className="px-4 py-4"><GovernanceStatusBadge status={integration.runtimeStatus} /></td>
                  <td className="px-4 py-4"><GovernanceStatusBadge status={integration.verificationStatus} /></td>
                  <td className="px-4 py-4 text-right"><div className="flex justify-end gap-2"><Button aria-label={`View ${integration.name}`} size="sm" variant="outline" onClick={() => setSelected(integration)}>View</Button><Button size="sm" variant="ghost" onClick={() => store.toggleIntegration(integration.id, !integration.enabled)}>{integration.enabled ? "Disable" : "Enable"}</Button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <EntitySheet open={registerOpen} onOpenChange={(open) => { if (!open) closeRegistration(); }} eyebrow={`Integration / ${protocol.toUpperCase()}`} title={credential ? "Credential created" : "Register Integration"} description={credential ? "Copy this mock Credential now. Only its prefix remains after this sheet closes." : "Create a local mock gateway registration. No external API is called."} footer={credential ? <Button onClick={closeRegistration}>Done</Button> : <><Button variant="outline" onClick={closeRegistration}>Cancel</Button><Button onClick={register}>Register</Button></>}>
        {credential ? <div className="rounded-lg border border-primary/20 bg-primary/5 p-5"><p className="flex items-center gap-2 text-sm font-medium text-primary"><KeyRound className="size-4" />One-time Credential</p><code className="mt-3 block break-all rounded-md border bg-background p-4 text-xs">{credential}</code></div> : <div className="grid gap-5"><Field label="Name"><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Protocol"><select value={protocol} onChange={(event) => setProtocol(event.target.value as IntegrationProtocol)}><option value="litellm">LiteLLM</option><option value="http">HTTP</option><option value="a2a">A2A</option></select></Field><Field label="Environment"><select value={environment} onChange={(event) => setEnvironment(event.target.value as IntegrationEnvironment)}><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option><option value="test">Test</option></select></Field>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}</div>}
      </EntitySheet>

      <EntitySheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }} width="md" eyebrow="Integration details" title={selected?.name ?? "Integration"} description="Registration, trust, and mock runtime activity." footer={<Button variant="outline" onClick={() => setSelected(null)}>Close</Button>}>
        {selected ? <div className="space-y-5"><EntityDetailList items={[{ label: "ID", value: selected.id, mono: true }, { label: "Protocol", value: protocolLabel(selected.protocol) }, { label: "Environment", value: selected.environment }, { label: "Runtime", value: <GovernanceStatusBadge status={selected.runtimeStatus} /> }, { label: "Credential", value: selected.credentialPrefix, mono: true }, { label: "Verification", value: <GovernanceStatusBadge status={selected.verificationStatus} /> }]} /><section className="rounded-lg border"><h3 className="border-b bg-muted/35 px-4 py-3 text-sm font-medium">Runtime activity</h3><EntityDetailList items={[{ label: "Requests", value: selected.requestCount.toLocaleString("en-US"), mono: true }, { label: "Errors", value: selected.errorCount.toLocaleString("en-US"), mono: true }, { label: "Last activity", value: selected.lastSeenAt ? new Date(selected.lastSeenAt).toLocaleString() : "No traffic received" }]} /></section><section className="rounded-lg border border-primary/20 bg-primary/5 p-4"><h3 className="text-sm font-medium">Trusted traffic context</h3><p className="mt-1 text-sm text-muted-foreground">Environment, protocol, route, model, team, and verified JWT claims are supplied by this registered adapter, not by user input.</p></section></div> : null}
      </EntitySheet>
    </GovernancePage>
  );
}

function Capability({ name, ready }: { name: string; ready: boolean }) {
  return <div className="flex min-h-20 items-center gap-3 bg-card p-4"><ShieldCheck className="size-4 text-primary" /><div className="min-w-0 flex-1"><p className="text-xs font-medium">{name}</p><p className="mt-1 text-xs text-muted-foreground">{ready ? "Available" : "Not configured"}</p></div><GovernanceStatusBadge status={ready ? "READY" : "UNAVAILABLE"} /></div>;
}

function protocolLabel(protocol: IntegrationProtocol) {
  return protocol === "litellm" ? "LiteLLM callback adapter" : protocol === "a2a" ? "Agent-to-Agent task adapter" : "HTTP enforcement API";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>;
}
