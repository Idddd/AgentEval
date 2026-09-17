import { useEffect, useId, useState, useRef, type RefObject } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  blankDraft,
  deletionBlocker,
  availableRevisions,
  filterEntities,
  scopeKeys,
  scopeLabels,
  scopeOptions,
  validateDraft,
  type Draft,
  type Entity,
  type Kind,
  type ScopeKey,
  type Status,
  type PolicyReference,
} from "./model";
import { useBusinessDemo } from "./provider";
import { SavedDraftError } from "./guard-api";

const PAGE_SIZE = 8;
const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const statusStyles: Record<Status, string> = {
  Draft: "bg-zinc-100 text-zinc-600",
  Processing: "bg-blue-50 text-blue-700",
  Ready: "bg-emerald-50 text-emerald-700",
  Active: "bg-emerald-50 text-emerald-700",
  "Needs input": "bg-amber-50 text-amber-800",
  Review: "bg-amber-50 text-amber-800",
  Deactivated: "bg-zinc-100 text-zinc-600",
  Deprecated: "bg-zinc-100 text-zinc-500",
  Validated: "bg-emerald-50 text-emerald-700",
};

function CheckboxFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
      <legend className="float-left w-24 shrink-0 pt-1 text-xs font-medium text-muted-foreground">
        {label}
      </legend>
      <div className="flex flex-1 flex-wrap gap-x-5 gap-y-2">
        {["All", ...options].map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 py-0.5 text-sm"
          >
            <input
              type="checkbox"
              className="size-4 rounded accent-primary"
              checked={
                value === "All"
                  ? selected.length === 0
                  : selected.includes(value)
              }
              onChange={() =>
                onChange(
                  value === "All"
                    ? []
                    : selected.includes(value)
                      ? selected.filter((v) => v !== value)
                      : [...selected, value],
                )
              }
            />
            {value}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export type EditorControls = {
  save: () => boolean | Promise<boolean>;
  discard: () => void;
};

export function DeleteEntityAction({
  item,
  onDeleted,
  dirty = false,
  editorControls,
}: {
  item: Entity;
  onDeleted?: (() => void) | undefined;
  dirty?: boolean;
  editorControls?: RefObject<EditorControls | null>;
}) {
  const { items, remove, setActivation } = useBusinessDemo();
  const [action, setAction] = useState<
    "Delete" | "Deactivate" | "Reactivate" | null
  >(null);
  const [resolveChanges, setResolveChanges] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  useEffect(() => {
    if (resolveChanges && !dirty) setResolveChanges(false);
  }, [dirty, resolveChanges]);
  if (!remove || item.remote?.readOnly) return null;
  const profile = item.kind === "guardrails";
  const active = profile && item.status === "Active";
  const inactive = profile && item.status === "Ready";
  const blocked =
    action === "Delete" ? deletionBlocker(items, item) : undefined;
  const begin = (next: "Delete" | "Deactivate" | "Reactivate") => {
    setAction(next);
    setError("");
    setNotice("");
    setResolveChanges(dirty);
  };
  const close = () => {
    setAction(null);
    setResolveChanges(false);
    setError("");
  };
  return (
    <div className="space-y-3">
      {!action ? (
        <div className="flex gap-2">
          {active ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => begin("Deactivate")}
            >
              Deactivate
            </Button>
          ) : (
            <>
              {inactive && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => begin("Reactivate")}
                >
                  Reactivate
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="text-red-700 hover:bg-red-50"
                onClick={() => begin("Delete")}
              >
                {profile ? "Delete" : "Delete Policy"}
              </Button>
            </>
          )}
        </div>
      ) : (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !pending) close();
          }}
        >
          <DialogContent
            showCloseButton={false}
            role="alertdialog"
            aria-label={
              resolveChanges ? "Unsaved changes" : `${action} ${item.name}`
            }
            aria-describedby={`action-${item.id}`}
            className="max-w-xl space-y-3 rounded-md border bg-white p-4 text-sm shadow-sm"
          >
            <DialogTitle className="font-medium">
              {resolveChanges
                ? "Save changes before continuing?"
                : `${action} “${item.name}”?`}
            </DialogTitle>
            <DialogDescription
              id={`action-${item.id}`}
              className="text-muted-foreground"
            >
              {resolveChanges
                ? "This profile has unsaved changes. Save or discard them before continuing."
                : (blocked ??
                  (action === "Deactivate"
                    ? "This profile will stop applying its guardrails. Its configuration and linked policies will be kept. You can reactivate it later."
                    : action === "Reactivate"
                      ? "This profile will apply its guardrails again using its saved configuration."
                      : profile
                        ? "This will permanently delete this profile. Linked policies will not be deleted. This action cannot be undone."
                        : "This will permanently delete this Policy. This action cannot be undone."))}
            </DialogDescription>
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={close}
              >
                Cancel
              </Button>
              {resolveChanges ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => editorControls?.current?.discard()}
                  >
                    Discard changes
                  </Button>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={async () => {
                      setPending(true);
                      try {
                        const saved = await editorControls?.current?.save();
                        if (!saved) close();
                      } finally {
                        setPending(false);
                      }
                    }}
                  >
                    Save changes
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  disabled={!!blocked || pending}
                  onClick={async () => {
                    if (running.current) return;
                    if (dirty) {
                      setResolveChanges(true);
                      return;
                    }
                    running.current = true;
                    setPending(true);
                    try {
                      if (action === "Delete") {
                        await remove(item);
                        onDeleted?.();
                      } else {
                        if (!setActivation)
                          throw new Error("This action is unavailable.");
                        await setActivation(item, action === "Reactivate");
                        setNotice(
                          action === "Deactivate"
                            ? "Profile deactivated."
                            : "Profile reactivated.",
                        );
                      }
                      close();
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Unable to complete the action.",
                      );
                    } finally {
                      running.current = false;
                      setPending(false);
                    }
                  }}
                >
                  {pending
                    ? "Please wait…"
                    : action === "Delete" && profile
                      ? "Delete profile"
                      : action}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-xs font-medium ${statusStyles[status]}`}
    >
      {status === "Processing" ? (
        <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
      ) : (
        <span className="size-1.5 rounded-full bg-current" />
      )}
      {status}
    </span>
  );
}

export function BusinessCatalog({
  kind,
  selectedId,
  selectedVersion,
  onSelect,
}: {
  kind: Kind;
  selectedId?: string | undefined;
  selectedVersion?: string | number | undefined;
  onSelect: (id?: string) => void;
}) {
  const { items, save, sessionOnly, mode, busy } = useBusinessDemo();
  const policy = kind === "policies";
  const title = policy ? "Policies" : "Guardrail Profile";
  const singular = policy ? "Policy" : "Guardrail";
  const Icon = policy ? FileText : ShieldCheck;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const ownerOptions = [
    ...new Set(
      items
        .filter((item) => item.kind === kind)
        .map((item) => item.owner)
        .filter(Boolean),
    ),
  ].sort();
  const [scope, setScope] = useState<Partial<Record<ScopeKey, string[]>>>({});
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = items.find(
    (item) => item.kind === kind && item.id === selectedId,
  );
  const filtered = filterEntities(items, kind, query, status, scope).filter(
    (item) =>
      !policy || !selectedOwners.length || selectedOwners.includes(item.owner),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const availableStatuses: Status[] = policy
    ? [
        "Draft",
        "Processing",
        "Ready",
        "Needs input",
        ...(mode === "live" ? ["Validated" as const] : []),
      ]
    : mode === "live"
      ? [
          "Draft",
          "Processing",
          "Active",
          "Deprecated",
          "Validated",
          "Needs input",
        ]
      : ["Draft", "Processing", "Review", "Active", "Ready"];
  useEffect(() => {
    setEditing(false);
    setDirty(false);
    setConfirmClose(false);
  }, [selectedId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function close() {
    setCreating(false);
    setEditing(false);
    setDirty(false);
    setConfirmClose(false);
    onSelect();
  }
  function resetFilters() {
    setQuery("");
    setStatus([]);
    setSelectedOwners([]);
    setScope({});
    setPage(1);
  }
  function persist(draft: Draft, submit: boolean) {
    const result = save(kind, draft, submit, creating ? undefined : selected);
    const finish = (result: Entity) => {
      setDirty(false);
      setCreating(false);
      setEditing(false);
      setConfirmClose(false);
      setNotice(submit ? `${singular} submitted` : "Draft saved");
      onSelect(result.id);
    };
    if (result instanceof Promise) return result.then(finish);
    finish(result);
  }

  return (
    <section className="mx-auto max-w-[1320px] space-y-6 py-2 sm:py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-medium tracking-tight sm:text-3xl">
            {title}
          </h1>
        </div>
        <Button
          onClick={() => {
            onSelect();
            setCreating(true);
            setDirty(false);
            setConfirmClose(false);
          }}
        >
          <Plus className="size-4" />
          Create {singular}
        </Button>
      </div>
      {sessionOnly && (
        <p role="status" className="text-sm text-amber-800">
          Browser storage unavailable · Changes last until refresh.
        </p>
      )}
      <div className="overflow-hidden rounded-lg border bg-white shadow-[0_1px_3px_rgba(0,0,0,0.025)]">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-40 flex-1 sm:max-w-lg">
            <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
            <Input
              className="h-10 bg-white pl-9"
              aria-label={`Search ${title.toLowerCase()}`}
              placeholder={`Search ${title.toLowerCase()}…`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div className="space-y-4 border-b bg-zinc-50/40 px-5 py-4">
          <CheckboxFilter
            label="Status"
            options={availableStatuses}
            selected={status}
            onChange={(values) => {
              setStatus(values);
              setPage(1);
            }}
          />
          {policy && (
            <CheckboxFilter
              label="Owner"
              options={ownerOptions}
              selected={selectedOwners}
              onChange={(values) => {
                setSelectedOwners(values);
                setPage(1);
              }}
            />
          )}
          {!policy &&
            mode !== "live" &&
            scopeKeys.map((key) => (
              <CheckboxFilter
                key={key}
                label={scopeLabels[key]}
                options={scopeOptions[key].filter((value) => value !== "All")}
                selected={scope[key] ?? []}
                onChange={(values) => {
                  setScope({ ...scope, [key]: values });
                  setPage(1);
                }}
              />
            ))}
          {(status.length > 0 ||
            selectedOwners.length > 0 ||
            Object.values(scope).some((v) => v?.length)) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatus([]);
                setSelectedOwners([]);
                setScope({});
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm md:min-w-[660px]">
            <thead className="border-b bg-zinc-50/70 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium md:w-[35%] md:px-5">
                  {singular}
                </th>
                {!policy && (
                  <th className="hidden w-[30%] px-5 py-3 font-medium md:table-cell">
                    Use case
                  </th>
                )}
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">
                  Owner
                </th>
                {policy && (
                  <th className="hidden px-5 py-3 font-medium md:table-cell">
                    Updated
                  </th>
                )}
                <th className="hidden w-10 md:table-cell">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((item) => (
                <tr
                  key={item.id}
                  className={`group transition-colors hover:bg-red-50/40 ${selectedId === item.id ? "bg-red-50/60" : ""}`}
                >
                  <td className="px-4 py-5 md:px-5">
                    <button
                      className="flex items-center gap-3 text-left font-medium outline-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4"
                      onClick={() => onSelect(item.id)}
                    >
                      <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-primary md:flex">
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="max-w-80 break-words">
                        {item.name}
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {item.kind === "guardrails"
                            ? `${item.policies.length} policies`
                            : `v${item.version} · ${items.filter((g) => g.kind === "guardrails" && g.policies.some((r) => r.policyId === item.id)).length} guardrails`}
                        </span>
                      </span>
                    </button>
                  </td>
                  {!policy && (
                    <td className="hidden px-5 py-5 text-muted-foreground md:table-cell">
                      <span className="line-clamp-2">
                        {item.useCase || "—"}
                      </span>
                    </td>
                  )}
                  <td className="px-5 py-5">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="hidden px-5 py-5 text-muted-foreground md:table-cell">
                    {item.owner || "—"}
                  </td>
                  {policy && (
                    <td className="hidden whitespace-nowrap px-5 py-5 text-muted-foreground md:table-cell">
                      {item.updatedAt > 0
                        ? new Date(item.updatedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  )}
                  <td className="hidden pr-4 md:table-cell">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`View ${item.name}`}
                      onClick={() => onSelect(item.id)}
                    >
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <div className="grid justify-items-center gap-3 py-16 text-sm">
            <Search className="size-6 text-muted-foreground" />
            <p>No {title.toLowerCase()} found</p>
            <Button variant="outline" onClick={resetFilters}>
              Clear search and filters
            </Button>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
          <span>
            {filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft />
            </Button>
            <span>
              {currentPage} / {pages}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next page"
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
      <div
        role="status"
        aria-live="polite"
        className="text-sm text-emerald-700"
      >
        {notice && (
          <span className="inline-flex items-center gap-2">
            <Check className="size-4" />
            {notice}
          </span>
        )}
      </div>
      <Sheet
        open={creating || !!selectedId}
        onOpenChange={(open) => {
          if (busy) return;
          if (!open) dirty ? setConfirmClose(true) : close();
        }}
      >
        <SheetContent
          aria-describedby={undefined}
          className="gap-0 bg-white data-[side=right]:w-full data-[side=right]:sm:max-w-[600px]"
        >
          <SheetHeader className="border-b px-6 py-5 pr-14">
            <SheetTitle className="text-xl">
              {creating
                ? `Create ${singular}`
                : editing
                  ? selected?.kind === "policies" && selected.status === "Ready"
                    ? selected.remote
                      ? "Create Policy version"
                      : `Create Policy v${Number(selected.version) + 1}`
                    : `Edit ${singular}`
                  : singular}
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
          {creating || (editing && selected) ? (
            <EntityEditor
              key={creating ? "new" : selected?.id}
              kind={kind}
              initial={creating ? undefined : selected}
              onDirty={() => setDirty(true)}
              onSave={persist}
            />
          ) : selected ? (
            <EntityDetail
              item={selected}
              selectedVersion={selectedVersion}
              onEdit={() => setEditing(true)}
              onDirty={setDirty}
              onDeleted={close}
            />
          ) : (
            <div className="p-6">
              <p className="mb-4">{singular} not found</p>
              <Button variant="outline" onClick={close}>
                Back to {title}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

export function EntityEditor({
  kind,
  initial,
  onDirty,
  onSave,
  inline = false,
  controlsRef,
}: {
  controlsRef?: RefObject<EditorControls | null>;
  inline?: boolean;
  kind: Kind;
  initial?: Entity | undefined;
  onDirty: (dirty: boolean) => void;
  onSave: (draft: Draft, submit: boolean) => void | Promise<void>;
}) {
  const { items, mode, policyAuthoring } = useBusinessDemo();
  const live = mode === "live";
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [savedLink, setSavedLink] = useState("");
  const saving = useRef(false);
  const [draft, setDraft] = useState<Draft>(initial ?? { ...blankDraft });
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>(
    {},
  );
  const id = useId();
  const changed =
    JSON.stringify(
      Object.fromEntries(
        Object.keys(blankDraft).map((k) => [k, draft[k as keyof Draft]]),
      ),
    ) !==
    JSON.stringify(
      Object.fromEntries(
        Object.keys(blankDraft).map((k) => [
          k,
          (initial ?? blankDraft)[k as keyof Draft],
        ]),
      ),
    );
  useEffect(() => {
    if (inline) onDirty(changed);
  }, [changed, inline, onDirty]);
  useEffect(() => {
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);
  function update(key: keyof Draft, value: string) {
    setDraft({ ...draft, [key]: value });
    setErrors({ ...errors, [key]: undefined });
    onDirty(true);
  }
  function persist(submit: boolean) {
    if (saving.current) return false;
    const next = validateDraft(kind, draft, live ? false : submit, items);
    if (live && kind === "policies" && !draft.text.trim())
      next.text = "Enter the rule text.";
    if (live && kind === "guardrails" && !draft.policies.length)
      next.policies = "Select at least one published Policy.";
    setErrors(next);
    const invalid = Object.keys(next)[0];
    if (invalid) {
      document.getElementById(`${id}-${invalid}`)?.focus();
      return false;
    }
    setRequestError("");
    setSavedLink("");
    try {
      const result = onSave(draft, submit);
      if (result instanceof Promise) {
        saving.current = true;
        setPending(true);
        return result
          .then(() => true)
          .catch((error) => {
            setRequestError(
              error instanceof Error ? error.message : "Unable to save.",
            );
            if (error instanceof SavedDraftError)
              setSavedLink(
                error.kind === "guardrails"
                  ? `/guardrails/${encodeURIComponent(error.id)}`
                  : `/policies?item=${encodeURIComponent(error.id)}`,
              );
            return false;
          })
          .finally(() => {
            saving.current = false;
            setPending(false);
          });
      }
      return true;
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : "Unable to save.",
      );
      return false;
    }
  }
  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      save: () => persist(false),
      discard: () => {
        setDraft(initial ?? { ...blankDraft });
        setErrors({});
        setRequestError("");
        onDirty(false);
      },
    };
    return () => {
      controlsRef.current = null;
    };
  });
  const fieldProps = (key: keyof Draft) => ({
    id: `${id}-${key}`,
    "aria-invalid": !!errors[key],
    "aria-describedby": errors[key] ? `${id}-${key}-error` : undefined,
  });
  const error = (key: keyof Draft) =>
    errors[key] && (
      <span
        id={`${id}-${key}-error`}
        role="alert"
        className="text-xs text-red-700"
      >
        {errors[key]}
      </span>
    );
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        persist(inline ? false : true);
      }}
    >
      <fieldset
        disabled={pending || initial?.status === "Processing"}
        className={
          inline && kind === "guardrails"
            ? "grid min-h-0 flex-1 content-start gap-6 p-6 lg:grid-cols-2"
            : "min-h-0 flex-1 space-y-6 overflow-y-auto p-6"
        }
      >
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor={`${id}-name`}
        >
          Name
          <Input
            {...fieldProps("name")}
            className="h-11"
            value={draft.name}
            maxLength={160}
            onChange={(event) => update("name", event.target.value)}
          />
          {error("name")}
        </label>
        {kind === "policies" && (
          <label
            className="grid gap-2 text-sm font-medium"
            htmlFor={`${id}-text`}
          >
            Rule text
            <Textarea
              {...fieldProps("text")}
              className="min-h-60 resize-y bg-white p-3 font-normal leading-7 [field-sizing:fixed] sm:min-h-72"
              placeholder="Enter your rules…"
              maxLength={live ? 2000 : undefined}
              value={draft.text}
              onChange={(event) => update("text", event.target.value)}
            />
            {error("text")}
          </label>
        )}
        {inline &&
          initial?.kind === "policies" &&
          initial.status === "Ready" &&
          !live && (
            <p className="text-xs leading-5 text-muted-foreground">
              Saving creates a new version. Linked profiles keep their currently
              selected version.
            </p>
          )}
        {kind === "guardrails" && (
          <>
            <fieldset
              id={`${id}-policies`}
              tabIndex={-1}
              aria-describedby={
                errors.policies ? `${id}-policies-error` : undefined
              }
              className={
                inline
                  ? "space-y-3 outline-primary lg:col-start-2 lg:row-start-1 lg:row-span-3"
                  : "space-y-3 outline-primary"
              }
            >
              <legend className="mb-3 text-sm font-medium">
                Policies{" "}
                <span className="ml-2 text-xs text-muted-foreground">
                  {draft.policies.length} selected
                </span>
              </legend>
              <PolicyPicker
                items={items}
                selected={draft.policies}
                onChange={(policies) => {
                  setDraft({ ...draft, policies });
                  setErrors({ ...errors, policies: "" });
                  onDirty(true);
                }}
              />
              {error("policies")}
            </fieldset>
            {!live && (
              <>
                <label
                  className="grid gap-2 text-sm font-medium"
                  htmlFor={`${id}-useCase`}
                >
                  Use case
                  <Input
                    {...fieldProps("useCase")}
                    className="h-11"
                    value={draft.useCase}
                    onChange={(event) => update("useCase", event.target.value)}
                  />
                  {error("useCase")}
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  {scopeKeys.map((key) => (
                    <label
                      key={key}
                      className="grid content-start gap-2 text-sm font-medium"
                      htmlFor={`${id}-${key}`}
                    >
                      {scopeLabels[key]}
                      <select
                        {...fieldProps(key)}
                        className={selectClass}
                        value={draft[key]}
                        onChange={(event) => update(key, event.target.value)}
                      >
                        <option value="">Select</option>
                        {scopeOptions[key].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                      {error(key)}
                    </label>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </fieldset>
      {live && kind === "policies" && !policyAuthoring && (
        <p role="status" className="px-6 py-3 text-sm text-amber-800">
          Rule authoring is not configured. Contact your platform administrator.
        </p>
      )}
      {requestError && (
        <p role="alert" className="px-6 py-3 text-sm text-red-700">
          {requestError}
        </p>
      )}
      {savedLink && (
        <a
          className="px-6 pb-3 text-sm text-primary underline"
          href={savedLink}
        >
          Open saved draft
        </a>
      )}
      {inline ? (
        (changed ||
          initial?.status === "Draft" ||
          initial?.status === "Needs input") && (
          <footer className="sticky bottom-0 flex shrink-0 items-center justify-end gap-3 border-t bg-white px-6 py-4">
            {changed && (
              <>
                <span className="mr-auto text-xs text-muted-foreground">
                  Unsaved changes
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setDraft(initial ?? { ...blankDraft });
                    setErrors({});
                    setRequestError("");
                    onDirty(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    pending || (live && kind === "policies" && !policyAuthoring)
                  }
                >
                  {pending ? "Saving…" : "Save"}
                </Button>
              </>
            )}
            {!changed && (
              <Button
                type="button"
                disabled={
                  pending || (live && kind === "policies" && !policyAuthoring)
                }
                onClick={() => persist(true)}
              >
                Submit
              </Button>
            )}
          </footer>
        )
      ) : (
        <footer className="flex shrink-0 justify-end gap-3 border-t bg-white px-6 py-4">
          <Button
            disabled={
              pending || (live && kind === "policies" && !policyAuthoring)
            }
            type="button"
            variant="outline"
            onClick={() => persist(false)}
          >
            Save draft
          </Button>
          <Button
            disabled={
              pending || (live && kind === "policies" && !policyAuthoring)
            }
            type="submit"
          >
            {pending ? "Saving…" : "Submit"}
            <ArrowRight className="size-4" />
          </Button>
        </footer>
      )}
    </form>
  );
}

function PolicyPicker({
  items,
  selected,
  onChange,
}: {
  items: Entity[];
  selected: PolicyReference[];
  onChange: (refs: PolicyReference[]) => void;
}) {
  const [query, setQuery] = useState("");
  const choices = items
    .filter((p) => p.kind === "policies")
    .map((p) => {
      const revisions = availableRevisions(p);
      return selected.find((r) => r.policyId === p.id) ?? revisions.at(-1);
    })
    .filter((r): r is PolicyReference => !!r);
  const visible = choices.filter((r) =>
    `${r.name} ${r.text}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="border-b p-3">
        <Input
          aria-label="Search ready policies"
          placeholder="Search policies…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="max-h-72 overflow-y-auto divide-y">
        {visible.map((ref) => (
          <div key={ref.policyId} className="p-3">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={selected.some((r) => r.policyId === ref.policyId)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, ref]
                      : selected.filter((r) => r.policyId !== ref.policyId),
                  )
                }
              />
              <span className="min-w-0 flex-1 break-words">{ref.name}</span>
              <span className="text-xs text-muted-foreground">
                v{ref.version}
              </span>
            </label>
            <details className="mt-2 pl-7 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Rule text</summary>
              <p className="mt-2 whitespace-pre-wrap break-words leading-6">
                {ref.text}
              </p>
            </details>
          </div>
        ))}
        {!visible.length && (
          <p className="p-5 text-sm text-muted-foreground">
            {choices.length ? "No matching policies" : "No ready policies"}
          </p>
        )}
      </div>
    </div>
  );
}

