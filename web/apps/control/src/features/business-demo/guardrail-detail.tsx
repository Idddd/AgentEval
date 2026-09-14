import { useState } from "react";
import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  BackendActions,
  EntityDetail,
  EntityEditor,
  StatusBadge,
} from "./catalog";
import {
  availableRevisions,
  scopeKeys,
  scopeLabels,
  type Entity,
  type PolicyReference,
} from "./model";
import { useBusinessDemo } from "./provider";

export function GuardrailDetails({ id }: { id: string }) {
  const { items, save, busy } = useBusinessDemo();
  const guard = items.find(
    (item) => item.id === id && item.kind === "guardrails",
  );
  const [panel, setPanel] = useState<{
    id: string;
    version?: number | string;
    edit: boolean;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = items.find((item) => item.id === panel?.id);
  function close() {
    setPanel(null);
    setDirty(false);
    setConfirmClose(false);
  }
  function open(item: Entity, edit: boolean, version = item.version) {
    setPanel({ id: item.id, version, edit });
    setDirty(false);
    setConfirmClose(false);
    setNotice("");
  }
  const canEdit = (item: Entity) =>
    !item.remote?.readOnly &&
    ["Draft", "Needs input", "Ready", "Validated"].includes(item.status);
  function policyRow(ref: PolicyReference) {
    const policy = items.find(
      (p) => p.kind === "policies" && p.id === ref.policyId,
    );
    const pinned =
      policy &&
      availableRevisions(policy).find((r) => r.version === ref.version);
    return (
      <tr key={ref.policyId} className="align-top">
        <td className="px-5 py-5">
          <button
            className="text-left font-medium hover:text-primary disabled:text-muted-foreground"
            disabled={!policy}
            onClick={() => policy && open(policy, false, ref.version)}
          >
            {ref.name}
          </button>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Rule text</summary>
            <p className="mt-3 max-w-lg whitespace-pre-wrap break-words leading-6">
              {ref.text}
            </p>
          </details>
        </td>
        <td className="px-5 py-5 text-sm">v{ref.version}</td>
        <td className="px-5 py-5">
          {pinned ? (
            <StatusBadge status="Ready" />
          ) : (
            <span className="text-xs text-amber-800">Unavailable</span>
          )}
        </td>
        <td className="px-5 py-5">
          {policy ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs">v{policy.version}</span>
              <StatusBadge status={policy.status} />
            </div>
          ) : (
            "—"
          )}
        </td>
        <td className="px-5 py-4">
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!policy}
              aria-label={`View ${ref.name}`}
              onClick={() => policy && open(policy, false, ref.version)}
            >
              View
              <ArrowRight className="size-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!policy || !canEdit(policy)}
              aria-label={`Edit ${ref.name}`}
              onClick={() => policy && open(policy, true)}
            >
              <Pencil className="size-3" />
              {policy && policy.version !== ref.version
                ? "Edit latest"
                : "Edit"}
            </Button>
          </div>
        </td>
      </tr>
    );
  }
  return (
    <section className="mx-auto max-w-[1320px] space-y-6 py-2 sm:py-5">
      <a
        href="/guardrails"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" />
        Guardrails
      </a>
      {!guard ? (
        <div className="rounded-lg border bg-white p-8">
          <h1 className="font-heading text-2xl">Guardrail not found</h1>
        </div>
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="break-words font-heading text-3xl">
                  {guard.name}
                </h1>
                <StatusBadge status={guard.status} />
              </div>
              {guard.owner && (
                <p className="text-xs text-muted-foreground">
                  Owner · {guard.owner}
                </p>
              )}
              {guard.remote && (
                <p className="text-xs text-muted-foreground">
                  Draft revision {guard.remote.draftRevision}
                </p>
              )}
            </div>
            {(canEdit(guard) ||
              (guard.remote && guard.status === "Active")) && (
              <Button variant="outline" onClick={() => open(guard, true)}>
                <Pencil className="size-4" />
                Edit Guardrail
              </Button>
            )}
          </header>
          <div className="overflow-hidden rounded-lg border bg-white">
            {!guard.remote && (
              <dl className="grid gap-5 border-b p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2 lg:col-span-4">
                  <dt className="mb-1 text-xs text-muted-foreground">
                    Use case
                  </dt>
                  <dd>{guard.useCase || "—"}</dd>
                </div>
                {scopeKeys.map((key) => (
                  <div key={key}>
                    <dt className="mb-1 text-xs text-muted-foreground">
                      {scopeLabels[key]}
                    </dt>
                    <dd>{guard[key] || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
            {guard.question && (
              <p
                role="status"
                className="border-b bg-amber-50 p-4 text-sm text-amber-900"
              >
                {guard.question}
              </p>
            )}
            <section>
              <div className="flex items-center gap-2 border-b px-5 py-4">
                <h2 className="font-heading text-lg">Policies</h2>
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {guard.policies.length}
                </span>
              </div>
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b bg-zinc-50 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-[35%] px-5 py-3 font-medium">Policy</th>
                      <th className="px-5 py-3 font-medium">Used version</th>
                      <th className="px-5 py-3 font-medium">Version status</th>
                      <th className="px-5 py-3 font-medium">Latest Policy</th>
                      <th className="px-5 py-3 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {guard.policies.map(policyRow)}
                  </tbody>
                </table>
              </div>
              {!guard.policies.length && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  No policies selected
                </p>
              )}
            </section>
            <BackendActions item={guard} />
            <footer className="flex flex-wrap gap-x-8 gap-y-2 border-t bg-zinc-50/50 px-5 py-4 text-xs text-muted-foreground">
              <span>
                Created · {new Date(guard.createdAt).toLocaleString("en-GB")}
              </span>
              <span>
                Updated · {new Date(guard.updatedAt).toLocaleString("en-GB")}
              </span>
            </footer>
          </div>
          {notice && (
            <p role="status" className="text-sm text-emerald-700">
              {notice}
            </p>
          )}
        </>
      )}
      <Sheet
        open={!!panel}
        onOpenChange={(value) => {
          if (busy) return;
          if (!value) dirty ? setConfirmClose(true) : close();
        }}
      >
        <SheetContent
          aria-describedby={undefined}
          className="gap-0 bg-white data-[side=right]:w-full data-[side=right]:sm:max-w-[600px]"
        >
          <SheetHeader className="border-b px-6 py-5 pr-14">
            <SheetTitle className="text-xl">
              {selected?.kind === "guardrails"
                ? "Edit Guardrail"
                : panel?.edit
                  ? selected?.status === "Ready"
                    ? selected.remote
                      ? "Create Policy version"
                      : `Create Policy v${Number(selected.version) + 1}`
                    : "Edit Policy"
                  : "Policy"}
            </SheetTitle>
          </SheetHeader>
          {confirmClose && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 border-b bg-amber-50 px-6 py-3 text-sm"
            >
              <span className="mr-auto">Discard unsaved changes?</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmClose(false)}
              >
                Keep editing
              </Button>
              <Button size="sm" onClick={close}>
                Discard
              </Button>
            </div>
          )}
          {selected && panel ? (
            panel.edit ? (
              <EntityEditor
                key={`${selected.id}-${selected.version}`}
                kind={selected.kind}
                initial={selected}
                onDirty={() => setDirty(true)}
                onSave={(draft, submit) => {
                  const result = save(selected.kind, draft, submit, selected);
                  const finish = (result: Entity) => {
                    setDirty(false);
                    setConfirmClose(false);
                    setNotice(submit ? "Submitted" : "Draft saved");
                    if (selected.kind === "guardrails") close();
                    else
                      setPanel({
                        id: result.id,
                        version: result.version,
                        edit: false,
                      });
                  };
                  if (result instanceof Promise) return result.then(finish);
                  finish(result);
                }}
              />
            ) : (
              <EntityDetail
                item={selected}
                selectedVersion={panel.version}
                onEdit={() => open(selected, true)}
              />
            )
          ) : (
            <p className="p-6">Policy not found</p>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
