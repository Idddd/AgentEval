# Unified Guardrail Configuration and Evaluation Approval Design

## Purpose

Create a frontend-first demo in which one business Policy is configured once,
evaluated by whichever enforcement sources the IT administrator selects, and
approved by an Admin before it becomes ready for use.

The demo must preserve the existing User, Agent Wizard/IT Admin, and Admin
roles, remain deterministic in mock mode, and keep the current visual language.

## Goals

- Keep edit affordances visible without making them visually dominant.
- Replace separate Nemo and F5 configuration forms with one F5-style form.
- Allow one Policy to target Nemo, F5, or both without creating duplicate
  Policy records.
- Support long plain-text GenAI detection instructions.
- Run deterministic source-specific evaluations after IT configuration.
- Present concise evaluation results in the existing right-side Sheet.
- Require an Admin decision before a Policy becomes Ready.

## Non-goals

- No real Nemo or F5 network calls in this demo.
- No rich-text editor, document formatting, attachments, or file parsing.
- No full execution logs or trace viewer in the approval Sheet.
- No backend schema or database migration in this phase.
- No redesign of unrelated Guardrail Profile, Marketplace, or Evaluation pages.

## Existing Problems

The current mock workflow stores source-specific configuration strings in a
`configs` record. Selecting both sources creates two independent Policy
records. Nemo exposes Colang files and rail bindings while F5 exposes scanner
type, direction, version, and detection input. This creates two user-facing
configuration models and allows their lifecycle state to drift.

Completing IT configuration currently changes the Policy directly to Ready.
There is no explicit evaluation run, aggregated result, or Admin approval
stage. The F5 GenAI field is also a one-line input, which is unsuitable for
long detection instructions.

## Chosen Approach

Use one canonical F5-style configuration model and one Policy record. Store
the selected sources as an array. A source adapter converts the canonical
configuration to source-specific execution input. For the demo, adapters run
deterministic local fixtures; later, the adapter boundary can call real APIs
without changing the form or workflow.

This is preferred over maintaining two source records behind a unified UI,
because duplicate records would continue to create version, evaluation, and
approval synchronization problems. A new provider-neutral DSL is also
rejected for this phase because it adds fields and concepts the user did not
request.

## Canonical Configuration

The UI and store use one configuration structure:

```ts
type UnifiedTechnicalConfig = {
  scannerType: "custom" | "regex" | "keyword";
  direction: "request" | "response" | "both";
  content: string;
  versionName: string;
  versionDescription: string;
};

type EvaluationSource = "Nemo" | "F5";
```

Interpretation of `content` depends on `scannerType`:

- `custom`: long plain-text GenAI detection instructions.
- `regex`: a regular expression.
- `keyword`: a newline- or comma-separated keyword list normalized by the
  adapter.

The model stores `sources: EvaluationSource[]`. At least one source is required
before the IT administrator can complete configuration.

Legacy mock records are normalized on read:

- `source: "Guard"` becomes `sources: ["Nemo"]`.
- `source: "F5"` becomes `sources: ["F5"]`.
- Existing F5 configuration maps directly into the canonical structure.
- Existing Nemo-only configuration receives a readable canonical summary;
  the original string remains available only as migration input and is not
  shown as a second editor.

## Form and Interaction Design

The creation/configuration form is ordered as follows:

1. Name
2. Requirement
3. Scanner type
4. Detection content
5. Direction
6. Version name
7. Version description
8. Source selection
9. Save draft / Complete configuration

Source selection appears at the bottom and supports Nemo, F5, or both. The
same canonical values are used for every selected source.

For `custom`, Detection content uses a plain `Textarea` with a default minimum
height of 240 to 320 pixels, vertical resize, preserved whitespace, and a
character counter. It accepts document-sized plain text up to 100,000
characters. It has no formatting toolbar, colors, font controls, or rich-text
serialization.

Regex remains a compact input or small textarea. Keyword content remains a
plain input/textarea but is normalized into individual terms for evaluation.

## Persistent Edit Affordance

The `ClickToEdit` pencil button remains visible whenever a field is editable.
It uses a low-emphasis gray color and approximately 40 percent opacity by
default, then reaches full opacity and darker color on hover or keyboard
focus. Read-only and historical versions do not show it. No animation or
flashing is introduced.

## Workflow and State Machine

Extend the mock workflow stages to:

```ts
type WorkflowStage =
  | "Draft"
  | "Awaiting Agent Wizard"
  | "Configuring"
  | "Evaluating"
  | "Pending approve"
  | "Needs input"
  | "Ready";
```

Transitions:

```text
Draft
  -> Awaiting Agent Wizard
  -> Configuring
  -> Evaluating
  -> Pending approve
  -> Ready
```

Alternative transitions:

- Evaluation infrastructure error: `Evaluating -> Needs input`.
- Admin returns the result: `Pending approve -> Needs input`.
- IT Admin resumes a returned Policy: `Needs input -> Configuring`.
- Any configuration or source change invalidates the previous evaluation and
  returns the Policy to `Configuring`.

