import { describe, expect, it } from "vitest";
import { cloneEvaluationLayerFixtures } from "./fixture-validation";
import { createEvaluationLayerStore } from "./mock-store";
import { advanceEvaluationScenario } from "./scenario-engine";

describe("advanceEvaluationScenario", () => {
  it("advances one case at a time and creates one Report at completion", () => {
    let sequence = 0;
    const store = createEvaluationLayerStore(cloneEvaluationLayerFixtures(), {
      id: () => `generated-${++sequence}`,
      now: () => "2026-08-04T10:00:00.000Z",
    });
    expect(store.decideRevision(
      "report-permission-baseline",
      "REJECTED",
      { name: "Local Administrator", role: "admin" },
    ).ok).toBe(true);
    const created = store.createRun({
      targetRevisionId: "demo-permission-compliance-r2",
      datasetRevisionId: "permission-compliance-regression-r1",
      guardrailTemplateIds: ["guardrail-template-universal-safety"],
      evaluatorIds: ["permission-compliance"],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const runId = created.value.runId;
    const initialPending = store
      .getState()
      .runs.find((run) => run.id === runId)!.results.length;

    advanceEvaluationScenario(store, runId);
    expect(
      store
        .getState()
        .runs.find((run) => run.id === runId)!
        .results.filter((result) => result.status === "PENDING"),
    ).toHaveLength(initialPending - 1);

    for (let index = 1; index < initialPending; index += 1) {
      advanceEvaluationScenario(store, runId);
    }

    expect(store.getState().reports.filter((report) => report.runId === runId)).toHaveLength(1);
    expect(
      store.getState().reflections.filter((reflection) => {
        const report = store.getState().reports.find((item) => item.id === reflection.reportId);
        return report?.runId === runId;
      }),
    ).toHaveLength(1);

    advanceEvaluationScenario(store, runId);
    expect(store.getState().reports.filter((report) => report.runId === runId)).toHaveLength(1);
  });
});
