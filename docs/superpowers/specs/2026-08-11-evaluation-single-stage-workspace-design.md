# Evaluation Single-Stage Workspace Design

## Goal

Reduce the Evaluation catalog drawer to the shortest usable path. A user must be able to identify the current stage and complete its required action without opening detailed information.

This is a presentation-layer change. Existing Dataset, run, report, approval, role, and Guardrail rules remain authoritative.

## Default Layout

The drawer contains three visible areas:

1. A compact header with target kind, target name, and lifecycle status.
2. One horizontal workflow row: **Test coverage → Evaluation → Result**.
3. One current-stage panel containing only the information and controls required to continue.

`Revision` is not a workflow stage. Revision number, configuration summary, Target ID, history, and other metadata move to the global **Details** area. They are also removed from the compact header.

The four always-visible workspace sections are removed from the default view. The existing sticky action bar is removed so the primary action appears only once, inside the current-stage panel.

## Workflow Row

The three workflow nodes fit on one row at the current drawer width. Each node shows only:

- stage name;
- compact state such as `Ready`, `Current`, `Running`, `Findings`, or `Waiting`;
- a status icon and connecting line.

The current stage receives the strongest emphasis. Completed and future stages remain readable but do not expose controls. Clicking a node does not change the current business stage; it opens the matching group inside **Details** for inspection.

A missing or rejected Target revision is treated as a blocker within **Test coverage**, not as a fourth workflow stage. The current-stage panel explains the blocker and exposes the existing target-source action.

## Current-Stage Panel

The panel title states the next outcome, followed by at most one short explanation and the minimum controls needed to proceed.

### Test coverage

- Show the Dataset selector.
- Show **Generate Dataset** as the primary action when generation is required.
- Reuse the current Dataset creation fallback when no Dataset exists.
- Use the existing default Guardrail packs without showing the full picker.
- If no required Guardrail pack is selected, show the picker because it is blocking progress.
- If the Target revision is missing or rejected, replace Dataset controls with the existing review/update/source action until the blocker is resolved.

### Evaluation

- Before a run, show **Run evaluation**.
- After failure, show **Retry evaluation** and one concise failure message.
- During a run, show a compact progress bar and no log output.
- When a run finishes, advance the current stage to Result automatically.

### Result

- Show only Summary and Reason.
- For an Admin pending decision, show the existing **Approve** or **Reject** action selected by the current recommendation logic.
- For completed decisions, show the decision state and the existing next action.
- For non-Admin Guardrail users, keep the result read-only and retain the current Admin-only restriction.

The current `footerStep`, `footerAction`, role checks, decision logic, and run creation logic remain the source of truth. The new panel maps those decisions to one visible action instead of duplicating them across sections and the footer.

## Details

A single **Details** button appears in the drawer header. Details are closed whenever a target is opened.

Opening Details reveals one secondary panel below the current-stage panel with four collapsible groups:

1. **Target** — revision, configuration, Target ID, source information, and report history.
2. **Test coverage** — Dataset cases, schema, generation history, selected Guardrail packs, and combined coverage.
3. **Evaluation** — progress, per-case status, logs, traces, failure recovery context, and run metadata.
4. **Result** — full report, case results, findings, reasons, decision record, and audit information.

The groups reuse existing detail components wherever possible. Details are primarily informational; the action needed to advance the workflow must always remain available in the current-stage panel.

Clicking a workflow node opens Details and focuses its matching group. Closing Details returns focus to the Details button without changing the current workflow stage.

## State and Error Behavior

- Validation failures appear inline in the current-stage panel and keep the relevant action visible.
- Running, failed, stale, pending-decision, rejected, and Admin-only states retain their existing business behavior.
- A stale result makes Evaluation current and exposes **Run evaluation again** when the role permits it.
- Non-Admin users never receive Guardrail run, retry, approval, or rejection controls.
- Closing and reopening the drawer resets Details to closed but does not reset Dataset, Guardrail-pack, run, or approval state.

## Implementation Boundaries

The primary change belongs in `catalog-page.tsx`:

- replace the four-node, two-column lifecycle grid with a three-node horizontal workflow;
- replace the four default `WorkspaceSection` instances and sticky action bar with one state-driven current-stage panel;
- add one global Details toggle and conditionally render the existing full-detail components;
- preserve store mutations and state-selection helpers.

No backend, persistence, route, seed-data, or evaluation algorithm changes are included. No unrelated component refactor is included.

## Focused Verification

Update the Catalog component tests to verify:

- the workflow has exactly Test coverage, Evaluation, and Result in one semantic group;
- Revision is absent from the default header and workflow;
- only one current-stage panel is visible;
- Dataset selection/generation, run/retry, result review, and Admin decisions work with Details closed;
- Details is closed by default and exposes all four complete information groups when opened;
- workflow-node clicks open the correct Details group;
- Guardrail evaluation controls remain unavailable to non-Admin roles;
- stale, failed, pending, approved, and rejected states retain their next actions.

Run only the Catalog test file and the Control app TypeScript check, followed by one browser smoke flow from Test coverage through Result. Do not run the full repository test suite.

## Out of Scope

- changing evaluation state transitions or approval policy;
- changing Dataset generation behavior;
- adding new Guardrail CRUD or permissions;
- redesigning the Evaluation catalog list;
- adding animations or responsive variants beyond keeping the three workflow nodes on one row.
