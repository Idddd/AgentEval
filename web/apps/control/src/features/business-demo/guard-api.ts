import { z } from "zod";
import {
  blankDraft,
  type Draft,
  type Entity,
  type Kind,
  type PolicyReference,
} from "./model";

export const runtimeSchema = z.object({
  sharedDemo: z.boolean().optional(),
  marketplaceDb: z.boolean().optional(),
  mode: z.enum(["mock", "live", "auto"]),
  sourceId: z.string(),
  policyAuthoring: z.boolean(),
  autoConnect: z.boolean().optional(),
  crudOnly: z.boolean().optional(),
  f5Mock: z.boolean().optional(),
});
export type RuntimeConfig = z.infer<typeof runtimeSchema>;
export class GuardApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export class SavedDraftError extends Error {
  constructor(
    public kind: Kind,
    public id: string,
    message: string,
  ) {
    super(message);
  }
}
export async function jsonRequest(
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(path, {
      method,
      credentials: "omit",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}),
      signal: AbortSignal.timeout(65_000),
    });
  } catch {
    throw new GuardApiError(
      method === "GET"
        ? "Cannot connect to Guard."
        : "Connection lost. Check the saved record before retrying.",
      503,
      "upstream_unavailable",
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new GuardApiError(
      "Backend returned an invalid response.",
      502,
      "invalid_response",
    );
  }
  if (!response.ok) {
    const error = z
      .object({ error: z.object({ message: z.string(), code: z.string() }) })
      .safeParse(data);
    throw new GuardApiError(
      error.success
        ? error.data.error.message
        : `Request failed (${response.status}).`,
      response.status,
      error.success ? error.data.error.code : "request_failed",
    );
  }
  return data;
}
export const mayUseMock = (error: unknown) =>
  error instanceof GuardApiError && error.code === "upstream_unavailable";
const object = z.record(z.string(), z.unknown());
const bindingMetadata = {
  rules: z.array(z.looseObject({ id: z.string() })).optional(),
  rails: z.array(z.enum(["input", "output", "retrieval", "dialog", "execution"])).optional(),
  parameters: z.array(z.looseObject({
    name: z.string(), default: z.string().nullable().optional(),
  })).optional(),
};
const snapshotSchema = z.looseObject({
  ...bindingMetadata,
  version: z.string(),
  name: z.string(),
  description: z.string(),
  owner: z.string(),
});
const policySchema = z.looseObject({
  ...bindingMetadata,
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  implementation: z.enum(["rules", "nemo_native"]),
  owner: z.string().optional(),
  updated_at: z.string().optional(),
  published_versions: z.array(snapshotSchema).optional(),
  implementation_detail: z
    .looseObject({
      name: z.string(),
      description: z.string(),
      owner: z.string(),
      updated_at: z.string(),
      draft_revision: z.number(),
      draft: object,
      versions: z.array(snapshotSchema),
    })
    .optional(),
});
const runSchema = z.looseObject({
  id: z.string(),
  status: z.enum(["queued", "running", "passed", "failed"]),
  draftRevision: z.number().optional(),
  sourceDraftRevision: z.number().optional(),
  failureReason: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});
const guardSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  status: z.enum(["draft", "active", "disabled"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  draftRevision: z.number(),
  activeVersion: z.string().nullable(),
  runtimeProfile: z.string(),
  draftConfig: z.looseObject({
    policyBindings: z.array(
      z.looseObject({ policyId: z.string(), policyVersion: z.string() }),
    ),
  }),
  latestValidationRun: runSchema.nullable(),
  versions: z.array(
    z.looseObject({
      version: z.string(),
      sourceDraftRevision: z.number(),
      status: z.enum(["compiling", "failed", "ready"]),
      failureReason: z.string().nullable().optional(),
    }),
  ),
});
type Policy = z.infer<typeof policySchema>;
type Guard = z.infer<typeof guardSchema>;
type Run = z.infer<typeof runSchema>;
const validationResultsSchema = z.array(z.object({
  passed: z.boolean(),
  name: z.string().optional(),
  policyId: z.string().optional(),
  expectedDecision: z.string().nullable().optional(),
  actualDecision: z.string().nullable().optional(),
  assertionFailures: z.array(z.string()).optional(),
  matchedRuleIds: z.array(z.string()).optional(),
}));
function validationFailure(run?: Run | null, policies: Entity[] = []): string {
  const reason = run?.failureReason?.trim();
  const parsed = validationResultsSchema.safeParse(run?.results);
  const results = parsed.success ? parsed.data : [];
  const failed = results.filter((result) => !result.passed);
  if (!failed.length)
    return reason || "Validation failed. The backend did not return test failure details.";
  const summary = `${failed.length} of ${results.length} checks failed (${results.length - failed.length} passed).`;
  const details = failed.map((result, index) => {
    const policy = policies.find((item) => item.id === result.policyId);
    const label = policy?.name ?? result.policyId;
    return [
      `${index + 1}. ${result.name || "Unnamed test"}${label ? ` — ${label}` : ""}`,
      ...(result.expectedDecision && result.actualDecision
        ? [`Expected: ${result.expectedDecision}. Actual: ${result.actualDecision}.`] : []),
      ...(result.assertionFailures ?? []).filter((message) => message.trim()),
      ...(result.matchedRuleIds?.length ? [`Matched rules: ${result.matchedRuleIds.join(", ")}`] : []),
    ].join("\n");
  });
  return [summary, ...(reason ? [reason] : []), ...details].join("\n\n");
}
export class BatchSaveError extends Error {
  constructor(message: string, public completed: Array<"Guard" | "F5">) { super(message); }
}
export type TrackedJob = {
  kind: Kind;
  id: string;
  runId: string;
  revision: number;
};
const jobsSchema = z.array(
  z.object({
    kind: z.enum(["policies", "guardrails"]),
    id: z.string(),
    runId: z.string(),
    revision: z.number(),
  }),
);
const stamp = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>;
  return (
    Object.keys(x).length === Object.keys(y).length &&
    Object.keys(x).every((k) => same(x[k], y[k]))
  );
};
export function policyEntity(p: Policy, run?: Run | null): Entity {
  const d = p.implementation_detail;
  const revisions = (p.published_versions ?? (d ? [] : [p]))
    .map((s) => ({ version: s.version, name: s.name, text: s.description }))
    .sort((a, b) =>
      a.version.localeCompare(b.version, undefined, { numeric: true }),
    );
  // The surface is published metadata; editor metadata comes from implementation_detail.
  const published = d?.versions.find(
    (v) =>
      v.name === d.name &&
      v.description === d.description &&
      v.owner === d.owner &&
      Object.entries(d.draft).every(([key, value]) => same(v[key], value)),
  );
  const currentRun = d && run?.draftRevision === d.draft_revision ? run : null;
  const running =
    currentRun?.status === "running" || currentRun?.status === "queued";
  const status = running
    ? "Processing"
    : published || !d
      ? "Ready"
      : currentRun?.status === "failed"
        ? "Needs input"
        : currentRun?.status === "passed"
          ? "Validated"
          : "Draft";
  return {
    ...blankDraft,
    id: p.id,
    kind: "policies",
    name: d?.name ?? p.name,
    text: d?.description ?? p.description,
    owner: d?.owner ?? p.owner ?? "",
    version:
      published?.version ?? (d ? `draft-${d.draft_revision}` : p.version),
    revisions,
    status,
    createdAt: 0,
    updatedAt: stamp(d?.updated_at ?? p.updated_at),
    ...(currentRun?.completedAt
      ? { completedAt: stamp(currentRun.completedAt) }
      : {}),
    ...(currentRun?.status === "failed"
      ? {
          question: validationFailure(currentRun),
        }
      : {}),
    remote: {
      readOnly: !d,
      draftRevision: d?.draft_revision ?? 0,
      publishable: status === "Validated",
    },
  };
}
export function guardEntity(
  g: Guard,
  policies: Entity[],
  trackedRun?: Run,
): Entity {
  const refs = g.draftConfig.policyBindings.map((binding) => {
    const policy = policies.find((p) => p.id === binding.policyId);
    const ref = policy?.revisions.find(
      (r) => String(r.version) === binding.policyVersion,
    );
    return {
      policyId: binding.policyId,
      version: binding.policyVersion,
      name: ref?.name ?? policy?.name ?? binding.policyId,
      text: ref?.text ?? "",
    };
  });
  const candidate = trackedRun ?? g.latestValidationRun;
  const run =
    candidate?.sourceDraftRevision === g.draftRevision ? candidate : null;
  const version = g.versions.find(
    (v) => v.sourceDraftRevision === g.draftRevision,
  );
  const status =
    version?.status === "compiling" ||
    run?.status === "queued" ||
    run?.status === "running"
      ? "Processing"
      : version?.status === "failed" || run?.status === "failed"
        ? "Needs input"
        : g.status === "disabled"
          ? "Deprecated"
          : g.status === "active"
            ? "Active"
            : run?.status === "passed"
              ? "Validated"
              : "Draft";
  return {
    ...blankDraft,
    id: g.id,
    kind: "guardrails",
    name: g.name,
    owner: "",
    policies: refs,
    version: g.activeVersion ?? `draft-${g.draftRevision}`,
    revisions: [],
    createdAt: stamp(g.createdAt),
    updatedAt: stamp(g.updatedAt),
    status,
    ...(run?.completedAt ? { completedAt: stamp(run.completedAt) } : {}),
    ...(status === "Needs input"
      ? {
          question:
            version?.status === "failed"
              ? version.failureReason?.trim() || "Compilation failed. The backend did not return compilation details."
              : validationFailure(run, policies),
        }
      : {}),
    remote: {
      readOnly: false,
      draftRevision: g.draftRevision,
      publishable:
        run?.status === "passed" &&
        version?.status !== "compiling" &&
        g.activeVersion !== version?.version,
    },
  };
}

