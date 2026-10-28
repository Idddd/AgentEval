import { expect, it, vi } from "vitest";
import { GuardAdapter } from "./guard-api";
import { blankDraft } from "./model";
it("loads latest NeMo drafts without treating a baseline version as runtime activation", async () => {
  const draft = { id: "profile", name: "Local profile", status: "draft", createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", draftRevision: 1, runtimeProfile: "auto", draftConfig: { policyBindings: [] }, baselineVersion: "1.0.0", versions: [], latestValidationRun: null };
  const fetcher = vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).endsWith("/policies") ? { items: [] } : String(url).endsWith("/guardrails") ? { items: [draft] } : draft));
  const api = new GuardAdapter("token", { mode: "live", sourceId: "local", policyAuthoring: true, crudOnly: true }, fetcher);
  expect((await api.load())[0]).toMatchObject({ name: "Local profile", status: "Draft" });
});
it("loads current NeMo published snapshots without optional owner metadata", async () => {
  const fetcher = vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).endsWith("/policies") ? { items: [{
    id: "builtin", name: "Local rule", description: "Built-in rule", version: "1", implementation: "rules",
    published_versions: [{ name: "Local rule", description: "Built-in rule", version: "1" }],
  }] } : { items: [] }));
  const api = new GuardAdapter("token", { mode: "live", sourceId: "local", policyAuthoring: true, crudOnly: true }, fetcher);
  expect((await api.load())[0]).toMatchObject({ name: "Local rule", status: "Ready", remote: { readOnly: true } });
});
it("loads unvalidated drafts without requesting evaluation results", async () => {
  const fetcher = vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).endsWith("/guardrails")) return Response.json({ items: [] });
    if (String(url).endsWith("/policies")) return Response.json({ items: [{ id: "p", name: "Draft", description: "Rule", version: "0", implementation: "nemo_native", published_versions: [], implementation_detail: { name: "Draft", description: "Rule", owner: "Owner", updated_at: "2026-09-21T00:00:00Z", draft_revision: 1, draft: {}, versions: [] } }] });
    throw new Error("Evaluation must not be queried");
  });
  const api = new GuardAdapter("token", { mode: "live", sourceId: "local", policyAuthoring: true, crudOnly: true }, fetcher);
  expect((await api.load())[0]?.status).toBe("Draft");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("creates a real draft without invoking authoring, evaluation or publication", async () => {
  const fetcher = vi.fn(async () => Response.json({ id: "policy-real" }));
  const api = new GuardAdapter("token", { mode: "live", sourceId: "local", policyAuthoring: true, crudOnly: true }, fetcher);
  expect(await api.save("policies", { ...blankDraft, name: "Business rule", text: "Protect data" }, true)).toBe("policy-real");
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, options] = (fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0]!;
  expect(url).toBe("/api/guard/policies");
  const payload = JSON.parse(options.body as string);
  expect(payload.description).toBe("Protect data");
  expect(payload.draft.sources[0].content).toContain("No executable flow");
  expect(payload.draft.rail_bindings[0].on_unsafe).toBe("block");
});
