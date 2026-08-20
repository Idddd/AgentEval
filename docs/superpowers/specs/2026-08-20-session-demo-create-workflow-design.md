# Session-Only Create and Agent Lifecycle Demo Design

**Date:** 2026-08-20

**Status:** Approved in chat; pending written-spec review
**Scope:** Pure UI demo only

## Purpose

Add a Create workspace and connect the existing demo pages into one complete, clickable lifecycle:

```text
Build → Technical Validation → Submit Release Candidate
→ Business Eval → Approve → Agent Garden → Create Instance → Stop Instance
```

The demo must work without a page refresh. Resources created in one persona must remain available after switching persona in the same browser tab. Refreshing or closing the tab must discard all session-created data and restore the initial fixtures.

This design intentionally does not implement real Agent deployment, MCP discovery, model execution, evaluation, secrets, runtime provisioning, or persistence.

## Personas and Navigation

### Agent Wizard

```text
Create
My Builds
Technical Validation
```

The Agent Wizard is the technical builder. This persona creates build resources, creates or updates Agent revisions, inspects dependencies and configuration changes, and runs deterministic technical validation.

### Admin

```text
Eval
Guardrails
Monitor
```

The Admin is the business governor. This persona evaluates business readiness, approves or rejects release candidates, creates business-oriented Guardrails, and monitors business outcomes. Monitor contains `Behavior` and `Production Monitoring` subpages.

### End User

```text
Agent Garden
My Instances
```

The End User is a business consumer. This persona selects an approved business capability, creates an Instance with minimal business context, and stops it.

Persona switching must not refresh the page or recreate the workflow store.

### Persona-Specific Product Views

All personas share one workflow store and one lifecycle, but each surface uses a persona-specific view model.

- Agent Wizard surfaces may show revisions, runtime type, Endpoint, Model, MCP, Skill, Knowledge Base, configuration diff, and technical validation details.
- Admin surfaces show business purpose, target users, criticality, data sensitivity, scenario outcomes, Guardrail coverage, approval evidence, cost, and risk. Technical identifiers are hidden by default.
- End User surfaces show business outcomes, intended users, approved status, Owner, availability, and simple Instance actions. Runtime, Endpoint, Model, MCP, and revision identifiers are hidden by default.

The store remains the single source of truth; persona-specific views must not copy or fork workflow state.

## Session Isolation

The application creates one `DemoWorkflowStore` inside a project-level React provider for each browser tab.

- The store lives only in client memory.
- Initial fixtures are cloned for each store instance.
- No module-level mutable maps or singleton workflow stores are allowed.
- No workflow mutation writes to PostgreSQL or calls an existing write API.
- No workflow data is stored in `localStorage` or `sessionStorage`.
- A generated `demoSessionId` scopes all session-created entities and events.
- Persona switching reuses the current provider instance.
- Refreshing the page creates a new store with fresh fixtures.
- Two users or two browser tabs cannot observe each other's session-created data.

This isolation model is required for a deployed multi-user demo.

## Create Workspace

Add a project route at `/$projectId/create`, visible only to Agent Wizard. Guardrails are deliberately excluded because they remain part of Admin Governance.

Create supports four resource types:

1. Agent
2. MCP Server
3. Skill
4. Knowledge Base

Each resource section provides:

- a list of session-created resources;
- a `Create` action;
- a valid, editable, prefilled demo form;
- a visible `SESSION` marker;
- view and edit actions for drafts;
- deletion while the draft is not referenced by an Agent revision.

### Minimum Demo Fields

Agent:

```ts
{
  name: string;
  owner: string;
  description: string;
  runtimeType: string;
  mcpIds: string[];
  skillIds: string[];
  knowledgeBaseIds: string[];
}
```

MCP Server:

```ts
{
  name: string;
  endpoint: string;
  authType: "none" | "bearer_token" | "api_key";
}
```

Skill:

```ts
{
  name: string;
  description: string;
}
```

Knowledge Base:

```ts
{
  name: string;
  sourceType: string;
  description: string;
}
```

The values are presentation data only. Endpoint and authentication values are not used for network calls. The prefilled values are technical because Create is an Agent Wizard surface.

## Workflow State

The store contains these logical collections:

```text
resources
  agents
  mcpServers
  skills
  knowledgeBases
evaluations
  targets
  datasets
  runs
  reports
  approvals
governance
  guardrails
  evalTemplates
catalog
  approvedAgents
runtime
  instances
events
```

Session-created entities include:

```ts
{
  id: string;
  demoSessionId: string;
  projectId: string;
  createdByPersona: "agent-wizard" | "admin" | "end-user";
  createdAt: string;
  source: "SESSION";
}
```

Fixture entities retain `source: "FIXTURE"` or their existing equivalent.

