# Guard Governance Full UI Import Design

## Objective

Replace the lightweight Guard Governance prototype with a structurally complete import of the TaskLattice Guard user experience. The imported pages must retain the reference project's information hierarchy, workflows, and domain fields while running entirely on deterministic in-memory mock data.

The existing AgentEval application shell, routes outside `/governance`, permissions, Security pages, and Evaluation pages remain unchanged.

## Chosen Approach

Use a complete structural import with a local mock API adapter.

- Preserve the AgentEval sidebar, project routing, page boundary, and shared application providers.
- Recreate the reference page composition, detail tabs, sheets, tables, mobile layouts, and explanatory notices inside the existing `guard-governance` feature.
- Model the reference API response structures completely in TypeScript using AgentEval camelCase naming.
- Place all state transitions behind an asynchronous mock API facade so the UI behaves like the reference application without making network requests.
- Reuse AgentEval UI primitives when they express the same behavior. Import or recreate reference-specific composition components where the current primitives would remove information or workflow steps.
- English-only copy is acceptable for this import. No new localization framework is required.

## Global Constraints

- All data and mutations are local mock behavior; no real API calls are allowed.
- Existing AgentEval functionality and routes must not be modified beyond the already-added Guard Governance navigation group and governance route tree.
- The five top-level tabs remain Guardrails, Assignments, Enforcements, Integrations, and Evidence.
- Reference information may be supplemented by useful prototype features, but reference fields or workflows must not be replaced by simplified equivalents.
- Style consistency with the rest of AgentEval is optional. Information completeness and interaction fidelity take priority.
- Existing uncommitted Evaluation Layer changes are user-owned and must not be staged or altered.

## Architecture

### Complete domain model

The model will cover the full reference structures:

- Guardrail controls, automated-reasoning policy bindings, templates, template parameters, control definitions, draft and active versions, coverage, workflow state, and ownership flags.
- Test cases, test runs, aggregate metrics, case results, findings, grounding assessments, claims, reasoning findings, and execution trace steps.
- Assignments pinned to immutable Guardrail versions, including default and system-managed assignments.
- Recursive Traffic Scope expressions with field definitions, sources, dynamic keys, supported operators, and suggested values.
- Integrations with separate verification and runtime states, credential prefix, request/error counts, last activity, and timestamps.
- System health and capability availability.
- Governance audit events and detailed interaction decision evidence as separate concepts.

### Mock repository and API facade

The current synchronous store will evolve into a complete in-memory repository. A small asynchronous facade will expose reference-like operations such as listing, reading, creating, updating, testing, version activation, assignment creation, integration registration, and evidence queries.

Every mutation updates related projections in one transaction:

- Editing a Guardrail increments its draft version and invalidates current test readiness.
- Adding or deleting a test case invalidates current test readiness and records an audit event.
- A passing test run records metrics and case results, creates or activates an immutable version, updates coverage, and records audit events.
- Assignment creation pins the active Guardrail version and records an audit event.
- Integration registration returns a one-time mock credential, stores only its prefix, and records an audit event.
- Enabling or pausing an assignment updates effective enforcement and audit history.

The provider remains project-scoped and resets only when the project ID changes or the browser reloads.

## Mock Scenario Coverage

Fixtures must demonstrate every significant UI state:

- A built-in, system-managed default Guardrail and default catch-all Assignment.
- A template-derived, tested, versioned, actively assigned organization Guardrail.
- A custom Guardrail whose draft changed after its last test and therefore needs testing.
- A failed or incomplete test run with findings and trace detail.
- Multiple immutable Guardrail versions with active/inactive status and checksums.
- Nested Traffic Scopes using HTTP, authentication, model, LiteLLM, and A2A fields.
- Online, degraded, waiting, and disabled Integration states with realistic traffic counters.
- Healthy and degraded system capability summaries.
- Governance lifecycle audit events plus allow, block, redact, transform, and error decision traces.

## UI Design

### Guardrails

The list restores the reference registry columns and semantics: built-in indicator, status, control count, test evidence and compliance, assignment count, and last update.

Creation uses the reference three-step flow:

1. Select a built-in template or blank structured intent.
2. Configure the Guardrail name, template parameters, or business purpose and deterministic mock intent analysis.
3. Review controls and create the draft.

The detail page restores workflow progress, test and assignment readiness, and five tabs:

