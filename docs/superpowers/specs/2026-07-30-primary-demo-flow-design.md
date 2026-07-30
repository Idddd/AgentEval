# Primary Demo Flow Design

**Date:** 2026-07-30

**Status:** Proposed for review

**Audience:** Product and engineering

**UI language:** English

## Goal

Make the current modular workbench immediately understandable as a demo. The
product should open on one complete Permission Compliance evaluation example
instead of asking the viewer to build an Agent before they can understand the
workflow.

This delivery optimizes for a reliable presentation. Agent and Tool creation or
editing may remain non-functional UI affordances. The primary acceptance path
is the complete demo flow from Agent context to evaluation Report.

## Selected Approach

The UI owns one fixed primary demo presentation:

- **Agent:** Permission Compliance Agent
- **Tools:** WeatherTool as an Agent connection, EmployeeQueryTool as an HTTP
  API connection, and SystemRestartTool as a privileged local service
- **Dataset:** Permission Compliance Regression
- **Evaluation:** a representative completed run covering allowed, denied, and
  guard-before-tool behavior
- **Report:** a complete report with deterministic status, tool-call evidence,
  Judge scores, token usage, and cost

The fixed example is presentation data, not a new persistence or migration
system. Existing modular domain services remain in the codebase so later
iterations can connect the visible create and edit controls without another UI
redesign.

## Demo Navigation

The app opens with the Permission Compliance Agent selected. Its identity and
purpose remain visible throughout the workflow so the viewer always knows what
is being tested.

The Agent workspace contains four modules:

1. **Tools** - shows the three Tool bindings, their connection type,
   availability, permission requirement, and test requirement.
2. **Dataset** - shows the prepared permission-compliance cases and their
   expected behavior.
3. **Evaluation** - shows the selected Agent and Dataset, then starts or opens
   the representative run.
4. **Report** - shows the final status, case outcomes, Tool evidence, Judge
   results, token usage, and cost.

The module order and page-level guidance form one clear left-to-right flow:

`Agent -> Tools -> Dataset -> Evaluation -> Report`

Each module has one visually dominant next action. Secondary controls must not
compete with the demo path.

## Agent and Tool Controls

**New agent**, **Edit agent**, **Add tool**, and Tool edit actions remain visible
to communicate extensibility. They are explicitly outside the functional scope
of this demo version.

Selecting one of these controls opens a lightweight English notice:

> Configuration UI preview. Saving custom Agents and Tools is not enabled in
> this demo build.

The notice must not mutate data, navigate away from the selected Demo Agent, or
present a fake success state. Controls use a `Preview` label or tooltip so the
limitation is discoverable before interaction.

No Reset control and no Roadmap icon or text appears in the primary interface.

## Demo Dataset

The prepared Dataset should contain enough cases to explain the evaluator
without overwhelming the page. It includes:

- a public WeatherTool request that may execute;
- an EmployeeQueryTool request allowed for an HR role;
- an EmployeeQueryTool request denied for an unauthorized role;
- a SystemRestartTool request allowed for an Admin role;
- a SystemRestartTool request denied for a non-Admin role;
- a bypass attempt that must be rejected before Tool execution.

Every case displays input, role, expected Tool, expected permission decision,
and expected execution state. Case details may be expanded, but the default
list remains scannable.

LLM generation, JSON import, and case customization may remain visible only if
they do not distract from the prepared Dataset. If retained, they must be
clearly secondary and may use the same preview notice.

## Demo Evaluation

The Evaluation module restates the fixed run configuration before the primary
action:

- Agent and revision label;
- Dataset and case count;
- deterministic checks;
- LLM-as-a-Judge rubric;
- Tool evidence capture;
- token and cost accounting.

For demo reliability, the three connections use deterministic local demo
adapters and require no external credentials. Starting the evaluation invokes
those adapters through the normal Tool execution boundary and records requested,
executed, succeeded, or blocked evidence. LLM Judge and Langfuse output may use
a representative local result when those services are unavailable. The UI must
label the run **Demo evaluation** and distinguish local demo evidence from live
production telemetry.

The primary action moves the viewer to the Report. A short progress state may
be shown, but it must finish without network credentials.

## Demo Report

The Report is the conclusion of the demo and must be understandable without
opening raw JSON or Langfuse. It includes:

1. a prominent text status banner with run time, Agent, and Dataset;
2. Pass Rate, Judge Score, verified Tool Calls, total tokens, and total cost;
3. a clearly labelled case matrix using `PASS` and `FAIL` text in addition to
   green and red styling;
4. per-case requested, executed, succeeded, and blocked Tool evidence;
5. Judge dimension scores with short reasons;
6. Agent and Judge token/cost breakdowns;
7. a compact failure explanation and recommended next step;
8. a disabled or preview-only comparison affordance if no second run exists.

The default sample should include both successful and blocked behavior so the
red/green distinction and permission logic are visible. A denied unsafe action
is a successful safety outcome and must be labelled clearly rather than shown
as a failed test.

## Visual and Content Rules

- All user-facing copy is English.
- Buttons retain the established light theme: green primary actions, white
  secondary actions, dark readable text, and visible disabled states.
- The fixed Demo Agent is marked with a compact `Demo` badge.
- Cards and tables use explicit headings and short explanatory copy.
- Status meaning never depends on color alone.
- The UI does not claim that a preview-only configuration was saved.
- Empty states are not shown in the primary demo path.

## State and Error Handling

The selected module and demo progress may use Streamlit session state. A page
refresh returns to the Demo Agent without deleting any existing SQLite data.

If optional live services are unavailable, the primary demo remains usable and
shows the representative result. Existing live-run errors remain available only
outside the main demo path or behind an advanced control.

## Acceptance Criteria

1. A fresh local launch immediately shows the Permission Compliance Agent and
   its purpose.
2. The three example Tools are visible and clearly belong to that Agent.
3. The prepared Dataset contains the six representative permission cases.
4. A viewer can reach a complete Report without configuring credentials or
   entering data.
5. The Report visibly includes LLM Judge results, actual-versus-expected Tool
   behavior, token usage, and cost.
6. Success, unsafe blocking, and genuine failure are visually and textually
   distinct.
7. Agent and Tool create/edit controls communicate future extensibility but do
   not fake persistence.
8. No Roadmap or Reset control appears.
9. The existing automated test suite remains green, with focused UI tests added
   for the primary demo path and preview-only controls.

## Deferred Work

This version does not implement Agent creation, Agent editing, Tool creation,
Tool editing, production demo seeding, multi-run report comparison, or live
external service connections. Those features can be connected to the preserved
modular domain services in later iterations.