## Agent Definitions and Revisions

An Agent is a stable identity. Build configuration belongs to immutable numbered revisions.

```text
Agent
├── R1 · APPROVED
├── R2 · REJECTED
└── R3 · DRAFT
```

The Agent records its current approved revision and active draft revision. The demo permits at most one active draft revision per Agent.

The revision records technical and business readiness as separate stages in one lifecycle.

Technical flow owned by Agent Wizard:

```text
DRAFT
→ READY_FOR_VALIDATION
→ VALIDATING
→ VALIDATED
→ RELEASE_CANDIDATE
```

Business flow owned by Admin:

```text
RELEASE_CANDIDATE
→ PENDING_EVAL
→ BUSINESS_EVALUATING
→ READY_FOR_APPROVAL
→ PENDING_APPROVAL
→ APPROVED
→ PUBLISHED
```

Failure paths:

```text
VALIDATING → VALIDATION_FAILED → READY_FOR_VALIDATION
BUSINESS_EVALUATING → BUSINESS_EVAL_FAILED → PENDING_EVAL
PENDING_APPROVAL → REJECTED
```

### Updating an Existing Agent

`Create New Revision` clones the latest approved revision into the next numbered draft. The Create UI shows a simple field-level comparison against the approved revision.

```text
Approved R1
→ Create New Revision
→ R2 Draft
→ Validate R2
→ Submit Release Candidate
→ Business Eval R2
→ Admin decision
→ Publish R2 when approved
```

Rules:

- Approved revisions cannot be edited in place.
- A rejected new revision does not remove the previous approved revision from Agent Garden.
- Approval makes the new revision the default Garden revision.
- Existing Instances remain pinned to the revision used at creation.
- New Instances default to the latest published revision.
- Editing a draft after technical validation returns it to `READY_FOR_VALIDATION` and clears its technical validation result and any later business evidence.
- No cryptographic configuration fingerprint is required for this UI demo.

The same revision update is presented differently by persona:

- Agent Wizard sees technical changes such as Model, MCP, Skill, Knowledge Base, and validation result.
- Admin sees business impact such as newly accessible data, affected users, risk change, success-rate change, and required Guardrail review.
- End User sees only whether a newer approved version is available; an existing Instance continues using its pinned stable revision.

## Technical Validation, Business Eval, and Approval

Dataset and Evaluator creation remain in Eval rather than Create.

### Agent Wizard Technical Validation

The Agent Wizard opens a draft revision in My Builds and runs deterministic technical validation. This view may show dependency configuration, MCP/Skill/Knowledge bindings, runtime settings, and field-level revision diff. A short client timer simulates:

```text
QUEUED → VALIDATING → VALIDATED
```

The validation result is deterministic fixture data and does not call a runtime, MCP server, model, or remote service. A validated revision can be submitted as a Release Candidate.

### Admin Business Eval

The Admin opens Eval and sees the Release Candidate through a business view. Admin inputs are prefilled and editable:

```text
Business purpose
Target users
Criticality
Data sensitivity
Success threshold
Required Guardrails
Approval reason
```

Admin selects a business Dataset and one or more Guardrail Eval Templates, then starts a deterministic demo evaluation:

```text
PENDING_EVAL → BUSINESS_EVALUATING → READY_FOR_APPROVAL
```

The result emphasizes scenario success, business risk, Guardrail coverage, and approval evidence. Endpoint, Secret reference, MCP schema, and raw runtime configuration are hidden by default.

After a passing business evaluation, Admin approves or rejects the exact Release Candidate revision. Approval publishes that revision to Agent Garden.

The UI must prevent direct transitions that skip Build, Technical Validation, Release Candidate submission, Business Eval, or Approval.

## Guardrail to Eval Template Mapping

Guardrail creation remains under Governance. Every created Guardrail revision maps to a versioned Eval Template revision.

```text
Guardrail: pii-protection R1
Eval Template: guardrail-template:pii-protection:R1
```

The mapped template records:

```ts
{
  sourceGuardrailId: string;
  sourceGuardrailRevisionId: string;
  applicableTargetKinds: string[];
  requiredFor: string[];
  testCases: DemoGuardrailTestCase[];
}
```

Mapping rules:

- Admin creates Guardrails with business-language fields: allowed behavior, restricted behavior, applicable business scenarios, risk level, and response action.
- Creating from a Guardrail template copies its prefilled demo test cases.
- Creating a custom Guardrail supplies a prefilled ALLOW case and DENY case.
- A newly created Guardrail immediately appears in the Eval Template picker.
- Creating a Guardrail revision creates a new Eval Template revision.
- Historical runs continue referencing the template revision selected at run time.
- Disabled Guardrails cannot be selected for new evaluations, but historical evidence remains visible.
- A draft that referenced an older Guardrail template version displays `NEEDS_RE_EVALUATION` until the new template is evaluated.

