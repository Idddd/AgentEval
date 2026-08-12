# Guardrail Complete UI Import Design

## Goal

Replace the rewritten Guard Governance Guardrail experience in AgentEval with the complete internal Guardrail UI from `tasklattice-guard`, while keeping the existing AgentEval application shell and using mock data only.

The imported experience must preserve the information architecture, visual hierarchy, responsive behavior, and user interactions of the Guard reference UI. It must not modify the existing AgentEval Security Guardrails feature or any unrelated AgentEval behavior.

## Product Boundary

AgentEval remains responsible for:

- authentication and the active project context;
- the project sidebar, header, breadcrumb, and account controls;
- routes under `/$projectId/governance/guardrails`;
- the Guard Governance mock provider lifecycle.

The imported Guardrail feature remains responsible for everything inside the page content area:

- Guardrail registry and its loading, error, and empty states;
- complete creation flow;
- Guardrail detail header and workflow status;
- intent, controls, test cases, versions, and assignments tabs;
- editing intent, adding and deleting test cases, running reviewed tests, and applying a tested Guardrail;
- complete test evidence, risk coverage, findings, grounding, reasoning, input/output evidence, and execution traces.

The Guard visual treatment may remain different from AgentEval. Blue accents, Guard spacing, larger corner radii, typography hierarchy, localized copy, and responsive table behavior are intentionally retained inside the feature boundary.

## Architecture

The implementation is a component-level import, not an iframe and not a visual approximation.

The Guard route implementation is split into focused AgentEval feature modules instead of copying the original 911-line route as one file. Presentation components retain the Guard DOM structure and class names. AgentEval-specific route parameters and provider access are passed through narrow props and hooks.

A mock adapter exposes Guard-compatible view models and operations. Imported components consume the same snake_case shapes used by the Guard UI, including nullable API fields. The adapter maps these operations to the existing in-memory Guard Governance store, so no HTTP request or real Guard API is introduced.

The existing camelCase AgentEval domain model may remain the store's internal representation. The adapter is the only boundary that converts between internal mock entities and the Guard UI contracts. This avoids spreading mixed naming conventions through the imported components.

## Page Structure

### Registry

The registry matches the Guard reference page:

- Guard eyebrow, title, description, and create action;
- loading skeleton, error notice, and empty-state variants;
- compact registry header with item count and open-detail hint;
- responsive table columns and row-level detail links;
- localized display name and purpose for the default Guardrail;
- status, control count, test evidence, assignment count, and updated timestamp;
- no AgentEval-only summary metric cards above the registry.

Mock fixtures include the system default plus ready, needs-testing, and disabled examples so all supported states remain visible without a backend.

### Creation Flow

The complete Guard creation sheet is imported:

- choose a reviewed template or blank intent;
- enter template parameters or describe business intent;
- run deterministic mock intent analysis;
- review allowed and restricted topics;
- review configured Controls and automated-reasoning bindings;
- validate required fields and invalid reasoning-policy configuration;
- create the Guardrail in the in-memory store and refresh the registry immediately.

Loading and error states are represented locally by the adapter. No external evaluator is called.

### Detail and Workflow

The detail route reproduces the Guard reference hierarchy:

- back link, status, last-updated timestamp, and context actions;
- system-managed baseline notice;
- Guardrail workflow status from intent through traffic assignment;
- Controls, Test Cases, Test Status, and Assignments metrics;
- tabs for Safety Intent, Controls, Test Cases, Versions, and Assignments.

The default Guardrail remains immutable and product-managed. User-created mock Guardrails can be edited, tested, and assigned.

### Intent and Controls

The intent tab includes allowed domains, restricted domains, decision posture, ownership, output delivery, and runtime boundary notices.

The Controls tab includes template provenance, version and parameter information, control definitions, model boundary or evaluation phase, detected action, limitations, and automated-reasoning policy bindings.

### Test Cases and Evidence

The test-case tab includes the complete reviewed-case list, creation sheet, deletion action, and mock test run action. Each case retains trusted instruction, untrusted target, phase, target source, expected decision, grounding query and sources, and optional automated-reasoning expectation.

The latest evidence view includes:

- compliance, false-positive, deep-escalation, and P95 latency metrics;
- per-risk coverage progress;
- expandable pass and failure rows;
- trusted instruction, test input, test output, and grounding content;
- expected and actual decisions, action, and reached stage;
- expected and actual automated-reasoning result;
- decision reason, triggered findings, grounding scores, claims and rule proofs;
- complete execution trace with per-stage duration.

Fixtures must provide at least one result exercising each complex evidence block so the imported UI is visibly complete.

### Versions and Assignments

The Versions tab displays immutable version metadata, including source draft, compiler version, checksum, creation time, and active state.

The Assignments tab uses the Guard assignment summary and opens the complete create-assignment sheet from the detail page. It continues to use AgentEval mock traffic-scope definitions and store mutations. Tested-current eligibility and the immutable default assignment rules remain enforced.

## Routing

Registry and detail navigation use TanStack Router `Link` components rather than plain anchors. The canonical paths are:

- `/$projectId/governance/guardrails`
- `/$projectId/governance/guardrails/$guardrailId`

Opening a registry row must render the Guardrail detail component without a full-page reload or fallback redirect. Back navigation returns to the same project's registry.

## Localization

Guardrail feature copy is imported in English and Simplified Chinese. The feature follows the active application language when it is available; otherwise it defaults to English. Default Guardrail display copy is localized without mutating the underlying fixture identity.

No global AgentEval translation migration is included.

## Mock Data and State

All operations remain in memory and reset with the Guard Governance provider. The mock adapter supports:

- list and detail reads;
- templates, Control definitions, test cases, versions, and assignments;
- intent analysis and status;
- Guardrail create and edit;
- test-case create and delete;
- reviewed test execution and immutable version creation;
- Assignment creation.

The adapter exposes explicit loading, empty, and error fixtures for component tests. Production rendering uses the populated fixture by default. It does not use `fetch`, React Query network functions, SQLite, Prisma, or the Guard backend.

## Error and Permission Behavior

- Missing Guardrails render the imported not-found empty state.
- Invalid creation or edit input stays in the open sheet with an inline error.
- Tests cannot run without at least one reviewed case.
- Assignments cannot be created for an untested or system-managed Guardrail.
- Product-managed default intent and controls cannot be edited.
- Existing AgentEval project and role access rules remain authoritative; this import does not grant new permissions.

## Testing

Component tests verify the visible Guard behavior rather than implementation details:

- the registry matches the Guard structure and excludes the AgentEval metric-card rewrite;
- default, ready, needs-testing, and disabled states render from mock data;
- creation supports template and blank-intent paths;
- registry links reach the detail route without fallback redirection;
- all five detail tabs render their complete information;
- the default Guardrail is immutable;
- custom cases can be added and deleted;
- running tests renders full evidence and creates a version when passing;
- tested Guardrails can open and complete Assignment creation;
- English and Simplified Chinese feature copy are available;
- no Guard API request is made.

Verification consists of focused Guard Governance tests, Control app type checking, a production build, and browser comparison against the running Guard reference at desktop and narrow widths.

## Out of Scope

- embedding Guard as an iframe or separate microfrontend;
- connecting AgentEval to the Guard backend or database;
- replacing AgentEval authentication or application navigation;
- changing the existing Security Guardrails feature;
- making the remaining four Guard Governance pages pixel-identical in this change;
- changing Guard policy evaluation algorithms.
