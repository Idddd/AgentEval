import { describe, expect, it, vi } from "vitest";
import {
  GuardAdapter,
  GuardApiError,
  guardEntity,
  jsonRequest,
  mayUseMock,
  policyEntity,
} from "./guard-api";
import { blankDraft } from "./model";

export const builtin = {
  id: "builtin",
  name: "Privacy",
  description: "Protect private data",
  version: "2026.09",
  implementation: "rules" as const,
};
const config = {
  mode: "live" as const,
  sourceId: "test",
  policyAuthoring: false,
};
const nativeDraft = {
  sources: [{ path: "policy.co", content: "flow test" }],
  rail_bindings: [{ rail_type: "input" }],
  guardrail_category: "pii_detection",
};
const native = {
  id: "custom",
  name: "Published policy",
  description: "Old rules",
  version: "1",
  implementation: "nemo_native" as const,
  published_versions: [
    {
      version: "1",
      name: "Published policy",
      description: "Old rules",
      owner: "ISS",
    },
  ],
  implementation_detail: {
    name: "Draft policy",
    description: "New rules",
    owner: "ISS",
    updated_at: "2026-09-15T00:00:00Z",
    draft_revision: 3,
    draft: nativeDraft,
    versions: [
      {
        ...nativeDraft,
        version: "1",
        name: "Published policy",
        description: "Old rules",
        owner: "ISS",
      },
    ],
  },
};
export const guard = {
  id: "guard-1",
  name: "Customer protection",
  status: "draft" as const,
  draftRevision: 2,
  activeVersion: null,
  createdAt: "2026-09-15T00:00:00Z",
  updatedAt: "2026-09-15T00:00:00Z",
  runtimeProfile: "auto",
  draftConfig: {
    safetyLevel: "strict",
    outputDelivery: "full_buffered",
    policyBindings: [
      {
        policyId: "builtin",
        policyVersion: "2026.09",
        parameterValues: { locale: "SG" },
        ruleActions: { privacy: "reject" },
      },
    ],
  },
  latestValidationRun: null,
  versions: [],
};
const json = (value: unknown, status = 200) => Response.json(value, { status });
export function apiFetch(
  extra?: (path: string, method: string, body: unknown) => Response | undefined,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const supplied = extra?.(path, method, body);
    if (supplied) return supplied;
    if (path === "/api/guard/policies")
      return json({ items: [builtin], count: 1 });
    if (path === "/api/guard/guardrails") return json({ items: [guard] });
    if (path === "/api/guard/guardrails/guard-1") return json(guard);
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
}
describe("Guard OpenAPI adapter", () => {
  it("loads real data without seeding mock records and pins opaque Policy versions", async () => {
    const fetcher = apiFetch();
    const api = new GuardAdapter("user-token", config, fetcher);
    const items = await api.load();
    expect(items.map((i) => i.id)).toEqual(["builtin", "guard-1"]);
    expect(items[1]?.policies[0]?.version).toBe("2026.09");
    expect(items[0]?.remote?.readOnly).toBe(true);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer user-token",
    });
  });
  it("keeps published metadata separate from a newer editable native Policy draft", () => {
    const item = policyEntity(native);
    expect(item.name).toBe("Draft policy");
    expect(item.status).toBe("Draft");
    expect(item.version).toBe("draft-3");
    expect(item.revisions[0]).toEqual({
      version: "1",
      name: "Published policy",
      text: "Old rules",
    });
    expect(
      policyEntity(native, { id: "old", draftRevision: 2, status: "passed" })
        .status,
    ).toBe("Draft");
    expect(
      policyEntity(native, { id: "new", draftRevision: 3, status: "passed" })
        .status,
    ).toBe("Validated");
    expect(
      policyEntity(native, { id: "new", draftRevision: 3, status: "queued" })
        .status,
    ).toBe("Processing");
  });
  it("does not treat stale validation or accepted compilation as activation", () => {
    expect(
      guardEntity(
        {
          ...guard,
          latestValidationRun: {
            id: "old",
            sourceDraftRevision: 1,
            status: "passed",
          },
        },
        [],
      ).status,
    ).toBe("Draft");
    expect(
      guardEntity(
        {
          ...guard,
          versions: [
            {
              version: "20260915-000000.000Z",
              sourceDraftRevision: 2,
              status: "compiling",
            },
          ],
        },
        [],
      ).status,
    ).toBe("Processing");
    const item = guardEntity(
      {
        ...guard,
        latestValidationRun: {
          id: "current",
          sourceDraftRevision: 2,
          status: "passed",
        },
      },
      [],
    );
    expect(item.status).toBe("Validated");
    expect(item.remote?.publishable).toBe(true);
  });
  it("preserves existing backend config and bindings on Guardrail edits", async () => {
    const fetcher = apiFetch((path, method, body) => {
      if (path === "/api/guard/guardrails/guard-1" && method === "PATCH") {
        expect(body).toEqual({
          name: "Renamed",
          runtimeProfile: "auto",
          draftConfig: guard.draftConfig,
        });
        return json(guard);
      }
      return undefined;
    });
    const api = new GuardAdapter("token", config, fetcher);
    const items = await api.load();
    const existing = items[1]!;
    expect(
      await api.save(
        "guardrails",
        { ...blankDraft, name: "Renamed", policies: existing.policies },
        false,
        existing,
      ),
    ).toBe("guard-1");
  });
  it("creates and validates, then polls the returned run ID, never a guessed latest run", async () => {
    const calls: string[] = [];
    const fetcher = apiFetch((path, method, body) => {
      calls.push(`${method} ${path}`);
      if (method === "POST" && path === "/api/guard/guardrails") {
        expect(body).toMatchObject({
          draftConfig: {
            policyBindings: [{ policyId: "builtin", policyVersion: "2026.09" }],
          },
        });
        return json(guard, 201);
      }
      if (method === "POST")
        return json(
          { id: "exact-run", status: "queued", sourceDraftRevision: 2 },
          202,
        );
      if (path === "/api/guard/validation-runs/exact-run")
        return json({
          id: "exact-run",
          status: "running",
          sourceDraftRevision: 2,
        });
      return undefined;
    });
    const api = new GuardAdapter("token", config, fetcher);
    await api.load();
    await api.save(
      "guardrails",
      {
        ...blankDraft,
        name: "New",
        policies: [
          {
            policyId: "builtin",
            version: "2026.09",
            name: builtin.name,
            text: builtin.description,
          },
        ],
      },
      true,
    );
    const result = await api.load();
    expect(calls).toContain("GET /api/guard/validation-runs/exact-run");
    expect(result[1]?.status).toBe("Processing");
  });
  it("never submits natural language as runnable Policy code", async () => {
    const fetcher = apiFetch();
    const api = new GuardAdapter("token", config, fetcher);
    await expect(
      api.save(
        "policies",
        { ...blankDraft, name: "Text", text: "Block private information" },
        false,
      ),
    ).rejects.toThrow("not configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the optional authoring service to build a real programmable Policy request", async () => {
    const fetcher = apiFetch((path, method, body) => {
      if (path === "/api/guard-policy-draft") {
        expect(body).toEqual({
          name: "Privacy",
          text: "Private data must stay private.",
        });
        return json({ owner: "ISS", draft: nativeDraft });
      }
      if (path === "/api/guard/policies" && method === "POST") {
        expect(body).toEqual({
          name: "Privacy",
          description: "Private data must stay private.",
          owner: "ISS",
          draft: nativeDraft,
        });
        return json({ id: "new-policy" }, 201);
      }
      return undefined;
    });
    const api = new GuardAdapter(
      "token",
      { ...config, policyAuthoring: true },
      fetcher,
    );
    expect(
      await api.save(
        "policies",
        {
          ...blankDraft,
          name: "Privacy",
          text: "Private data must stay private.",
        },
        false,
      ),
    ).toBe("new-policy");
  });
  it("sends the exact draft revision when explicitly publishing", async () => {
    const fetcher = apiFetch((path, method, body) => {
      expect(path).toBe("/api/guard/guardrails/guard-1/publish");
      expect(method).toBe("POST");
      expect(body).toEqual({ expectedDraftRevision: 2 });
      return json(
        { version: "20260915-000000.000Z", status: "compiling" },
        202,
      );
    });
    const api = new GuardAdapter("token", config, fetcher);
    await api.publish(
      guardEntity(
        {
          ...guard,
          latestValidationRun: {
            id: "r",
            status: "passed",
            sourceDraftRevision: 2,
          },
        },
        [],
      ),
    );
  });
  it("keeps partial success explicit instead of creating a second mock record", async () => {
    const fetcher = apiFetch((path, method) => {
      if (path === "/api/guard/guardrails" && method === "POST")
        return json(guard, 201);
      if (method === "POST")
        return json(
          {
            error: {
              code: "upstream_unavailable",
              message: "Runner unavailable",
            },
          },
          503,
        );
      return undefined;
    });
    const api = new GuardAdapter("token", config, fetcher);
    await api.load();
    await expect(
      api.save(
        "guardrails",
        {
          ...blankDraft,
          name: "New",
          policies: [
            {
              policyId: builtin.id,
              version: builtin.version,
              name: builtin.name,
              text: builtin.description,
            },
          ],
        },
        true,
      ),
    ).rejects.toThrow("Draft saved (guard-1)");
  });
  it("only permits fallback for connectivity failures, not authentication or bad contracts", async () => {
    for (const status of [401, 403, 409, 422, 500]) {
      const fetcher = vi.fn(async () =>
        json({ error: { code: "request_failed", message: "Denied" } }, status),
      );
      try {
        await jsonRequest(
          "/api/guard/policies",
          "token",
          "GET",
          undefined,
          fetcher,
        );
        throw new Error("expected rejection");
      } catch (e) {
        expect(e).toBeInstanceOf(GuardApiError);
        expect(mayUseMock(e)).toBe(false);
      }
    }
    expect(
      mayUseMock(new GuardApiError("offline", 503, "upstream_unavailable")),
    ).toBe(true);
    expect(
      mayUseMock(new GuardApiError("broken JSON", 502, "invalid_response")),
    ).toBe(false);
  });
});
