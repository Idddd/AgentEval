# Evaluation Demo UI Refinement Design

## Goal

Refine the Evaluation demo so evaluator policies are configured per evaluator, Sampling stays compact, Onboarding Assistant is the primary visual example without changing its Catalog lifecycle, report advice uses natural language, and demo role switching moves into the account menu with three user-facing personas.

## Scope and Constraints

- All Evaluation data and alert behavior remain frontend mock behavior. No notification or Evaluation API is added.
- Catalog lifecycle state and Overview/Trace showcase data do not need to be logically synchronized. This is an intentional demo-only exception.
- Existing uncommitted Dataset card-selector files remain outside this work and must not be staged in these commits.
- Existing backend project-role values remain unchanged. User-facing demo personas map onto existing roles.
- Existing route authorization is not redesigned. The End user requirement applies to visible project navigation.

## Evaluator-Specific Policy

### Data model

Move policy fields from global `EvaluationLayerSettings` onto each `EvaluationLayerEvaluator`:

- `minimumScore: number`, constrained to `0–100`, default `80`.
- `sendAlert: boolean`, default `false`.

Remove `minimumEvaluatorScore` and `sendEvaluatorAlert` from `EvaluationLayerSettings`. Fixture validation checks every evaluator independently.

The mock store exposes evaluator-scoped commands:

- `setEvaluatorMinimumScore(evaluatorId, score)` validates the evaluator, rejects non-finite input, rounds and clamps the value to `0–100`, and updates only that evaluator.
- `setEvaluatorSendAlert(evaluatorId, enabled)` validates the evaluator and updates only that evaluator.

### Evaluation behavior

Each enabled evaluator uses its own threshold. Built-in scores remain normalized from `0–1` to `0–100`; recorded judge scores remain normalized from `1–5` to `20–100`.

For an Overview Trace:

- Runtime `ERROR` always remains `ERROR`.
- Otherwise, the Trace is `FAIL` when at least one enabled, evaluated evaluator is below its own threshold, or when another enabled evaluator is missing while at least one evaluator produced a result.
- A Trace with no enabled evaluator results is not treated as a policy failure.
- The closed Score cell continues to show passed enabled evaluators over total enabled evaluators.
- `Alert triggered` appears when at least one failing evaluator has its own `sendAlert` enabled.

The score popover shows each evaluator's normalized score, raw scores, individual threshold, and alert setting.

### Overview UI

The Evaluators table gains two columns after `Enabled`:

- `Minimum score`: compact number input with a percent suffix.
- `Send alert`: checkbox.

Remove the global Minimum score and Send alert cards entirely. On narrow screens, the existing table overflow container provides horizontal scrolling.

## Sampling Simplification

Keep only:

- `Sampling` heading.
- Existing explanatory sentence.
- Sampling range control.
- Current percentage.

Remove:

- Green capture bar.
- Captured metric.
- Estimated capture cost.
- Estimated saving.
- Dropped failures metric.
- Dropped-failure warning.

Sampling remains a what-if preview and does not delete or hide stored Trace data.

## Onboarding Assistant Showcase

### Catalog presentation

Add `user-plus` to the shared Agent icon registry so the existing fixture icon resolves to a real UserPlus glyph instead of the generic fallback. Give the Onboarding Assistant icon a stronger accent treatment in Catalog lifecycle and card/list presentation while retaining the existing target name, ID, and lifecycle state.

### Overview and Trace presentation

Add dedicated showcase mock traces for `demo-onboarding-assistant`, including passing and failing evaluator results. These traces may reference a demo-only live-monitoring run or another fixture-safe context; they must pass fixture graph validation without changing the Catalog workspace lifecycle classification.

Overview keeps the `All Agents` filter by default but sorts Onboarding Assistant showcase traces ahead of other fixture traces. Live simulation traces continue to appear without displacing the intended initial showcase order unpredictably.

Trace detail adds an Agent identity header containing the target's prominent icon, `Onboarding Assistant`, and the target ID. Navigating from an Onboarding Assistant row opens the same existing Trace route and uses the same full Trace evidence UI.

## Suggestion Copy

Change visible report terminology from `Reflection` to `Suggestion`, including:

- Section title.
- Availability and permission messages.
- Action labels where they mention Reflection.

Keep internal interfaces such as `EvaluationLayerReflection`, `submitReflection`, and `finishReflectionWithoutChanges` unchanged to avoid an unrelated data-model migration.

Fixture suggestion text becomes natural-language guidance. The primary example is:

> Add a permission check before any privileged tool runs so denied requests are stopped before execution.

Generated mock suggestions use the same conversational, outcome-oriented style rather than terse command fragments.

## Demo Personas and Account Menu

### Placement

Remove the standalone `Demo · View as role` selector from the sidebar footer. Add a `View as` control inside the Local account dropdown, below account identity and above My Account/Sign out.

### User-facing choices and internal mappings

- `Admin` maps to internal role `admin`.
- `Agent Wizard` maps to internal role `ada` and therefore has exactly the existing ADA permissions.
- `End user` maps to internal role `frt` for frontend demo state.

The selector no longer shows member, compliance, ADA, FRT, or ISS labels.

### Navigation visibility

Admin and Agent Wizard use the existing role-based navigation behavior of their mapped roles.

End user is a deliberate navigation exception: show only the complete `Agentic` group with all six items:

- Agent Garden
- Instances
- Skills
- MCP Servers
- Knowledge Base
- Memory

Hide Security, Guard Governance, Evaluation, and Observer groups for End user. This is a frontend demo navigation rule and does not introduce or alter backend authorization.

To distinguish the user-facing persona from the reused `frt` role, the demo-role context exposes or derives a persona label. Navigation filtering must use that persona state for the End user group exception rather than globally changing all FRT behavior.

## Testing

Use test-driven development and verify each test fails for the missing behavior before implementation.

### Evaluator policy and store

- Fixture defaults exist on each evaluator.
- Evaluator threshold commands update only the selected evaluator, clamp valid numeric extremes, and reject non-finite or missing-evaluator input.
- Alert commands update only the selected evaluator and reject missing evaluator IDs.
- Policy summary compares each evaluator against its own threshold.
- Overall FAIL and alert-trigger decisions use the same evaluator detail results.
- Runtime ERROR and no-result behavior remain unchanged.

### Overview

- Evaluator rows contain Enabled, Minimum score, and Send alert controls.
- Editing one row does not change the other evaluator.
- No global policy cards remain.
- Sampling contains its slider and percentage but none of the removed bar or metrics.
- Onboarding Assistant traces are present and initially prioritized.
- Score, Status, filter counts, and alerts remain consistent.

### Catalog, Trace, and report

- Onboarding Assistant uses the UserPlus icon and prominent treatment.
- Onboarding Assistant Catalog lifecycle state remains unchanged.
- Trace detail renders Agent icon, name, and target ID.
- Reports display Suggestion and natural-language advice without visible Reflection terminology.

### Personas and navigation

- The sidebar footer no longer contains the standalone demo-role selector.
- The account menu presents exactly Admin, Agent Wizard, and End user.
- Agent Wizard produces the same permissions/navigation as ADA.
- End user sees exactly the Agentic group and all six Agentic items.
- Admin retains its current navigation.

### Verification

- Run focused Evaluation, account-menu, navigation, and permission tests.
- Run Control type checking.
- Verify Catalog, Overview, Trace, report, account menu, and narrow Overview in the browser.
- Run the full workspace test suite and separately retry only known 5-second timeout files if parallel load causes the existing flake.

