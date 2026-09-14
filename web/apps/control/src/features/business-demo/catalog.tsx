import { useEffect, useId, useState, useRef } from "react";
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
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  Deprecated: "bg-zinc-100 text-zinc-500",
  Validated: "bg-emerald-50 text-emerald-700",
};

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
  const title = policy ? "Policies" : "Guardrails";
  const singular = policy ? "Policy" : "Guardrail";
  const Icon = policy ? FileText : ShieldCheck;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [scope, setScope] = useState<Partial<Record<ScopeKey, string>>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = items.find(
    (item) => item.kind === kind && item.id === selectedId,
  );
  const filtered = filterEntities(items, kind, query, status, scope);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const filterCount = Object.values(scope).filter(Boolean).length;
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
      : ["Draft", "Processing", "Review", "Active", "Deprecated"];
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
    setStatus("");
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
          <select
            aria-label="Status"
            className={`${selectClass} !w-auto`}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {availableStatuses.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          {!policy && mode !== "live" && (
            <Button
              variant="outline"
              className="h-10"
              aria-expanded={filtersOpen}
              aria-controls="scope-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal className="size-4" />
              Filters
              {filterCount > 0 && (
                <span className="rounded bg-accent px-1.5 text-primary">
                  {filterCount}
                </span>
              )}
            </Button>
          )}
        </div>
        {filtersOpen && !policy && (
          <div
            id="scope-filters"
            className="grid gap-3 border-b bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            {scopeKeys.map((key) => (
              <label key={key} className="grid gap-1.5 text-xs font-medium">
                {scopeLabels[key]}
                <select
                  className={selectClass}
                  value={scope[key] ?? ""}
                  onChange={(event) => {
                    setScope({ ...scope, [key]: event.target.value });
                    setPage(1);
                  }}
                >
                  <option value="">All</option>
                  {scopeOptions[key].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            ))}
            <Button
              variant="ghost"
              className="self-end"
              onClick={() => {
                setScope({});
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
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
}: {
  kind: Kind;
  initial?: Entity | undefined;
  onDirty: () => void;
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
  function update(key: keyof Draft, value: string) {
    setDraft({ ...draft, [key]: value });
    setErrors({ ...errors, [key]: undefined });
    onDirty();
  }
  function persist(submit: boolean) {
    if (saving.current) return;
    const next = validateDraft(kind, draft, live ? false : submit, items);
    if (live && kind === "policies" && !draft.text.trim())
      next.text = "Enter the rule text.";
    if (live && kind === "guardrails" && !draft.policies.length)
      next.policies = "Select at least one published Policy.";
    setErrors(next);
    const invalid = Object.keys(next)[0];
    if (invalid) {
      document.getElementById(`${id}-${invalid}`)?.focus();
      return;
    }
    setRequestError("");
    setSavedLink("");
    try {
      const result = onSave(draft, submit);
      if (result instanceof Promise) {
        saving.current = true;
        setPending(true);
        void result
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
          })
          .finally(() => {
            saving.current = false;
            setPending(false);
          });
      }
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : "Unable to save.",
      );
    }
  }
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
        persist(true);
      }}
    >
      <fieldset
        disabled={pending}
        className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6"
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
        {kind === "guardrails" && (
          <>
            <fieldset
              id={`${id}-policies`}
              tabIndex={-1}
              aria-describedby={
                errors.policies ? `${id}-policies-error` : undefined
              }
              className="space-y-3 outline-primary"
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
                  onDirty();
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
}: {
  item: Entity;
  selectedVersion?: string | number | undefined;
  onEdit: () => void;
}) {
  const { items } = useBusinessDemo();
  const version = selectedVersion ?? item.version;
  const historical =
    item.kind === "policies" && String(version) !== String(item.version);
  const revision = historical
    ? availableRevisions(item).find(
        (r) => String(r.version) === String(version),
      )
    : undefined;
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
          <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {item.question}
          </p>
        )}
        {item.kind === "policies" ? (
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
        {item.kind === "guardrails" && (
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
      {!historical &&
        !item.remote?.readOnly &&
        (item.status === "Draft" ||
          item.status === "Validated" ||
          item.status === "Needs input" ||
          (item.kind === "policies" && item.status === "Ready")) && (
          <footer className="flex justify-end border-t px-6 py-4">
            <Button onClick={onEdit}>
              {item.status === "Ready"
                ? "Create new version"
                : item.status === "Draft"
                  ? "Edit draft"
                  : "Update rules"}
              <ArrowRight className="size-4" />
            </Button>
          </footer>
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
