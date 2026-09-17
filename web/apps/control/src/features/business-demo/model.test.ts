import { describe, expect, it } from "vitest";
import {
  advanceProcessing,
  blankDraft,
  filterEntities,
  PROCESSING_MS,
  restoreEntities,
  saveEntity,
  seedEntities,
  validateDraft,
  availableRevisions,
  migrateLegacy,
  deletionBlocker,
} from "./model";

describe("business demo", () => {
  it("migrates stopped profiles to Ready and removes deprecated profiles without removing policies", () => {
    const base = seedEntities()[0]!;
    const policy = seedEntities().find((x) => x.kind === "policies")!;
    const restored = restoreEntities(
      JSON.stringify({
        version: 2,
        items: [
          { ...base, id: "stopped", status: "Deactivated" },
          { ...base, id: "retired", status: "Deprecated" },
          policy,
        ],
      }),
    );
    expect(restored.find((x) => x.id === "stopped")?.status).toBe("Ready");
    expect(restored.some((x) => x.id === "retired")).toBe(false);
    expect(restored.find((x) => x.id === policy.id)).toEqual(policy);
    expect(seedEntities().some((x) => x.status === "Deprecated")).toBe(false);
  });
  it("requires deactivation before deletion and preserves lifecycle on save", () => {
    const active = seedEntities()[0]!;
    expect(deletionBlocker([active], active)).toMatch(/Deactivate/);
    expect(
      saveEntity(
        "guardrails",
        { ...active, name: "Renamed" },
        false,
        10,
        active.id,
        active,
      ).status,
    ).toBe("Active");
    const inactive = { ...active, status: "Ready" as const };
    expect(
      saveEntity("guardrails", inactive, false, 10, inactive.id, inactive)
        .status,
    ).toBe("Ready");
    expect(deletionBlocker([inactive], inactive)).toBeUndefined();
  });
  it("combines checkbox selections and includes all-location profiles", () => {
    const base = seedEntities()[0]!;
    const items = [
      { ...base, id: "sg", location: "SG" },
      { ...base, id: "cn", location: "CN" },
      { ...base, id: "all", location: "All" },
      { ...base, id: "hk", location: "HK", status: "Draft" as const },
    ];
    expect(
      filterEntities(items, "guardrails", "", ["Active"], {
        location: ["SG", "CN"],
      }).map((x) => x.id),
    ).toEqual(["sg", "cn", "all"]);
    expect(
      filterEntities(items, "guardrails", "", [], { location: [] }),
    ).toHaveLength(4);
  });
  it("uses Admin for new records and migrates only the old local owner label", () => {
    const created = saveEntity(
      "policies",
      { ...blankDraft, name: "New policy" },
      false,
      10,
      "new",
    );
    expect(created.owner).toBe("Admin");
    const old = { ...created, owner: "Local Administrator" };
    const other = { ...created, id: "other", owner: "ISS" };
    const restored = restoreEntities(
      JSON.stringify({ version: 2, items: [old, other] }),
      10,
    );
    expect(restored.map((item) => item.owner)).toEqual(["Admin", "ISS"]);
    expect(restored[0]).toEqual({ ...old, owner: "Admin" });
    expect(old.owner).toBe("Local Administrator");
  });
  it("pins multiple policies and rejects unavailable or duplicate selections", () => {
    const items = seedEntities();
    const draft = {
      ...items[0]!,
      policies: [availableRevisions(items.find(item => item.id === "customer-data")!)[0]!, ...items[0]!.policies],
    };
    const saved = saveEntity(
      "guardrails",
      draft,
      true,
      10,
      "new",
      undefined,
      items,
    );
    expect(saved.policies).toHaveLength(2);
    expect(saved.text).toBe("");
    expect(
      validateDraft(
        "guardrails",
        { ...draft, policies: [draft.policies[0]!, draft.policies[0]!] },
        true,
        items,
      ),
    ).toHaveProperty("policies");
    expect(
      validateDraft(
        "guardrails",
        {
          ...draft,
          policies: [{ ...draft.policies[0]!, text: "Changed snapshot" }],
        },
        true,
        items,
      ),
    ).toHaveProperty("policies");
    expect(availableRevisions(items[6]!)).toEqual([]);
  });
  it("keeps referenced text immutable while a policy moves to a new version", () => {
    const ready = seedEntities().find(item => item.id === "customer-data")!;
    const reference = availableRevisions(ready)[0]!;
    const guard = { ...seedEntities()[0]!, policies: [reference] };
    const updated = saveEntity(
      "policies",
      { ...ready, text: "New version text" },
      false,
      20,
      ready.id,
      ready,
    );
    expect(updated.version).toBe(2);
    expect(updated.revisions).toEqual([
      { version: 1, name: ready.name, text: ready.text },
    ]);
    expect(availableRevisions(updated)).toEqual([reference]);
    const submitted = saveEntity(
      "policies",
      updated,
      true,
      30,
      updated.id,
      updated,
    );
    expect(submitted.version).toBe(2);
    const restored = restoreEntities(
      JSON.stringify({ version: 2, items: [guard, submitted] }),
      30 + PROCESSING_MS,
    );
    expect(restored[0]!.policies[0]).toEqual(reference);
    expect(availableRevisions(restored[1]!).map((r) => r.version)).toEqual([
      1, 2,
    ]);
  });
  it("migrates existing rule text without deleting entities and is idempotent", () => {
    const legacy = {
      ...seedEntities()[0]!,
      text: "Original legacy rule",
      policies: [],
    };
    const migrated = migrateLegacy([legacy]);
    expect(migrated).toHaveLength(2);
    expect(migrated[0]!.id).toBe(legacy.id);
    expect(migrated[0]!.policies[0]!.text).toBe(legacy.text);
    expect(migrated[1]!.text).toBe(legacy.text);
    expect(migrateLegacy(migrated)).toEqual(migrated);
    const { policies: _refs, version: _v, revisions: _history, ...v1 } = legacy;
    expect(
      restoreEntities(JSON.stringify({ version: 1, items: [v1] }))[0]!
        .policies[0]!.text,
    ).toBe(legacy.text);
  });
  const policy = {
    ...blankDraft,
    name: "New policy",
    text: "Protect customer records.",
  };
  it("requires only a name for drafts and text for submission", () => {
    expect(
      validateDraft("policies", { ...blankDraft, name: "A" }, false),
    ).toEqual({});
    expect(
      validateDraft("policies", { ...blankDraft, name: "A" }, true),
    ).toEqual({ text: "Enter the rule text." });
    expect(validateDraft("policies", policy, true)).toEqual({});
    expect(
      validateDraft("policies", { ...policy, name: "   " }, true),
    ).toHaveProperty("name");
  });
  it("requires the business scope only for guardrails", () => {
    expect(Object.keys(validateDraft("guardrails", policy, true))).toEqual([
      "policies",
      "useCase",
      "busu",
      "location",
      "agentType",
      "dataType",
    ]);
    expect(
      validateDraft(
        "guardrails",
        {
          ...policy,
          policies: availableRevisions(seedEntities().find(item => item.id === "customer-data")!),
          useCase: "Support",
          busu: "ISS",
          location: "SG",
          agentType: "Customer",
          dataType: "Personal data",
        },
        true,
      ),
    ).toEqual({});
  });
  it("cannot save an invalid submission", () => {
    expect(() => saveEntity("policies", blankDraft, true, 100, "id")).toThrow(
      "Invalid draft",
    );
  });
  it("progresses policies to Ready and guardrails to Review, never auto publishes", () => {
    const item = saveEntity("policies", policy, true, 100, "id");
    const items = [item, { ...item, id: "guard", kind: "guardrails" as const }];
    expect(advanceProcessing(items, 100 + PROCESSING_MS - 1)).toBe(items);
    expect(
      advanceProcessing(items, 100 + PROCESSING_MS).map(
        (entry) => entry.status,
      ),
    ).toEqual(["Ready", "Review"]);
  });
  it("resumes a processing submission after refresh", () => {
    const item = saveEntity("policies", policy, true, 100, "id");
    const restored = restoreEntities(
      JSON.stringify({ version: 1, items: [item] }),
      100 + PROCESSING_MS,
    );
    expect(restored[0]).toMatchObject({
      status: "Ready",
      text: policy.text,
      completedAt: 100 + PROCESSING_MS,
    });
  });
  it("recovers from malformed storage and preserves a valid empty collection", () => {
    expect(restoreEntities("broken", 1)).toEqual(seedEntities(1));
    expect(restoreEntities('{"version":1,"items":[{}]}', 1)).toEqual(
      seedEntities(1),
    );
    expect(restoreEntities('{"version":1,"items":[]}', 1)).toEqual([]);
  });
  it("preserves identity and owner when updating a draft", () => {
    const initial = seedEntities(100)[6]!;
    const saved = saveEntity(
      "policies",
      policy,
      true,
      200,
      initial.id,
      initial,
    );
    expect(saved).toMatchObject({
      id: initial.id,
      owner: initial.owner,
      createdAt: initial.createdAt,
      updatedAt: 200,
      status: "Processing",
    });
  });
  it("filters name, rule text, status and scope together", () => {
    const items = seedEntities(1);
    expect(
      filterEntities(
        items,
        "policies",
        "  personal information  ",
        "Ready",
      ).map((entry) => entry.id),
    ).toEqual(["customer-data", "policy-from-customer-interaction"]);
    expect(
      filterEntities(items, "guardrails", "", "Active", { busu: "CBG" }),
    ).toHaveLength(1);
    expect(
      filterEntities(items, "guardrails", "", "Active", { busu: "ISS" }),
    ).toHaveLength(0);
  });
});
