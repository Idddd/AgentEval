# Modular Agent Evaluation Platform Design

**Date:** 2026-07-30

**Status:** Approved for written-spec review

**Audience:** Product and engineering

**UI language:** English

## Goal

Turn the current single-purpose evaluation demo into a modular local evaluation
workbench where each Agent owns its tools, datasets, evaluation runs, and
reports. The workbench must make tool execution observable, add a fixed
LLM-as-a-Judge evaluation, preserve historical results, expose token cost, and
allow reports from different Agent revisions to be compared.

The first delivery is a local, single-user product. It uses SQLite for durable
product records and Langfuse for traces, observations, scores, token usage, and
cost telemetry.

## Product Principles

1. **Agent is the primary object.** Tools, datasets, runs, and reports are scoped
   to one Agent instead of being global demo configuration.
2. **Examples do not define the architecture.** An Agent may call another Agent,
   an HTTP API, an MCP server, or another adapter supported later. The UI and
   persistence model contain no fixed Weather, HR, or Operations assumptions.
3. **Runs are reproducible.** A completed Eval Run references immutable Agent
   and Dataset revisions.
4. **Facts and judgments remain separate.** Deterministic evaluators decide
   structural facts such as tool execution and permission order. An LLM Judge
   assesses response quality but cannot override deterministic failures.
5. **Reports are durable views of immutable results.** Opening a historical
   report must show the same configuration, cases, scores, evidence, and cost
   that were recorded when its run completed.
6. **Color is supplemental.** Every state is expressed with explicit English
   text such as `PASS`, `FAIL`, `INCOMPLETE`, or `NEEDS ATTENTION`.

## Selected Architecture

The selected approach is a hybrid architecture.

- **SQLite is the product system of record.** It stores Agents, immutable Agent
  revisions, Dataset revisions, Eval Runs, per-case result snapshots, report
  summaries, comparison metadata, and Langfuse identifiers.
- **Langfuse is the observability system of record.** It stores traces,
  typed observations, evaluation scores, generation usage, and cost telemetry.
- **The application joins both systems.** Stable SQLite records link to
  Langfuse trace and observation IDs. A Langfuse outage must not erase existing
  report history.

Langfuse is not used as the only product database because Agent revisioning,
module ownership, historical report navigation, and configuration comparison
are product-domain concerns. SQLite is not used to recreate the full Langfuse
trace UI or metrics engine.

## Domain Model

### Agent Profile

An Agent Profile has a stable `agent_id`, display name, description, creation
time, and current revision pointer. It owns its Datasets, Eval Runs, and Reports.

The product starts with an empty Agent list. Sample Agents may be loaded by a
separate demo-fixture command, but sample identities and tools never appear in
core UI logic.

### Agent Revision

An Agent Revision is immutable after creation. It contains a snapshot of:

- model provider and model name;
- system prompt and model parameters;
- Agent adapter configuration;
- Tool bindings and their execution adapters;
- permission and guardrail policy;
- non-secret runtime settings.

Secret values are never copied into a revision. A revision stores secret
references or environment-variable names only.

Editing any of these values creates a new revision. Existing runs continue to
reference the old revision.

### Tool Binding

Each Tool Binding belongs to exactly one Agent Revision. A binding contains:

- stable `tool_id` within the Agent Profile;
- display name and description;
- connection type such as `agent`, `http`, `mcp`, or `python`;
- input schema and sanitized output schema;
- adapter configuration and secret references;
- permission requirements;
- custom test requirements;
- whether external effect verification is required;
- enabled/available state.

The same external service may be bound to multiple Agents, but every Agent
revision keeps its own binding snapshot and test requirements.

### Dataset and Dataset Revision

A Dataset belongs to one Agent Profile. Dataset editing occurs in a mutable
draft. Publishing or starting an evaluation creates an immutable Dataset
Revision containing the complete ordered case snapshot.

Each Test Case has a stable `case_id`, input, expected deterministic behavior,
optional reference answer, tags, source, and review metadata. Stable case IDs
are used to compare results across Dataset revisions.

The initial draft list is empty. Cases enter the list only through explicit
user actions:

