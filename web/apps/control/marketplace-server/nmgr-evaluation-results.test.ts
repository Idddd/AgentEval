import { describe, expect, it } from "vitest";
import { evaluationResults } from "./nmgr-evaluation-results";
import { DeploymentError } from "./diagnostics";

describe("NeMo evaluation result diagnostics", () => {
  it("preserves valid evidence and optional fields", () => {
    const results = [{ caseId: "one", passed: true }, { caseId: "two", passed: false, actualDecision: "allow", reason: "rule did not match", durationMs: 12 }];
    expect(evaluationResults({ results, status: "failed" }, "policy-poll")).toEqual(results);
    expect(evaluationResults({ results: [], status: "failed" }, "policy-poll")).toEqual([]);
  });
  it("distinguishes null optional values without echoing response content", () => {
    expect(() => evaluationResults({ results: [{ caseId: "one", passed: true, reason: null }] }, "profile-poll"))
      .toThrow("results[0].reason: expected string, received null");
  });
  it("bounds diagnostics and never includes unknown status or result values", () => {
    try {
      evaluationResults({ status: "Bearer private-token", results: Array.from({ length: 20 }, () => ({ caseId: "secret-case", passed: "secret-result" })) }, "profile-version-poll");
      expect.fail("Expected a schema error");
    } catch (error) {
      expect(error).toBeInstanceOf(DeploymentError);
      const failure = error as DeploymentError;
      expect(failure.status).toBe(502);
      expect(failure.responseValidation).toMatchObject({ endpoint: "GET /test-runs/{runId}", issueCount: 20 });
      expect(failure.responseValidation!.issues).toHaveLength(8);
      expect(failure.message).toContain("12 more issue(s)");
      expect(JSON.stringify(failure)).not.toMatch(/private-token|secret-case|secret-result/);
    }
  });
});