- Intent: allowed/restricted domains, decision posture, ownership, and runtime boundary.
- Controls: template summary, control definitions, phases, actions, limitations, and reasoning bindings.
- Test Cases: reviewed cases, complete test configuration, run controls, aggregate metrics, findings, content views, and execution traces.
- Versions: immutable versions, compiler version, plan checksum, created time, and active state.
- Assignments: all Traffic Scopes pinned to the Guardrail with direct assignment creation.

The edit sheet restores topics, safety level, output delivery, and controls. Built-in resources remain read-only.

### Assignments

The page restores default-first ordering, precedence explanation, recursive Traffic Scope badges, pinned Guardrail version, protected/paused states, and immutable baseline behavior.

Creation contains traffic identity and Guardrail selection sections. The Traffic Scope builder supports nested AND/OR groups, field-specific operators, custom header/JWT keys, and suggested values. Only currently tested, non-system-managed Guardrails can be selected.

The prototype Priority value may remain as an extension, but it must not replace pinned version or default-baseline semantics.

### Enforcements

The reference system-managed default enforcement is the primary surface. It shows the default Guardrail version, unmatched-traffic scope, baseline mode, and runtime boundary.

The prototype Effective Order table remains as an additional section for non-default enabled assignments. This section must clearly distinguish derived ordering from the immutable default baseline.

### Integrations

The page restores:

- Overall system health, active assignment count, and online/total integrations.
- Deterministic, fast semantic, deep judge, and automated reasoning capability cards.
- Integration list columns for environment, traffic, and runtime status.
- Detail sheet with ID, protocol, credential prefix, verification status, runtime activity, request/error counts, last activity, and trusted-context notice.
- Registration flow with a one-time full mock credential and copy action.

### Evidence

Evidence contains two sub-tabs:

- Audit Events reproduces the reference governance event log, including event kind, nullable Guardrail/Assignment context, outcome, detail, responsive mobile cards, and the privacy-preserving evidence notice.
- Decision Traces preserves the prototype's useful filters and rich runtime detail: input, output, matched controls, stage, reason, duration, and execution trace.

This separation prevents interaction evidence from replacing governance history.

## Shared UI Components

The feature will contain focused components for:

- Reference-style page header, status badge, empty/error/info states, entity sheet, creation progress, and workflow progress.
- Recursive Traffic Scope builder and expression summary.
- Guardrail workflow, intent, controls, tests, versions, and assignments panels.
- Test evidence metrics and case-result detail.
- Integration capability and runtime detail.
- Audit-event and decision-trace tables/cards.

Large page files will be split by responsibility so each panel can be tested independently.

## Error and Empty States

The mock API rejects invalid transitions with user-facing messages:

- A Guardrail cannot be tested without test cases.
- A Guardrail cannot be assigned without an active tested version.
- System-managed Guardrails and Assignments cannot be edited or paused.
- Traffic Scopes must contain valid leaf rules.
- Required template parameters and automated-reasoning bindings must be complete.
- Integration registration requires a supported protocol and environment.

Each query surface also supports loading, empty, and recoverable error presentation, even though fixture-backed operations normally resolve immediately.

## Testing Strategy

Implementation follows test-driven development.

- Model tests verify complete fixture shapes and reference enum coverage.
- Repository tests verify draft invalidation, test metrics, version activation, audit events, assignment pinning, integration credentials, and system-managed constraints.
- Traffic Scope tests verify recursive groups, custom keys, conversion, validation, and summaries.
- Page tests verify all reference fields and workflow sections are visible and interactive.
- Tests assert that existing Security Guardrails and other AgentEval navigation entries remain unchanged.
- Final verification includes the focused governance suite, the full control-app suite, TypeScript checking, production build, and browser inspection of every top-level page and Guardrail detail tab.

## Acceptance Criteria

- The five governance routes render the complete reference information architecture using only mock data.
- Guardrail creation, editing, testing, versioning, and assignment workflows can be completed locally.
- All reference domain fields are represented in the model and demonstrated by fixtures.
- Default/system-managed resources, nested Traffic Scopes, system capabilities, integration activity, audit events, and decision traces are visible.
- Current useful additions remain available without replacing reference behavior.
- No existing non-governance AgentEval feature is changed.
- All automated and browser verification passes.
