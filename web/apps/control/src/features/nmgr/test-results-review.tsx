import { Fragment, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Entity, Run } from "./model";

type Scenario = [name: string, description: string, dataset: string];
type MockBenchmark = { benchmark: string; description: string; dataset: string; accuracy: number; precision: number; recall: number };
const scenarios: Record<string, Scenario[]> = {
  banking: [
    ["Personalized financial advice", "Detect individualized investment recommendations and redirect to general banking guidance.", "financial_advice.json"],
    ["Tax and legal boundaries", "Restrict personalized tax and legal advice while allowing general information.", "tax_legal_boundaries.json"],
    ["Customer data protection", "Prevent disclosure of account details and confidential customer information.", "customer_privacy.json"],
    ["Out-of-scope requests", "Redirect prohibited topics to the approved customer banking scope.", "banking_scope.json"],
    ["Jailbreak attempts", "Detect attempts to override banking restrictions through adversarial prompts.", "banking_jailbreak.json"],
    ["Permitted banking guidance", "Allow routine banking questions without blocking legitimate requests.", "general_banking.json"],
  ],
  governance: [
    ["Unauthorized tool access", "Detect requests to use tools outside the approved internal agent permissions.", "tool_permissions.json"],
    ["Least privilege", "Restrict attempts to expand privileges or bypass human approval.", "least_privilege.json"],
    ["Prompt injection", "Detect instruction overrides and malicious content from untrusted sources.", "prompt_injection.json"],
    ["Secrets and credentials", "Prevent disclosure of passwords, API keys and internal credentials.", "secrets_credentials.json"],
    ["Compliance boundaries", "Detect requests outside the approved governance and compliance requirements.", "compliance_boundaries.json"],
    ["Permitted internal requests", "Allow authorized tasks within the agent's approved operating scope.", "authorized_requests.json"],
  ],
  privacy: [
    ["Direct PII disclosure", "Detect names, identifiers, phone numbers and sensitive personal records.", "pii_disclosure.json"],
    ["Obfuscated identifiers", "Detect personal identifiers split across text or altered with separators.", "obfuscated_pii.json"],
    ["Sensitive context", "Detect personal information embedded in otherwise ordinary requests.", "sensitive_context.json"],
    ["Multi-turn disclosure", "Detect attempts to recover protected identifiers across multiple turns.", "multi_turn_privacy.json"],
    ["Permitted anonymized content", "Allow anonymized content without blocking non-sensitive information.", "anonymized_content.json"],
  ],
  matching: [
    ["Configured matches", "Detect text matching the configured keywords or regular expression.", "configured_matches.json"],
    ["Boundary cases", "Check adjacent text and partial matches against the matching requirements.", "match_boundaries.json"],
    ["Format variations", "Check case, spacing and punctuation variants of the configured content.", "format_variations.json"],
    ["Permitted content", "Allow unrelated text without triggering the configured matching rule.", "non_matching_content.json"],
  ],
  general: [
    ["Requirement compliance", "Detect requests that violate this Guardrail's stated control intent and requirements.", "requirement_compliance.json"],
    ["Harmful requests", "Detect unsafe requests within the configured protection scope.", "harmful_requests.json"],
    ["Prompt injection", "Detect instructions that attempt to override the configured Guardrail.", "prompt_injection.json"],
    ["Multi-turn bypass", "Detect attempts to bypass the requirements across multiple conversation turns.", "multi_turn_bypass.json"],
    ["Permitted requests", "Allow legitimate requests that comply with the configured requirements.", "permitted_requests.json"],
  ],
};

// These illustrative metrics never participate in sign-off or lifecycle decisions.
export function mockBenchmarkResults(item: Entity, run: Run): MockBenchmark[] {
  const revision = item.revisions?.[run.version] ?? item;
  const content = [revision.name, revision.description, ...revision.policies].join(" ").toLowerCase();
  const theme = /bank|financial|tax|legal/.test(content) ? "banking"
    : /governance|least privilege|authorized tools|internal agent/.test(content) ? "governance"
    : /\bpii\b|personal information|personal identifier|privacy/.test(content) ? "privacy"
    : ["regex", "keyword"].includes(revision.config?.scannerType ?? "") ? "matching" : "general";
  const hash = (value: string) => Array.from(value).reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 100003, 7);
  return scenarios[theme]!.map(([benchmark, description, dataset], index) => {
    const failedScenario = !run.passed && index === 0;
    // Use one synthetic confusion matrix so the three metrics remain coherent.
    const falsePositive = (failedScenario ? 120 : 8) + hash(`${run.id}:${benchmark}:fp`) % (failedScenario ? 70 : 55);
    const falseNegative = (failedScenario ? 145 : 10) + hash(`${run.id}:${benchmark}:fn`) % (failedScenario ? 70 : 60);
    const truePositive = 500 - falseNegative;
    const percentage = (numerator: number, denominator: number) => Number((100 * numerator / denominator).toFixed(2));
    return {
      benchmark, description, dataset,
      accuracy: percentage(1000 - falsePositive - falseNegative, 1000),
      precision: percentage(truePositive, truePositive + falsePositive),
      recall: percentage(truePositive, 500),
    };
  });
}

