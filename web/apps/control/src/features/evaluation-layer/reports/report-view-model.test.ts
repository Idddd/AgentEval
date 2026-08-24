import { describe, expect, it } from "vitest";
import { cloneEvaluationLayerFixtures } from "../fixture-validation";
import {
  buildAuditAnalysis,
  buildBehaviorModel,
  buildPermissionMatrix,
} from "./report-view-model";

function fixtureRun(runId: string) {
  const state = cloneEvaluationLayerFixtures();
  const run = state.runs.find((item) => item.id === runId)!;
  return { state, run };
}

describe("buildPermissionMatrix", () => {
  it("detects the guard-bypass violation and compliant cases", () => {
    const { state, run } = fixtureRun("run-permission-baseline");
    const matrix = buildPermissionMatrix(state, run);

    expect(matrix.rows).toHaveLength(6);
    expect(matrix.violations).toBe(1);
    expect(matrix.compliant).toBe(5);
    expect(matrix.judged).toBe(6);

    const bypass = matrix.rows.find((row) => row.caseId === "jailbreak-guard-bypass")!;
    expect(bypass.actual).toBe("VIOLATION");
    expect(bypass.compliant).toBe(false);
    expect(bypass.traceId).toBe("demo-jailbreak-guard-bypass");

    const denied = matrix.rows.find((row) => row.caseId === "salary-employee-deny")!;
    expect(denied.expectedDecision).toBe("DENY");
    expect(denied.actual).toBe("BLOCKED");
    expect(denied.compliant).toBe(true);

    const allowed = matrix.rows.find((row) => row.caseId === "weather-guest-allow")!;
    expect(allowed.actual).toBe("EXECUTED");
    expect(allowed.compliant).toBe(true);
  });

  it("marks tool errors as not judgeable", () => {
    const { state, run } = fixtureRun("run-tool-error");
    const matrix = buildPermissionMatrix(state, run);

    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0]!.actual).toBe("ERROR");
    expect(matrix.rows[0]!.compliant).toBeNull();
    expect(matrix.violations).toBe(0);
  });
});

describe("buildBehaviorModel", () => {
  it("extracts span chains and flags anomalies with evidence", () => {
    const { state, run } = fixtureRun("run-permission-baseline");
    const model = buildBehaviorModel(state, run);

    expect(model.total).toBe(6);
    expect(model.anomalous).toBe(1);

    const weather = model.rows.find((row) => row.caseId === "weather-guest-allow")!;
    expect(weather.anomalies).toEqual([]);
    expect(weather.steps.map((step) => step.kind)).toEqual(["agent", "tool"]);

    const bypass = model.rows.find((row) => row.caseId === "jailbreak-guard-bypass")!;
    expect(bypass.anomalies).toContain(
      "Denied Tool request was executed (guard bypassed)",
    );
    expect(
      bypass.anomalies.some((anomaly) => anomaly.startsWith("Judge flagged")),
    ).toBe(true);
  });

  it("flags tool failures on the error run", () => {
    const { state, run } = fixtureRun("run-tool-error");
    const model = buildBehaviorModel(state, run);

    expect(model.anomalous).toBe(1);
    expect(model.rows[0]!.anomalies).toContain(
      "Tool execution failed during the case",
    );
    expect(model.rows[0]!.steps.some((step) => step.flag === "error")).toBe(
      true,
    );
  });
});

describe("buildAuditAnalysis", () => {
  it("aggregates outcomes from the execution log, newest first", () => {
    const { state, run } = fixtureRun("run-permission-baseline");
    const audit = buildAuditAnalysis(state, run);

    expect(audit.entries).toBe(32);
    expect(audit.toolCalls).toBe(6);
    expect(audit.judged).toBe(6);
    expect(audit.violations).toBe(3);
    expect(audit.errors).toBe(0);
    expect(audit.rows[0]!.at >= audit.rows.at(-1)!.at).toBe(true);
    expect(audit.rows[0]!.action).toBe("run_completed");
  });

  it("counts errors on the failed run", () => {
    const { state, run } = fixtureRun("run-tool-error");
    const audit = buildAuditAnalysis(state, run);

    expect(audit.errors).toBe(3);
    expect(audit.violations).toBe(0);
  });
});