- manual creation;
- LLM draft generation;
- JSON import;
- coverage completion;
- duplication of an existing case.

LLM-generated or imported cases remain drafts until the user reviews, edits,
selects, and confirms them. The LLM never supplies permission expectations,
expected tool outcomes, or evaluation scores; the application derives those
deterministically from the selected Agent Revision.

### Eval Run

An Eval Run is immutable after completion and references exactly one Agent
Revision and one Dataset Revision. It stores:

- run ID, start time, completion time, and status;
- Agent and Dataset revision IDs;
- environment and evaluator versions;
- Langfuse trace IDs;
- per-case result snapshots;
- deterministic scores and reasons;
- Judge scores and reasoning;
- tool evidence;
- token usage and cost snapshots;
- run-level totals.

Run statuses are `QUEUED`, `RUNNING`, `COMPLETED`, `PARTIAL`, and `FAILED`.
Completed results are never overwritten by a rerun; rerunning creates a new
Eval Run.

### Report

A Report is generated from one Eval Run. SQLite stores its structured summary
and the exact rendered Markdown artifact path. Regeneration produces a new
artifact version without modifying the Eval Run.

The Report summary includes the Agent name and revision, Dataset name and
revision, run timestamp, aggregate scores, case results, tool evidence, Judge
results, token usage, cost, failure analysis, and Langfuse trace links.

## Evaluation Pipeline

For each case, the runner performs the following sequence:

1. Load the immutable Agent Revision and Test Case snapshot.
2. Start a Langfuse `agent` observation for the Agent invocation.
3. Record each model request as a `generation` observation with model,
   parameters, input, output, usage details, and cost details.
4. Record permission checks as `guardrail` observations.
5. Record each actual Tool adapter invocation as a `tool` observation.
6. Finish the Agent invocation and capture its final response.
7. Run deterministic evaluators against the normalized trace and expectations.
8. Run the fixed LLM Judge against the case input, reference context, Agent
   output, and a compact deterministic-evidence summary.
9. Save scores to Langfuse and snapshot all result fields into SQLite.
10. Aggregate the completed cases into the immutable Eval Run and Report.

If Langfuse ingestion is delayed, the runner polls for the trace up to a bounded
timeout. A timeout produces a `PARTIAL` run with a clear telemetry error; it
does not silently mark the case as passing.

## Tool Execution Evidence

Tool evaluation uses four distinct states:

1. **Requested:** the model produced a structured Tool Call for the configured
   tool name and arguments.
2. **Executed:** a completed Langfuse observation of type `tool` exists for the
   matching call ID.
3. **Succeeded:** the Tool observation ended without an error and contains a
   valid adapter result.
4. **Effect verified:** a mutation-capable Tool returned the configured receipt,
   transaction ID, status code, or verification payload.

For read-only Tools, `effect_verified` is `NOT REQUIRED`; it is not counted as a
failure. For Tools configured with `verification_required=true`, missing or
invalid verification evidence fails the deterministic Tool score.

A model Tool Call alone proves only intent to invoke. It does not prove adapter
execution. A generic span without a Tool result is also insufficient. The
Report links every tool-evidence row to its Langfuse trace and observation IDs.

The normalized evidence record includes requested arguments, sanitized
executed arguments, sanitized output, error, start/end timestamps, latency,
call ID, observation ID, and verification receipt. Secrets and configured
sensitive fields are redacted before persistence or display.

## Deterministic Evaluation

The deterministic evaluator remains authoritative for:

- expected Tool selection;
- requested versus executed Tool state;
- permission and guardrail decision;
- required guard-before-tool ordering;
- forbidden execution after denial;
- Tool success and required effect verification;
- required Tool arguments and response schema;
- trace completeness.

Deterministic scores use explicit booleans or normalized numeric values and
always include a machine-readable reason code plus an English explanation.

## LLM-as-a-Judge

The first version uses a fixed rubric with four dimensions:

- `correctness`;
- `relevance`;
- `completeness`;
- `safety`.

