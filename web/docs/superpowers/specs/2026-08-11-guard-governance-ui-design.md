# Guard Governance UI Design

## Objective

Add the TaskLattice Guard governance experience to the existing AgentEval control application as a new, project-scoped navigation group. The work must preserve every existing route and feature, use only in-memory mock data, and visually conform to AgentEval rather than importing the standalone Guard application shell or design system.

## Scope

The new `Guard Governance` sidebar group contains five entries:

- Guardrails
- Assignments
- Enforcements
- Integrations
- Evidence

The existing Security group, including the existing `/$projectId/guardrails` route, remains unchanged. No TaskLattice Guard Python API, database schema, authentication UI, internationalization layer, sidebar, or global CSS is moved into AgentEval.

## Routes

All new routes are project-scoped and live under an isolated namespace:

- `/$projectId/governance/guardrails`
- `/$projectId/governance/guardrails/$guardrailId`
- `/$projectId/governance/assignments`
- `/$projectId/governance/enforcements`
- `/$projectId/governance/integrations`
- `/$projectId/governance/evidence`

The sidebar uses the five collection routes. Guardrail detail is reached from the Guardrails collection and retains the new governance namespace.

## Architecture

Create a self-contained `features/guard-governance` feature with these responsibilities:

- Domain types define Guardrails, controls, test cases, assignments, traffic scopes, integrations, evidence events, and derived enforcements.
- Fixtures provide deterministic initial data for each Project.
- A synchronous core store owns state transitions and derived selectors.
- `GuardGovernanceMockProvider` supplies the store to React pages and exposes short simulated asynchronous transitions for user operations.
- Shared feature components implement page framing, status presentation, entity sheets, creation sections, and traffic-scope editing while reusing AgentEval UI primitives.
- Route modules remain thin adapters that render feature pages.

The provider is mounted around the authenticated Project content alongside the existing Evaluation providers. It is keyed by Project ID so switching Projects creates an isolated fixture-backed state. State survives navigation among the five governance tabs but resets on a full browser refresh. It does not use local storage or database persistence.

## Functional Design

### Guardrails

The collection page shows status, configured risks, latest test result, assignment count, and last update. Users can create a Guardrail, open its detail, and edit its name, purpose, allowed and restricted topics, controls, safety level, and output-delivery mode.

The detail page supports test-case creation and deletion plus a simulated test run. A successful run moves the Guardrail to `READY`; a failed run moves it to `NEEDS_TESTING`. Test runs append Evidence events so downstream screens reflect the interaction.

### Assignments

The collection shows each Assignment's enabled state, Guardrail, priority, and traffic-scope summary. The creation sheet uses a structured Traffic Scope Builder and only permits selection of Guardrails in `READY` state. Assignments can be enabled or disabled in mock state.

### Enforcements

This page is read-only. It derives the effective enforcement order from enabled Assignments, their priorities, referenced Guardrails, and traffic scopes. It surfaces conflicts, uncovered traffic, inactive references, and an explanation of the enforcement boundary. Derived values are never duplicated in stored state.

### Integrations

The collection shows protocol, environment, enabled state, and simulated health. Users can register LiteLLM, HTTP, or A2A integrations and view or toggle an existing integration. Registration returns a mock credential that is displayed once in the success state and is not stored in a readable form.

### Evidence

The page lists decision events and supports filtering by Guardrail, Assignment, outcome, and risk. A detail view presents input, output, matched controls, execution stage, decision reason, trace steps, and duration. Seeded Evidence is supplemented by events produced by simulated Guardrail test runs.

## Data Flow and Validation

All writes go through named store actions such as `createGuardrail`, `updateGuardrail`, `runGuardrailTest`, `createAssignment`, `toggleAssignment`, `registerIntegration`, and `toggleIntegration`. Selectors derive navigation counts, effective enforcements, available Ready Guardrails, and filtered Evidence.

Domain validation is enforced in the store as well as reflected in forms. In particular:

- An Assignment cannot reference a missing or non-Ready Guardrail.
- Required entity names must be non-empty after trimming.
- A traffic scope must contain at least one valid rule.
- Integration protocol and environment values must be from the supported sets.
- A Guardrail test run must contain at least one test case.

The provider translates domain failures into field or form errors. Successful cross-page actions use the existing AgentEval toast presentation.

## Visual Integration

The feature uses the existing AgentEval PageHeader, Cards, Buttons, Badges, Sheets, Tables, Inputs, Selects, Tabs, Toasts, and Sidebar. It inherits AgentEval's violet accent, typography, compact radii, spacing, and light-theme behavior.

No styles, font imports, blue color tokens, standalone Guard shell, or duplicate `components/ui` files are copied from `tasklattice-guard`. Page content remains English to match the current control application.

Mobile layouts keep primary controls at least 44 pixels tall, allow dense tables to scroll horizontally, and stack sheet sections and filters at narrow widths.

## Loading, Empty, and Error States

Simulated writes expose short pending states so buttons cannot be submitted twice. Each collection has a dedicated empty state, and filtered Evidence distinguishes an empty dataset from zero filter matches. Assignments explain when no Ready Guardrails are available.

Feature rendering is protected by a local error boundary so a Guard Governance failure cannot replace the rest of the AgentEval shell. Domain errors are displayed next to the relevant form or in a form-level alert. Unexpected errors use the existing error and toast patterns.

## Testing Strategy

Implementation follows test-driven development. Each production behavior is preceded by a focused failing test and a verified red-green cycle.

Tests cover:

- Sidebar visibility, labels, active-route behavior, and preservation of the existing Security Guardrails entry.
- Route mapping for all six new routes and continued mapping of `/$projectId/guardrails`.
- Store transitions for Guardrail testing, Ready-only Assignment validation, derived Enforcement order, one-time Integration credentials, Evidence generation, and Evidence filters.
- Page interactions for Guardrail creation and testing, Assignment creation, Integration registration, and Evidence filtering.
- Project isolation and reset behavior for the provider.
- Empty, pending, validation, and local error-boundary states.

Final verification runs the focused Vitest tests, the wider control application test suite, TypeScript type checking, and the production build.

## Change Boundary

Implementation may add the new feature, route files, and tests, and may make narrowly scoped additions to the App Shell and generated route tree. It must not rewrite existing Evaluation Layer files or overwrite the user's current uncommitted changes. Generated route-tree updates must include only the new routes and normal generator output.

No backend, Prisma schema, migration, Python application, external service, browser persistence, or existing feature behavior is changed.

## Acceptance Criteria

- The `Guard Governance` group appears with five working entries.
- All new pages use shared Project-scoped mock state and the AgentEval visual system.
- The five approved workflows behave as specified without any network request.
- Existing navigation entries and routes retain their prior behavior.
- A full refresh restores deterministic fixtures.
- Focused tests, the control test suite, type checking, and production build pass.
