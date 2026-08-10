import { describe, expect, it } from "vitest";
import { evaluationLayerFixtures } from "./fixtures";
import {
  cloneEvaluationLayerFixtures,
  validateEvaluationLayerState,
} from "./fixture-validation";

describe("Evaluation layer fixtures", () => {
  it("requires every target and revision to declare a supported kind", () => {
    const state = cloneEvaluationLayerFixtures();
    for (const target of state.targets) {
      expect(["agent", "mcp", "kb", "skill", "guardrail"]).toContain(target.kind);
    }
    for (const revision of state.targetRevisions) {
      expect(["agent", "mcp", "kb", "skill", "guardrail"]).toContain(revision.kind);
    }
  });

  it("rejects targets whose revision kind does not match", () => {
    const state = cloneEvaluationLayerFixtures();
    state.targets[0]!.kind = "kb";
    expect(validateEvaluationLayerState(state)).toContain(
      `targets.${state.targets[0]!.id}.kind: revision kind mismatch`,
    );
  });

  it("form one valid Target-to-Trace graph", () => {
    expect(validateEvaluationLayerState(evaluationLayerFixtures)).toEqual([]);
    expect(evaluationLayerFixtures.targets).not.toHaveLength(0);
    expect(
      evaluationLayerFixtures.traces.some((trace) => trace.spans.length > 0),
    ).toBe(true);
  });

  it("clone into isolated in-memory graphs", () => {
    const first = cloneEvaluationLayerFixtures();
    const second = cloneEvaluationLayerFixtures();
    first.targets[0]!.name = "Changed only here";
    expect(second.targets[0]!.name).not.toBe("Changed only here");
  });

  it("reports a broken trace-to-run reference with a stable path", () => {
    const state = cloneEvaluationLayerFixtures();
    state.traces[0]!.runId = "missing-run";
    expect(validateEvaluationLayerState(state)).toContain(
      `traces.${state.traces[0]!.id}.runId: missing-run`,
    );
  });

  it("retains every source demo Case in the primary published revision", () => {
    const revision = evaluationLayerFixtures.datasetRevisions.find(
      (item) => item.id === "permission-compliance-regression-r1",
    );
    expect(revision?.cases.map((item) => item.id)).toEqual([
      "weather-guest-allow",
      "employee-dept-hr-allow",
      "salary-employee-deny",
      "restart-admin-allow",
      "restart-employee-deny",
      "jailbreak-guard-bypass",
    ]);
  });

  it("keeps draft Case edits isolated from the published predecessor", () => {
    const state = cloneEvaluationLayerFixtures();
    const published = state.datasetRevisions.find(
      (item) => item.id === "permission-compliance-regression-r1",
    )!;
    const draft = state.datasetRevisions.find(
      (item) => item.id === "permission-compliance-regression-r2",
    )!;
    (draft.cases[0]!.input.query as string) = "Changed only in the draft";
    expect(published.cases[0]!.input.query).toBe("What is the weather in Paris?");
  });

  it("models completed and pending Case results plus transient connection settings", () => {
    const run = evaluationLayerFixtures.runs.find(
      (item) => item.id === "run-permission-baseline",
    )!;
    expect(run.results.map((item) => item.caseId)).toEqual([
      "weather-guest-allow",
      "employee-dept-hr-allow",
      "salary-employee-deny",
      "restart-admin-allow",
      "restart-employee-deny",
      "jailbreak-guard-bypass",
    ]);
    expect(run.results.some((item) => item.status === "PENDING")).toBe(false);
    expect(evaluationLayerFixtures.settings).toMatchObject({
      provider: "Recorded demo judge",
      baseUrl: "http://localhost:3000",
      model: "Recorded demo judge",
      apiKey: "",
      testOutcome: "SUCCESS",
      testFingerprint: "demo-connection-v1",
    });
  });

  it("rejects ownership and Tool evidence that disconnect a graph", () => {
    const wrongTargetRevision = cloneEvaluationLayerFixtures();
    wrongTargetRevision.runs[0]!.targetRevisionId =
      "demo-permission-compliance-baseline-r1";
    expect(validateEvaluationLayerState(wrongTargetRevision)).toContain(
      "runs.run-permission-baseline.targetRevisionId: demo-permission-compliance-baseline-r1",
    );

    const wrongDatasetRevision = cloneEvaluationLayerFixtures();
    wrongDatasetRevision.runs[0]!.datasetRevisionId =
      "permission-compliance-exploratory-r1";
    expect(validateEvaluationLayerState(wrongDatasetRevision)).toContain(
      "runs.run-permission-baseline.datasetRevisionId: permission-compliance-exploratory-r1",
    );

    const wrongTraceTarget = cloneEvaluationLayerFixtures();
    wrongTraceTarget.traces[0]!.targetId =
      "demo-permission-compliance-baseline";
    expect(validateEvaluationLayerState(wrongTraceTarget)).toContain(
      "traces.demo-weather-guest-allow.targetId: demo-permission-compliance-baseline",
    );

    const missingTool = cloneEvaluationLayerFixtures();
    missingTool.traces[0]!.toolEvidence[0]!.toolId = "missing-tool";
    expect(validateEvaluationLayerState(missingTool)).toContain(
      "traces.demo-weather-guest-allow.toolEvidence.demo-weather-guest-allow-call.toolId: missing-tool",
    );
  });

  it("rejects a Case result Trace owned by another Run", () => {
    const state = cloneEvaluationLayerFixtures();
    state.runs[0]!.results[0]!.traceId = "demo-salary-employee-deny-error";
    expect(validateEvaluationLayerState(state)).toContain(
      "runs.run-permission-baseline.results.weather-guest-allow.traceId: demo-salary-employee-deny-error",
    );
  });
});
