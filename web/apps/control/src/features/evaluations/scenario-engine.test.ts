import { describe, expect, it } from "vitest";
import { cloneEvaluationFixtures } from "./fixture-validation";
import { createEvaluationStore } from "./mock-store";
import { compareReports, evaluateCase } from "./scenario-engine";

describe("evaluation scenario engine", () => {
  it("advances six cases and creates a failing immutable Report", () => {
    const ids = ["run-new", "report-new", "reflection-new"];
    const store = createEvaluationStore(cloneEvaluationFixtures(), {
      now: () => "2026-08-04T08:00:00.000Z",
      id: () => ids.shift()!,
    });
    const state = store.getState();

    const run = store.createRun({
      targetRevisionId: state.targetRevisions[0]!.id,
      datasetRevisionId: state.datasetRevisions[0]!.id,
    });

    expect(run.ok).toBe(true);
    for (let index = 0; index < 6; index += 1) {
      expect(store.advanceRun("run-new").ok).toBe(true);
    }
    const completed = store
      .getState()
      .runs.find((item) => item.id === "run-new")!;
    expect(completed).toMatchObject({
      status: "FAIL",
      stage: "report",
      reportId: "report-new",
    });
    expect(
      store.getState().reports.find((item) => item.id === "report-new")!
        .metrics,
    ).toEqual({
      passRate: 83.3,
      passed: 5,
      failed: 1,
      blocked: 0,
    });
  });

  it("creates a new Target Revision from accepted Reflection suggestions", () => {
    const store = createEvaluationStore(cloneEvaluationFixtures(), {
      now: () => "2026-08-04T08:00:00.000Z",
      id: () => "reflected-revision",
    });
    const reflection = store
      .getState()
      .reflections.find((item) => item.status === "PENDING")!;

    const result = store.submitReflection(reflection.reportId, [
      reflection.suggestions[0]!.id,
    ]);

    expect(result).toMatchObject({
      ok: true,
      value: { resultingTargetRevisionId: "reflected-revision" },
    });
  });

  it("keeps case outcomes and report comparisons deterministic", () => {
    const state = cloneEvaluationFixtures();
    const dataset = state.datasetRevisions[0]!;

    expect(evaluateCase(dataset.cases[4]!, 4)).toMatchObject({
      caseId: "permission-bypass",
      status: "FAIL",
      actualOutcome: "ALLOW",
    });
    expect(
      compareReports(
        state,
        "report-permission-baseline",
        "report-permission-regression",
      ),
    ).toMatchObject({
      regressions: ["permission-bypass"],
      resolvedFailures: [],
      unchangedFailures: [],
      addedCases: [],
      removedCases: [],
    });
  });

  it("rejects early Reports and can finish Reflection without changes", () => {
    const store = createEvaluationStore(cloneEvaluationFixtures(), {
      now: () => "2026-08-04T08:00:00.000Z",
      id: () => "run-incomplete",
    });
    const state = store.getState();
    const created = store.createRun({
      targetRevisionId: state.targetRevisions[0]!.id,
      datasetRevisionId: state.datasetRevisions[0]!.id,
    });
    expect(created.ok).toBe(true);
    expect(store.createReport("run-incomplete")).toEqual({
      ok: false,
      error: "The Evaluation has incomplete cases.",
    });

    const pending = state.reflections.find(
      (item) => item.status === "PENDING",
    )!;
    expect(store.finishReflectionWithoutChanges(pending.reportId)).toMatchObject(
      { ok: true, value: { status: "NO_CHANGES" } },
    );
  });
});
