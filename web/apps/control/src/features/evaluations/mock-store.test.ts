import { describe, expect, it } from "vitest";
import { cloneEvaluationFixtures } from "./fixture-validation";
import { createEvaluationStore } from "./mock-store";

describe("evaluation mock store", () => {
  it("creates immutable Target revisions", () => {
    const store = createEvaluationStore(cloneEvaluationFixtures(), {
      now: () => "2026-08-04T08:00:00.000Z",
      id: () => "target-revision-new",
    });
    const target = store.getState().targets[0]!;
    const prior = target.currentRevisionId;

    const result = store.createTargetRevision(target.id, {
      systemPrompt: "Require explicit authorization.",
    });

    expect(result.ok).toBe(true);
    expect(store.getState().targets[0]!.currentRevisionId).toBe(
      "target-revision-new",
    );
    expect(
      store.getState().targetRevisions.some((item) => item.id === prior),
    ).toBe(true);
  });

  it("publishes a new Dataset revision from draft cases", () => {
    const store = createEvaluationStore(cloneEvaluationFixtures(), {
      now: () => "2026-08-04T08:00:00.000Z",
      id: () => "dataset-revision-new",
    });
    const dataset = store.getState().datasets[0]!;

    const result = store.publishDatasetRevision(dataset.id);

    expect(result).toMatchObject({
      ok: true,
      value: { id: "dataset-revision-new" },
    });
    expect(store.getState().datasets[0]!.currentRevisionId).toBe(
      "dataset-revision-new",
    );
  });

  it("rejects duplicate imported case inputs without mutating state", () => {
    const store = createEvaluationStore(cloneEvaluationFixtures());
    const dataset = store.getState().datasets[0]!;
    const before = structuredClone(dataset.draftCases);

    const result = store.importCases(dataset.id, JSON.stringify([before[0]]));

    expect(result).toEqual({
      ok: false,
      error: "Case inputs must be unique.",
    });
    expect(store.getState().datasets[0]!.draftCases).toEqual(before);
  });
});