Test-case failures are not infrastructure errors. A completed run may contain
failed checks and still move to Pending approve, because the Admin owns the
acceptance decision.

Only the Admin role can approve or return a Policy in Pending approve. Agent
Wizard/IT Admin and User roles can view the results but cannot change the
approval state.

## Evaluation Model

Each completion of IT configuration creates one evaluation run:

```ts
type SourceEvaluationResult = {
  source: EvaluationSource;
  status: "running" | "completed" | "error";
  success: number;
  fail: number;
  responseTimeMs: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
};

type PolicyEvaluationRun = {
  id: string;
  configRevision: number;
  status: "running" | "completed" | "error";
  results: SourceEvaluationResult[];
  startedAt: number;
  completedAt?: number;
};
```

Only selected sources run:

- Nemo only: run the Nemo adapter.
- F5 only: run the F5 adapter.
- Nemo and F5: run both adapters concurrently.

The mock adapter uses stable fixture calculations based on Policy ID,
configuration revision, source, and content. It must not use unseeded random
numbers. Reopening or refreshing the page must preserve the same completed
result.

The run advances to Pending approve only after every selected source has
completed. If an adapter returns an execution error or never produces a valid
result, the run ends in error and the Policy moves to Needs input.

Response time is displayed per source. The aggregate summary uses total
success and fail counts and the slowest source response time, because parallel
execution completion is bounded by the slowest selected source.

## Evaluation Result Sheet

Reuse the existing right-side Sheet and its current spacing, typography, and
button styles. Do not add a separate route.

The Sheet contains:

1. Policy name and workflow badge.
2. Compact aggregate summary: Success, Fail, Response time.
3. One compact row/card per selected source.
4. Optional collapsed failure summary per source.
5. Approval actions fixed at the bottom for Admin users.

Example:

```text
Evaluation
12 Success   2 Fail   840 ms

Nemo   Complete
8 Success · 1 Fail · 420 ms

F5     Complete
4 Success · 1 Fail · 840 ms

[Return for changes] [Approve]
```

The Sheet opens automatically when evaluation starts. During Evaluating it
shows a small source-level progress indicator. It does not show full raw logs.
Failure details expand only when requested.

`Return for changes` requires a concise reason and moves the Policy to Needs
input. `Approve` records the Admin identity and timestamp, then moves the
Policy to Ready.

## Data Ownership and Compatibility

Workflow data remains on the single Policy entity in mock storage. Add:

- canonical technical configuration;
- selected sources;
- monotonically increasing configuration revision;
- latest evaluation run;
- approval metadata containing Admin owner and timestamp.

The old singular `source` and per-source `configs` fields remain accepted by
the restore/migration path but are no longer written by the new workflow.
Existing stored mock data must load without reset. The storage version is
incremented, and migration is deterministic and idempotent.

## Error Handling

- Empty source selection blocks completion with an inline error.
- Invalid scanner content blocks completion at the relevant field.
- Adapter execution errors appear on the affected source result and move the
  workflow to Needs input.
- A stale evaluation result whose `configRevision` differs from the current
  Policy is never approvable.
- Approval is disabled while any source is running or errored.
- Admin return requires a reason; the reason is shown to the IT Admin.
- Repeated clicks are guarded so one configuration revision creates only one
  active run.

## Testing Strategy

Add focused tests for:

- the pencil icon being visible by default and absent for read-only fields;
- unified form rendering with Source at the bottom;
- long custom GenAI text editing and persistence;
- legacy source/config migration;
- Nemo-only, F5-only, and dual-source evaluation dispatch;
- deterministic results across restore/refresh;
- parallel dual-source completion and aggregate response time;
- test failures reaching Pending approve;
- execution errors reaching Needs input;
- non-Admin users being unable to approve;
- Admin approval reaching Ready;
- Admin return reaching Needs input;
- configuration edits invalidating old evaluation and approval data.

Validation for the demo is the focused business-demo test suite plus the
Control workspace typecheck. Full repository validation is outside this UI
demo scope unless shared contracts are changed.

## Delivery Sequence

1. Extend the model, storage migration, and status presentation.
2. Replace source-specific editors with the canonical form and persistent
   edit affordance.
3. Add deterministic source adapters and workflow transitions.
4. Add the result/approval Sheet and role controls.
5. Add focused tests and verify the complete mock flow.

## Acceptance Criteria

- Editable pencils remain visible at low emphasis without hover.
- Creation and editing expose one technical configuration form.
- Source selection is the final configuration section.
- Custom GenAI input accepts long plain text and preserves line breaks.
- A Policy remains one record for one or multiple sources.
- Evaluation runs only for selected sources.
- Dual-source evaluation runs both source adapters and shows both results.
- The result Sheet clearly shows success, fail, and response time.
- Completed evaluation enters Pending approve, not Ready.
- Only an Admin can approve the current configuration revision.
- Approval changes the Policy to Ready.
- Existing mock records continue to load without clearing browser storage.
