import { expect, it } from "vitest";
import { availableRevisions, blankDraft, restoreIntegratedEntities, saveEntity, validateDraft } from "./model";

it("upgrades existing mock data once without reviving deleted F5 samples", () => {
  const items = restoreIntegratedEntities(null);
  expect(items.some((x) => x.source === "F5" && x.kind === "guardrails")).toBe(true);
  expect(items.some((x) => (x.source ?? "Guard") === "Guard")).toBe(true);
  const retained = items.filter((x) => x.source !== "F5");
  expect(restoreIntegratedEntities(JSON.stringify({ version: 3, items: retained }))).toEqual(retained);
});

it("rejects cross-source bindings and preserves source on save", () => {
  const items = restoreIntegratedEntities(null);
  const policy = items.find((x) => x.kind === "policies" && x.source === "F5")!;
  const draft = { ...blankDraft, name: "Test", source: "Guard" as const, policies: availableRevisions(policy) };
  expect(validateDraft("guardrails", draft, false, items).policies).toMatch(/source/i);
  const saved = saveEntity("guardrails", { ...draft, source: "F5" }, false, 1, "new", undefined, items);
  expect(saved.source).toBe("F5");
  expect(() => saveEntity("guardrails", { ...saved, source: "Guard" }, false, 2, saved.id, saved, items)).toThrow();
});