export function TestResultsReview({ item }: { item: Entity }) {
  const [version, setVersion] = useState(String(item.version));
  const [runId, setRunId] = useState("");
  const versions = [...new Set([item.version, ...item.runs.map((run) => run.version)])].sort((a, b) => b - a);
  const runs = item.runs.filter((run) => String(run.version) === version);
  const run = runs.find((run) => run.id === runId) ?? runs[0];
  return (
    <section className="nm-card nm-review-results" aria-label="Evaluation review">
      <div className="nm-card-head nm-review-results-head">
        <h3>Results</h3>
        <div className="nm-review-selectors">
          <label className="nm-select">Version
            <select aria-label="Evaluation result version" value={version} onChange={(event) => { setVersion(event.target.value); setRunId(""); }}>
              {versions.map((version) => <option key={version} value={version}>v{version}.0{version === item.version ? " · Current" : ""}</option>)}
            </select>
          </label>
          {runs.length > 1 && <label className="nm-select">Evaluation run
            <select aria-label="Evaluation result run" value={run?.id ?? ""} onChange={(event) => setRunId(event.target.value)}>
              {runs.map((run) => <option key={run.id} value={run.id}>{new Date(run.end).toLocaleString("en-GB", { timeZone: "Asia/Shanghai" })} · {run.dataset}</option>)}
            </select>
          </label>}
        </div>
      </div>
      {run ? <BenchmarkResultsDisclosure key={run.id} item={item} run={run} />
        : <p className="nm-empty">No evaluations recorded for this version.</p>}
    </section>
  );
}

export function BenchmarkResultsDisclosure({ item, run, asTableRow = false }: { item: Entity; run: Run; asTableRow?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const rows = expanded ? mockBenchmarkResults(item, run) : [];
  const status = <span className={`nm-badge ${run.passed ? "good" : "bad"}`}>{run.passed ? "Passed" : "Evaluation failed"}</span>;
  const trigger = <button type="button" className="nm-benchmark-toggle" aria-label={`Results for ${run.dataset}`} aria-expanded={expanded} aria-controls={contentId} onClick={(event) => { event.stopPropagation(); setExpanded(!expanded); }}>
    <span className="nm-benchmark-run-label"><strong>{run.dataset}</strong><small>Target {run.version}.0 · Base {run.base === null ? "None" : `${run.base}.0`} · {run.cases} cases</small></span>
    {!asTableRow && status}<ChevronDown size={16} aria-hidden="true" className={expanded ? "rotate-180" : ""} />
  </button>;
  const content = expanded && <div id={contentId} className="nm-scroll nm-review-table-scroll nm-review-results" role="region" aria-label="Benchmark results table" tabIndex={0}>
          <table aria-label="Benchmark Results">
            <thead>
              <tr><th rowSpan={2} scope="col">Benchmark</th><th rowSpan={2} scope="col">Evaluation Scope</th><th rowSpan={2} scope="col">DataSet</th><th colSpan={3} scope="colgroup" className="nm-review-metric-group">Guardrail</th></tr>
              <tr>{["Accuracy", "Precision", "Recall"].map((metric) => <th key={metric} scope="col" className="nm-review-metric-head">{metric}</th>)}</tr>
            </thead>
            <tbody>{rows.map((row) => <tr key={row.dataset}>
              <td><strong>{row.benchmark}</strong></td><td>{row.description}</td><td className="nm-review-dataset">{row.dataset}</td>
              {[row.accuracy, row.precision, row.recall].map((metric, index) => <td key={index} className="nm-review-score">{metric.toFixed(2)}%</td>)}
            </tr>)}</tbody>
          </table>
        </div>;
  return asTableRow ? <Fragment>
    <tr className="nm-benchmark-record-row" onClick={() => setExpanded(!expanded)}><td className="nm-record-result-cell">{trigger}</td><td>{status}</td></tr>
    {expanded && <tr><td colSpan={2} className="nm-record-result-cell">{content}</td></tr>}
  </Fragment> : <div className="nm-benchmark-disclosure nm-review-results">{trigger}{content}</div>;
}
