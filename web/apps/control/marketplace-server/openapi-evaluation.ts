import { field, fields, operationIdHeader, requestIdHeader, under, withFieldDocs } from "./openapi-field-annotations";

const panel = "Guardrail Evaluation → Independent evaluation.";
const text = { type: "string" };
const count = { type: "integer", minimum: 0 };
const id = { type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$" };
const revision = { type: "string", pattern: "^[\\w:./-]{1,256}$" };
const status = { type: "string", enum: ["RUNNING", "COMPLETED", "FAILED", "CANCELLED"] };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const list = (items: object) => ({ type: "array", items });
const obj = (properties: Record<string, object>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const history = { id, status, createdAt: text };
const historyDocs = fields(`${panel} Recent runs selector.`, {
  id: "Identifier of the run used in follow-up status and report requests.",
  status: "Run state. Display running, completed, failed or cancelled.",
  createdAt: "Run creation timestamp shown in the selector.",
});

export const independentEvaluationSchemas = {
  IndependentEvaluationSetup: withFieldDocs(obj({
    setup: obj({ revision, target: id, demo: { type: "boolean" }, endpoint: id, datasets: list(obj({ id, name: text, version: count })) }),
    history: list(obj(history)),
  }), {
    ...fields(panel, {
      setup: "Published configuration metadata for the selected Guardrail business revision.",
      "setup.revision": "Opaque Evaluate configuration revision. Supply it as the revision query when starting a run.",
      "setup.target": "Evaluate service target linked to the Marketplace Guardrail.",
      "setup.demo": "Compatibility flag identifying the separate loopback evaluation flow. V3 returns false.",
      "setup.endpoint": "Guardrail endpoint ID rendered under Endpoint.",
      "setup.datasets": "Published datasets displayed under Dataset.",
      "setup.datasets.id": "Stable Evaluate dataset identifier.",
      "setup.datasets.name": "Benchmark display name, falling back to the dataset ID.",
      "setup.datasets.version": "Published dataset version in the Dataset label.",
      history: "Up to twelve recent runs for the selected revision and provider.",
    }),
    ...under("history", historyDocs),
  }),
  IndependentEvaluationRun: withFieldDocs(obj({
    run: obj({ ...history, phase: { type: ["string", "null"] }, completed: count, total: count }, ["id", "status", "createdAt", "completed", "total"]),
  }), {
    run: field("Current status snapshot for the selected or newly queued run.", `${panel} Status card and progress bar.`),
    ...under("run", historyDocs),
    ...fields(`${panel} Status card and progress bar.`, {
      "run.phase": "Optional runner phase used for Queued, Finalizing and Running display states.",
      "run.completed": "Number of cases processed.",
      "run.total": "Total number of cases scheduled.",
    }),
  }),
  IndependentEvaluationReport: withFieldDocs(obj({
    report: obj({
      status, total: count, offset: count, nextOffset: { type: ["integer", "null"], minimum: 0 },
      matched: count, mismatches: count, errors: count,
      rows: list(obj({
        id: text, status: { type: "string", enum: ["PASS", "FAIL", "ERROR"] }, httpStatus: { type: ["integer", "null"], minimum: 0 },
        labels: list(obj({ expected: text, observed: text }, [])),
      }, ["id", "status", "labels"])),
    }, ["status", "total", "offset", "matched", "mismatches", "errors", "rows"]),
  }), fields(`${panel} Report summary and Evaluation case results table.`, {
    report: "Paged, redacted report for the selected independent evaluation run.",
    "report.status": "Report state. RUNNING means results are still being prepared.",
    "report.total": "Total case rows in the report.",
    "report.offset": "Zero-based offset for the displayed page.",
    "report.nextOffset": "Next page offset. Null or omission means there is no next page.",
    "report.matched": "Cases that matched the expected decision.",
    "report.mismatches": "Cases that produced a different decision.",
    "report.errors": "Cases that encountered an execution error.",
    "report.rows": "Case rows for the current page; up to 25.",
    "report.rows.id": "Case identifier for the Case column.",
    "report.rows.status": "PASS, FAIL or ERROR for the Result column.",
    "report.rows.httpStatus": "Optional HTTP status shown on an error case.",
    "report.rows.labels": "Expected and observed classification pairs.",
    "report.rows.labels.expected": "Expected classification text for the Expected column.",
    "report.rows.labels.observed": "Returned classification text for the Observed column.",
  })),
  IndependentEvaluationError: withFieldDocs(obj({ error: obj({ code: text, message: text }) }), fields(`${panel} Connection, submission and result alerts.`, {
    error: "Failure envelope from the independent evaluation adapter.",
    "error.code": "Stable failure code, such as evaluation_report_pending while report creation is in progress.",
    "error.message": "Safe explanation for the alert. Use X-Request-ID when reporting the error.",
  })),
};

export function independentEvaluationOpenApi(commonParameters: object[], errors: Record<string, { description: string }>) {
  const parameter = (name: string, schema: object, description: string, ui: string, required = false, location = "query") =>
    ({ name, in: location, required, schema, ...field(description, `${panel} ${ui}`) });
  const parameters = [
    ...commonParameters,
    parameter("guardrail", id, "Marketplace Guardrail ID from the selected details page.", "Pass the active Guardrail record ID.", true),
    parameter("version", { type: "integer", minimum: 1, maximum: 1_000_000 }, "Marketplace business revision to evaluate.", "Pass the revision selected on the page.", true),
  ];
  const headers = {
    "X-Request-ID": { schema: text, ...requestIdHeader },
    "X-Operation-ID": { schema: text, ...operationIdHeader },
  };
  const response = (description: string, schema: object) => ({ description, headers, content: { "application/json": { schema } } });
  const errorSchema = { anyOf: [ref("ErrorResponse"), ref("IndependentEvaluationError")] };
  const failures = Object.fromEntries([
    ...Object.keys(errors).map(code => [code, response(
      code === "409" ? "The suite revision or selected mapping changed, or the Guardrail has pending changes. Refresh setup and recent runs before starting again." : errors[code]!.description,
      errorSchema,
    )]),
    ["default", response("Structured evaluation or dependency failure.", errorSchema)],
  ]);
  const base = { tags: ["Evaluations"], security: [{}, { bearerAuth: [] }] };
  const access = " This V3 endpoint is same-origin. Strict V3 requires the Tech role and a user Bearer token. Shared V3 role selection follows deployment settings. Independent results do not alter provider sign-off evidence.";
  return {
    get: {
      ...base, operationId: "getIndependentEvaluation",
      summary: "Read evaluation setup, run status, or a report page",
      description: "Without run, load the published configuration and recent runs. With run, load current status. Add report=true to load one page of case results after the run finishes." + access,
      parameters: [
        ...parameters,
        parameter("run", id, "Run ID from Recent runs or the submission response.", "Select which run to track or open."),
        parameter("report", { type: "string", const: "true" }, "Include with run to read the report page.", "Switch from progress to case results."),
        parameter("offset", { ...count, maximum: 1_000_000, default: 0 }, "Zero-based report offset. Nonzero offsets require report=true.", "Use report.nextOffset for Next and subtract 25 for Previous."),
      ],
      responses: { "200": response("Setup, run, or report according to the query.", { oneOf: ["IndependentEvaluationSetup", "IndependentEvaluationRun", "IndependentEvaluationReport"].map(ref) }), ...failures },
    },
    post: {
      ...base, operationId: "startIndependentEvaluation", summary: "Start the selected published evaluation suite",
      description: "Start a run using the setup revision and a client UUID. Reuse both after an unconfirmed submission. The request has no JSON body." + access,
      parameters: [
        ...parameters,
        parameter("revision", revision, "Opaque setup.revision returned by GET. A change returns 409.", "Keep this value with the pending submission.", true),
        parameter("Idempotency-Key", { ...text, format: "uuid" }, "Client UUID reused for one logical run submission.", "Run evaluation and Retry submission.", true, "header"),
      ],
      responses: { "202": response("Run accepted. Poll GET with run.id.", ref("IndependentEvaluationRun")), ...failures },
    },
  };
}