Each dimension receives an integer score from 1 to 5 and a concise reason. The
Judge also returns an overall summary. The rubric version, Judge model, prompt
version, and Judge generation trace ID are persisted with every Case Result.

A case passes the Judge gate when its average Judge score is at least 4.0 and
its Safety score is at least 4. A deterministic failure always makes the case
fail regardless of Judge score. If the Judge call fails or returns invalid
structured output, the case is `INCOMPLETE`, not failed or passed, and the user
may create a new evaluation run after correcting the issue.

Judge calls are recorded as Langfuse `generation` observations nested under an
`evaluator` observation. Judge scores and reasoning are written to Langfuse and
snapshotted in SQLite.

## Token and Cost Accounting

Langfuse generation usage is the primary source for token and cost data. When a
provider returns usage or billed cost, the application ingests those exact
values. Langfuse model definitions may infer missing cost, including custom
model pricing configured for DeepSeek.

Every Eval Run separates:

- **Agent Run Cost:** generations produced by the Agent under test;
- **Judge Cost:** generations produced by LLM-as-a-Judge;
- **Evaluation Total:** Agent Run Cost plus Judge Cost;
- **Dataset Generation Cost:** LLM calls used to create draft cases, displayed
  separately and excluded from Evaluation Total.

Reports show input, output, cached, reasoning, and total tokens when provided by
the model. They also show cost by case, model, and category. The exact usage and
cost values are snapshotted at run completion so later pricing-table changes do
not rewrite historical reports.

## Report Status and Visualization

The overall status follows this precedence:

1. `INCOMPLETE` when required case results, telemetry, or Judge results are
   missing;
2. `NEEDS ATTENTION` when any deterministic or Judge gate fails;
3. `PASS` when all required cases pass.

The Report page contains:

1. a textual status banner with run time, Agent Revision, and Dataset Revision;
2. Pass Rate, average Judge Score, Verified Tool Calls, and Evaluation Cost;
3. four directly labelled Judge dimension bars;
4. a Tool funnel showing Requested, Executed, Succeeded, and Verified counts;
5. a case result matrix with explicit `PASS`, `FAIL`, or `INCOMPLETE` labels;
6. Agent and Judge token/cost breakdowns;
7. failure analysis with deterministic reason codes and Judge reasoning;
8. links to relevant Langfuse traces;
9. Report History and Compare actions.

Red and green may reinforce failure and success, but icons, text, borders, and
table status labels carry the meaning independently.

## Historical Reports and Comparison

Reports are listed under their owning Agent and also in a global Reports view.
The list shows run time, Agent Revision, Dataset Revision, status, Pass Rate,
Judge Score, verified Tool count, and Evaluation Cost.

The user selects a baseline Report and a current Report. The comparison shows:

- Agent configuration changes, including model, prompt, Tool bindings, and
  policy;
- Dataset changes, including added and removed stable case IDs;
- score deltas for cases shared by both Dataset revisions;
- resolved failures, regressions, and unchanged failures;
- Tool evidence-state changes;
- token and cost deltas.

When Dataset revisions differ, headline paired deltas use only shared case IDs.
Added and removed cases are displayed separately so coverage changes are not
misrepresented as quality changes. Full-run totals remain visible with a
`Different dataset revisions` warning.

## UI Information Architecture

### Visual reference

The functional information architecture below remains authoritative. Its visual
shell and interaction language follow the Eval Studio reference at
`http://172.16.18.154:3000/dashboard`: dark-green fixed sidebar, translucent
white workspace header, pale neutral canvas, restrained mint/cream ambient
accents, bordered white cards, compact status pills, and a single dominant
green primary action per view.

Default tokens are canvas `#F4F6F4`, sidebar `#102E28`, primary `#176B55`,
text `#17201E`, border `#DCE3DF`, 10–15px radii, Arial/Helvetica sans-serif,
34px/700 page titles, and 20px card padding. The reference does not authorize
mock login, identity/organization switching, teams, or fixed Project/Experiment
entities. All copy remains English and all status remains textual as well as
visual.

The global English navigation contains only:

- **Agents**
- **Datasets**
- **Reports**
- **Settings**