export function EntityDetail({
  item,
  selectedVersion,
  onEdit,
  onDirty,
  onDeleted,
}: {
  onDirty?: (dirty: boolean) => void;
  onDeleted?: () => void;
  item: Entity;
  selectedVersion?: string | number | undefined;
  onEdit: () => void;
}) {
  const { items, save } = useBusinessDemo();
  const [detailDirty, setDetailDirty] = useState(false);
  const controlsRef = useRef<EditorControls | null>(null);
  const version = selectedVersion ?? item.version;
  const historical =
    item.kind === "policies" && String(version) !== String(item.version);
  const revision = historical
    ? availableRevisions(item).find(
        (r) => String(r.version) === String(version),
      )
    : undefined;
  const editable =
    !historical && !item.remote?.readOnly && item.status !== "Processing";
  const viewed = revision
    ? { ...item, ...revision, status: "Ready" as const }
    : item;
  const usedBy = items.filter(
    (guard) =>
      guard.kind === "guardrails" &&
      guard.policies.some(
        (r) => r.policyId === item.id && String(r.version) === String(version),
      ),
  );
  if (historical && !revision)
    return <p className="p-6 text-sm">Policy version not found</p>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StatusBadge status={viewed.status} />
            {item.kind === "policies" && (
              <span className="text-xs text-muted-foreground">v{version}</span>
            )}
          </div>
          <h2 className="break-words font-heading text-2xl leading-normal">
            {viewed.name}
          </h2>
          <p className="text-xs text-muted-foreground">{item.owner}</p>
        </div>
        {!historical && item.status === "Processing" && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800"
          >
            <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" />
            Processing rules
          </div>
        )}
        {!historical && item.status === "Needs input" && (
          <p
            tabIndex={0}
            className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"
          >
            {item.question}
          </p>
        )}
        {editable && (
          <EntityEditor
            key={`${item.id}-${item.updatedAt}-${item.version}`}
            kind={item.kind}
            initial={item}
            inline
            controlsRef={controlsRef}
            onDirty={(value) => {
              setDetailDirty(value);
              onDirty?.(value);
            }}
            onSave={(draft, submit) => {
              const result = save(item.kind, draft, submit, item);
              if (result instanceof Promise)
                return result.then(() => {
                  onDirty?.(false);
                });
              onDirty?.(false);
            }}
          />
        )}
        {!editable &&
          (item.kind === "policies" ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Rule text</h3>
              <p className="whitespace-pre-wrap break-words rounded-md border bg-zinc-50/60 p-4 text-sm leading-7">
                {viewed.text || "—"}
              </p>
            </section>
          ) : (
            <section className="space-y-3">
              <h3 className="text-sm font-medium">
                Policies{" "}
                <span className="text-muted-foreground">
                  ({item.policies.length})
                </span>
              </h3>
              <div className="divide-y rounded-md border">
                {item.policies.map((ref) => (
                  <div key={ref.policyId} className="p-4">
                    <a
                      className="flex items-center justify-between gap-3 text-sm font-medium hover:text-primary"
                      href={`/policies?item=${encodeURIComponent(ref.policyId)}&version=${ref.version}`}
                    >
                      <span>{ref.name}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        v{ref.version}
                        <ArrowRight className="size-4" />
                      </span>
                    </a>
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Rule text</summary>
                      <p className="mt-2 whitespace-pre-wrap break-words leading-6">
                        {ref.text}
                      </p>
                    </details>
                  </div>
                ))}
                {!item.policies.length && (
                  <p className="p-4 text-sm text-muted-foreground">
                    No policies selected
                  </p>
                )}
              </div>
            </section>
          ))}
        {editable && item.kind === "guardrails" && (
          <div className="flex flex-wrap gap-3">
            {item.policies.map((ref) => (
              <a
                key={ref.policyId}
                className="text-sm text-primary underline"
                href={`/policies?item=${encodeURIComponent(ref.policyId)}&version=${encodeURIComponent(ref.version)}`}
              >
                {ref.name} · v{ref.version}
              </a>
            ))}
          </div>
        )}
        {item.kind === "policies" && (
          <>
            <section className="space-y-3">
              <h3 className="text-sm font-medium">
                Used by Guardrails{" "}
                <span className="text-muted-foreground">({usedBy.length})</span>
              </h3>
              <div className="divide-y rounded-md border">
                {usedBy.map((guard) => (
                  <a
                    key={guard.id}
                    className="flex items-center justify-between gap-3 p-4 text-sm hover:bg-red-50/40"
                    href={`/guardrails?item=${encodeURIComponent(guard.id)}`}
                  >
                    <span>{guard.name}</span>
                    <StatusBadge status={guard.status} />
                  </a>
                ))}
                {!usedBy.length && (
                  <p className="p-4 text-sm text-muted-foreground">
                    No linked guardrails
                  </p>
                )}
              </div>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Versions</h3>
              <div className="flex flex-wrap gap-2">
                {[
                  ...new Set([
                    ...item.revisions.map((r) => r.version),
                    item.version,
                  ]),
                ]
                  .sort((a, b) =>
                    String(b).localeCompare(String(a), undefined, {
                      numeric: true,
                    }),
                  )
                  .map((v) => (
                    <a
                      key={v}
                      aria-current={
                        String(v) === String(version) ? "page" : undefined
                      }
                      className={`rounded border px-3 py-1 text-xs ${String(v) === String(version) ? "border-primary bg-red-50 text-primary" : "hover:bg-muted"}`}
                      href={`/policies?item=${encodeURIComponent(item.id)}&version=${encodeURIComponent(v)}`}
                    >
                      v{v}
                      {v === item.version ? " · Latest" : ""}
                    </a>
                  ))}
              </div>
            </section>
          </>
        )}
        {!editable && item.kind === "guardrails" && (
          <dl className="grid grid-cols-2 gap-5 text-sm">
            <div className="col-span-2">
              <dt className="mb-1 text-xs text-muted-foreground">Use case</dt>
              <dd>{item.useCase || "—"}</dd>
            </div>
            {scopeKeys.map((key) => (
              <div key={key}>
                <dt className="mb-1 text-xs text-muted-foreground">
                  {scopeLabels[key]}
                </dt>
                <dd>{item[key] || "—"}</dd>
              </div>
            ))}
          </dl>
        )}
        {!historical && (
          <dl className="space-y-3 border-t pt-5 text-xs text-muted-foreground">
            {[
              ["Created", item.createdAt],
              ["Updated", item.updatedAt],
              ["Submitted", item.submittedAt],
              ["Completed", item.completedAt],
            ].map(
              ([label, time]) =>
                typeof time === "number" &&
                time > 0 && (
                  <div key={label} className="flex justify-between gap-3">
                    <dt>{label}</dt>
                    <dd>{new Date(time).toLocaleString("en-GB")}</dd>
                  </div>
                ),
            )}
          </dl>
        )}
      </div>
      {!historical && <BackendActions item={item} />}
      {!historical && (
        <div className="border-t px-6 py-4">
          <DeleteEntityAction
            item={item}
            onDeleted={onDeleted}
            dirty={detailDirty}
            editorControls={controlsRef}
          />
        </div>
      )}
    </div>
  );
}

export function BackendActions({ item }: { item: Entity }) {
  const { publish, validate } = useBusinessDemo();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  if (!item.remote || item.remote.readOnly || !publish || !validate)
    return null;
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return (
    <section className="space-y-2 border-t p-4">
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          disabled={pending || item.status === "Processing"}
          onClick={() => void run(() => validate(item))}
        >
          Run validation
        </Button>
        <Button
          disabled={pending || !item.remote.publishable}
          onClick={() => {
            if (window.confirm("Publish this validated revision?"))
              void run(() => publish(item));
          }}
        >
          Publish
        </Button>
      </div>
    </section>
  );
}