Admin sees business coverage such as `8 safety scenarios covered`; internal Eval Template IDs and raw case metadata are hidden by default. Agent Wizard may inspect the generated template and technical test cases from an advanced validation view.

No real Guardrail enforcement is performed.

## Agent Garden and Instances

Agent Garden contains fixtures plus session revisions whose state is `PUBLISHED`.

Agent Garden cards use business language and show the problem solved, target users, typical scenarios, business Owner, approved status, latest business evaluation summary, and availability. Runtime, Model, Endpoint, MCP, Eval Template ID, and Revision ID are hidden from the End User view.

The End User selects an approved Agent and clicks `Apply Instance`. A prefilled Instance form asks only for:

```text
Instance name
Team
Intended use
```

Technical configuration is inherited from the published revision. Submitting the form creates a session-only Instance.

The store uses short timers to simulate:

```text
PROVISIONING → READY
```

Stopping uses:

```text
READY → STOPPING → STOPPED
```

Stopping an Instance:

- keeps it visible in My Instances;
- disables Terminal and new work actions;
- preserves its Agent revision reference and displayed history;
- does not delete the Agent, revision, evaluation, or approval.

No runtime, sandbox, terminal, key, or backend Instance is created.

## Monitor

Every significant workflow action appends a session event containing the session, project, persona, entity, action, outcome, timestamp, audience, and lightweight display metadata.

Admin Monitor is business-oriented:

- Behavior shows business-evaluation outcomes, Guardrail incidents, blocked scenarios, and approval coverage.
- Production Monitoring shows active Agents, active Instances, adoption, task success, estimated cost, business failures, and Instance lifecycle.

Technical validation errors, MCP configuration, dependency details, and runtime-style logs remain in Agent Wizard's My Builds diagnostics rather than Admin's default Monitor.

Monitor reads only from the current `DemoWorkflowStore` and therefore cannot expose another browser tab's events.

## Minimal Validation and Errors

The UI must handle only errors needed to keep the demo coherent:

- missing required prefilled field after user editing;
- duplicate session resource name or alias;
- deletion of a resource referenced by an Agent draft;
- Release Candidate submission before technical validation;
- business evaluation without a Dataset or Guardrail Eval Template;
- approval by a non-Admin persona;
- Instance creation from an unpublished revision;
- repeated stop of a stopped Instance;
- a Guardrail with no valid demo test cases.

Errors remain inside the current client store and are not transmitted.

## Verification

Keep testing proportional to the UI-demo scope.

Required store tests:

- two store instances do not share session-created data;
- recreating the store removes session-created data;
- Guardrail creation immediately creates an Eval Template revision;
- a new Agent revision does not mutate the previous approved revision;
- an Instance remains pinned to its creation revision.

Required integration test:

1. Agent Wizard creates prefilled MCP, Skill, and Knowledge Base resources.
2. Agent Wizard creates an Agent R1 draft.
3. Agent Wizard runs Technical Validation.
4. Agent Wizard submits R1 as a Release Candidate.
5. The persona switches to Admin without refreshing.
6. Admin runs Business Eval with a Dataset and Guardrail coverage.
7. Admin approves R1.
8. The persona switches to End User without refreshing.
9. End User finds the business-oriented Agent card in Garden and creates an Instance with the prefilled business form.
10. The Instance reaches `READY` and is stopped.
11. The Instance reaches `STOPPED`.
12. Admin Monitor shows the business workflow event chain while Agent Wizard diagnostics retain technical events.

The test must also assert that the demo workflow does not invoke existing write APIs. Timers use fake timers.

## Out of Scope

- Real Agent, MCP, Skill, or Knowledge Base provisioning
- MCP discovery and tool execution
- Agent Card or framework adapter integration
- Model invocation and real evaluation scoring
- Real Guardrail enforcement
- PostgreSQL persistence
- Redis or server sessions
- OAuth, Secret resolution, or credential storage
- Runtime, sandbox, terminal, Trace, or deployment integration
- Cross-tab or cross-device continuation
- Production-grade authorization

## Success Criteria

- The complete lifecycle is clickable without refreshing.
- Agent Wizard surfaces remain technical while Admin and End User surfaces remain business-oriented.
- Session-created data survives persona and route changes in one tab.
- Session-created data disappears on refresh.
- Concurrent deployed users do not share demo state.
- Guardrail creation produces a selectable versioned Eval Template.
- Technical Validation and Business Eval are separate, sequential stages.
- Existing Agent revisions can be cloned, changed, re-evaluated, and approved.
- Published revisions enter Agent Garden.
- Instances can be created and stopped without a real backend mutation.
- Monitor reflects the complete session workflow.