export class GuardAdapter {
  policies = new Map<string, Policy>();
  guards = new Map<string, Guard>();
  jobs: TrackedJob[] = [];
  constructor(
    public token: string,
    public config: RuntimeConfig,
    private fetcher: typeof fetch = fetch,
  ) {
    try {
      this.jobs = jobsSchema.parse(
        JSON.parse(
          sessionStorage.getItem(`guard.jobs.${config.sourceId}`) ?? "[]",
        ),
      );
    } catch {
      /* no storage */
    }
  }
  request(path: string, method = "GET", body?: unknown) {
    return jsonRequest(
      `/api/guard${path}`,
      this.token,
      method,
      body,
      this.fetcher,
    );
  }
  track(job: TrackedJob) {
    this.jobs = [
      ...this.jobs.filter((j) => j.kind !== job.kind || j.id !== job.id),
      job,
    ];
    try {
      sessionStorage.setItem(
        `guard.jobs.${this.config.sourceId}`,
        JSON.stringify(this.jobs),
      );
    } catch {
      /* server state is still authoritative */
    }
  }
  async load(): Promise<Entity[]> {
    const [policyData, guardData] = await Promise.all([
      this.request("/policies"),
      this.request("/guardrails"),
    ]);
    const policies = z
      .object({ items: z.array(policySchema) })
      .parse(policyData).items;
    const summaries = z
      .object({ items: z.array(z.object({ id: z.string() })) })
      .parse(guardData).items;
    const guards = await Promise.all(
      summaries.map(async (g) =>
        guardSchema.parse(
          await this.request(`/guardrails/${encodeURIComponent(g.id)}`),
        ),
      ),
    );
    const entities = await Promise.all(
      policies.map(async (p) => {
        let run: Run | null = null;
        if (p.implementation_detail && !this.config.crudOnly) {
          const job = this.jobs.find(
            (j) =>
              j.kind === "policies" &&
              j.id === p.id &&
              j.revision === p.implementation_detail?.draft_revision,
          );
          const path = `/policies/${encodeURIComponent(p.id)}/validation-runs/${job ? encodeURIComponent(job.runId) : "latest"}`;
          run = runSchema.nullable().parse(await this.request(path));
        }
        return policyEntity(p, run);
      }),
    );
    const guardEntities = await Promise.all(
      guards.map(async (g) => {
        const job = this.jobs.find(
          (j) =>
            j.kind === "guardrails" &&
            j.id === g.id &&
            j.revision === g.draftRevision,
        );
        const run = job && !this.config.crudOnly
          ? runSchema.parse(
              await this.request(
                `/validation-runs/${encodeURIComponent(job.runId)}`,
              ),
            )
          : undefined;
        return guardEntity(g, entities, run);
      }),
    );
    this.policies = new Map(policies.map((p) => [p.id, p]));
    this.guards = new Map(guards.map((g) => [g.id, g]));
    return [...entities, ...guardEntities];
  }
  async save(
    kind: Kind,
    draft: Draft,
    submit: boolean,
    existing?: Entity,
  ): Promise<string> {
    let id: string;
    if (this.config.crudOnly && kind === "policies") {
      if (existing?.remote?.readOnly) throw new Error("Built-in policies are read-only.");
      const record = z.object({ id: z.string() }).parse(await this.request(
        existing ? `/policies/${encodeURIComponent(existing.id)}` : "/policies",
        existing ? "PATCH" : "POST",
        { name: draft.name.trim(), description: draft.text.trim(),
          ...(!existing ? { owner: "Marketplace", draft: {
            guardrail_category: "content_safety", colang_version: "2.x",
            sources: [{ path: "unimplemented.co", content: "# CRUD-only draft. Rule text is metadata. No executable flow is implemented.\n" }],
            rail_bindings: [{ rail_type: "input", flow_name: "unimplemented", execution_mode: "detect", on_unsafe: "reject" }],
          } } : {}),
        },
      ));
      return record.id;
    }
    if (kind === "policies") {
      if (!this.config.policyAuthoring)
        throw new Error(
          "Rule authoring is not configured. Contact your platform administrator.",
        );
      if (existing?.remote?.readOnly)
        throw new Error("This Policy is read-only.");
      // Optional external business-authoring service, NOT a Guard OpenAPI route.
      // It must return a real programmable draft; natural language is never used as executable source.
      const generated = z
        .object({
          owner: z.string().min(1),
          draft: z.looseObject({
            guardrail_category: z.string(),
            sources: z
              .array(z.object({ path: z.string(), content: z.string() }))
              .min(1),
            rail_bindings: z.array(object).min(1),
          }),
        })
        .parse(
          await jsonRequest(
            "/api/guard-policy-draft",
            this.token,
            "POST",
            {
              name: draft.name.trim(),
              text: draft.text.trim(),
              ...(existing
                ? {
                    policyId: existing.id,
                    expectedDraftRevision: existing.remote?.draftRevision,
                  }
                : {}),
            },
            this.fetcher,
          ),
        );
      const payload = {
        name: draft.name.trim(),
        description: draft.text.trim(),
        owner: generated.owner,
        draft: generated.draft,
      };
      const record = z
        .object({ id: z.string() })
        .parse(
          await this.request(
            existing
              ? `/policies/${encodeURIComponent(existing.id)}`
              : "/policies",
            existing ? "PATCH" : "POST",
            payload,
          ),
        );
      id = record.id;
    } else {
      if (!draft.policies.length)
        throw new Error("Select at least one published Policy.");
      const old = existing ? this.guards.get(existing.id) : undefined;
      const policyBindings = draft.policies.map((ref) => {
        const policy = this.policies.get(ref.policyId);
        const available =
          policy &&
          (policy.published_versions ??
            (policy.implementation_detail ? [] : [policy]));
        const selected = available?.find((p) => p.version === String(ref.version));
        if (!selected)
          throw new Error(
            "A selected Policy version is unavailable. Reload and select again.",
          );
        const pinned = old?.draftConfig.policyBindings.find(
          (b) =>
            b.policyId === ref.policyId &&
            b.policyVersion === String(ref.version),
        );
        return (
          pinned ?? {
            policyId: ref.policyId,
            policyVersion: String(ref.version),
            enabledRuleIds: (selected.rules ?? []).map((rule) => rule.id),
            enabledRails: selected.rails ?? [],
            parameterValues: Object.fromEntries(
              (selected.parameters ?? []).flatMap((parameter) =>
                parameter.default == null ? [] : [[parameter.name, parameter.default]],
              ),
            ),
          }
        );
      });
      const payload = {
        name: draft.name.trim(),
        runtimeProfile: old?.runtimeProfile ?? "auto",
        draftConfig: { ...(old?.draftConfig ?? {}), policyBindings },
      };
      id = z
        .object({ id: z.string() })
        .parse(
          await this.request(
            existing
              ? `/guardrails/${encodeURIComponent(existing.id)}`
              : "/guardrails",
            existing ? "PATCH" : "POST",
            payload,
          ),
        ).id;
    }
    if (submit && !this.config.crudOnly) {
      try {
        const run = runSchema.parse(
          await this.request(
            `/${kind}/${encodeURIComponent(id)}/validation-runs`,
            "POST",
          ),
        );
        this.track({
          kind,
          id,
          runId: run.id,
          revision: run.draftRevision ?? run.sourceDraftRevision ?? 0,
        });
      } catch (error) {
        throw new SavedDraftError(
          kind,
          id,
          `Draft saved (${id}), but validation could not be confirmed. Check this record before retrying. ${error instanceof Error ? error.message : ""}`,
        );
      }
    }
    return id;
  }
  async publish(item: Entity) {
    if (!item.remote?.publishable)
      throw new Error("Validate the current draft before publishing.");
    return this.request(
      `/${item.kind}/${encodeURIComponent(item.id)}/publish`,
      "POST",
      { expectedDraftRevision: item.remote.draftRevision },
    );
  }
  async remove(item: Entity) {
    if (!this.config.crudOnly) throw new Error("Deletion is not enabled.");
    if (item.remote?.readOnly || item.status === "Active") throw new Error("This record cannot be deleted in CRUD mode.");
    await this.request(`/${item.kind}/${encodeURIComponent(item.id)}`, "DELETE", { reason: "Deleted from Marketplace CRUD UI" });
  }
  async validate(item: Entity) {
    if (item.remote?.readOnly) throw new Error("This Policy is read-only.");
    const run = runSchema.parse(
      await this.request(
        `/${item.kind}/${encodeURIComponent(item.id)}/validation-runs`,
        "POST",
      ),
    );
    this.track({
      kind: item.kind,
      id: item.id,
      runId: run.id,
      revision: run.draftRevision ?? run.sourceDraftRevision ?? 0,
    });
  }
}