The Agents page displays a list of Agent modules and a **New agent** action.
Selecting an Agent opens its workspace with four modules:

- **Tools:** Tool bindings, connection types, requirements, availability, and
  edit/remove actions for the selected Agent only.
- **Datasets:** the selected Agent's dataset drafts and revisions.
- **Runs:** immutable evaluation history for the selected Agent.
- **Reports:** durable reports and comparisons for the selected Agent.

The product contains no fixed Agent identities or fixed set of three Tools.
Each list supports explicit add actions and an instructional empty state.

**New evaluation** opens a contextual Guided Wizard for the selected Agent:

1. confirm Agent Revision;
2. select or publish Dataset Revision;
3. review evaluator and cost settings;
4. run and open the resulting Report.

This preserves the previously approved guided workflow without making the
entire product a single linear wizard.

The formal product has no `Reset Demo` control and no Roadmap icons or text.
Demo fixtures, when needed, are managed outside the main product interface.

## SQLite Storage

The first implementation uses focused tables for:

- `agents`;
- `agent_revisions`;
- `datasets`;
- `dataset_revisions`;
- `test_cases`;
- `eval_runs`;
- `case_results`;
- `tool_evidence`;
- `judge_scores`;
- `usage_costs`;
- `reports`.

Large immutable configuration and result snapshots may use validated JSON
columns while identifiers, ownership, revision numbers, timestamps, statuses,
and comparison keys remain indexed relational fields. Database migrations are
versioned and run at application startup.

## Error Handling

- Invalid Tool configuration prevents creation of a new Agent Revision and
  displays field-level errors.
- Unavailable Tool adapters remain visible with `UNAVAILABLE`; a run cannot
  start if a selected case requires one.
- A Tool timeout or exception produces `Executed = true`, `Succeeded = false`,
  and a sanitized error.
- Invalid Judge JSON is retried once using a repair prompt. A second failure
  produces `INCOMPLETE`.
- Missing Langfuse credentials fall back to the existing local trace backend,
  but the UI explicitly labels telemetry and cost limitations. Historical
  SQLite reports remain readable.
- Partial runs preserve completed cases and their costs; they are never shown
  as passing.
- Report rendering failures do not delete the underlying Eval Run and can be
  retried as a new report artifact version.

## Migration from the Current Demo

Existing `config/tools.yaml` is imported once as an initial Agent Revision when
the database is empty. Existing dataset items may be imported into a Dataset
draft for that Agent. Existing experiment JSON and Markdown reports are not
silently rewritten; a migration command may import them as legacy read-only
records when their references are complete.

The current monolithic `app.py` is split by responsibility during
implementation. Business services and persistence remain independent from
Streamlit rendering so another UI can reuse them later.

## Testing

Unit tests cover:

- Agent and Dataset revision immutability;
- Agent ownership of Tool bindings, Datasets, Runs, and Reports;
- stable case matching across Dataset revisions;
- all Tool evidence transitions and verification requirements;
- deterministic-failure precedence over Judge scores;
- Judge schema validation, threshold behavior, and retry failure;
- token/cost category aggregation and immutable snapshots;
- Report comparison for same and different Dataset revisions.

Integration tests cover SQLite migrations, Langfuse observation mapping,
Score ingestion, trace links, and full Eval Run persistence. Langfuse tests use
a controlled test project or a protocol-compatible fake and never depend on
unbounded polling.

Streamlit AppTest coverage verifies:

- the English global navigation;
- an empty Agent list and Agent creation entry point;
- switching Agents changes the visible Tool list;
- Agent-scoped empty Dataset actions;
- durable Run and Report history after application restart;
- explicit status text and accessible Report visuals;
- comparison selection and different-Dataset warnings.

The complete pytest suite and a local Docker smoke test must pass before the
feature is considered complete.

## Delivery Boundaries

The first version intentionally excludes multi-user authentication, team
permissions, remote PostgreSQL, production traffic monitoring rules, arbitrary
plugin installation, and external side-effect verification beyond the receipt
contract returned by a Tool adapter. The storage and adapter interfaces should
permit these later without placing them in the first implementation scope.
