# Report List, Detail, and Reflect Design

## Goal

Refactor Report into the same list-first navigation pattern as Target and Dataset, then add a structured Reflect analysis that turns accepted improvement suggestions into a new immutable Target Revision.

## Views and navigation

Report has three mutually exclusive views: `list`, `detail`, and `analysis`.

- Entering Report opens `list` unless another module intentionally requested a specific Report.
- List View selects a Report and opens `detail`.
- Detail Back returns to `list`.
- Detail Reflect opens `analysis` for the selected Report.
- Analysis Back returns to `detail`.
- Successful Submit creates a Target Revision and navigates to that Target detail.

## Report list

The page title is `Report`. A native table renders one immutable Report per row with Created, Target revision, Dataset, Dataset revision, Status, Pass rate, Evaluation cost, and View columns. View is a tertiary linked-text row action in the final column. The list contains only Reports for the selected Target context.

The empty state is concise and explains that Evaluation creates Reports. It does not render a placeholder card.

## Report detail

Detail retains the existing result-first Report content, comparison, evidence, Judge, and cost data. Navigation is redesigned:

- a compact `Reports` back action appears at the upper left;
- the Report identity and immutable revision context are shown compactly;
- a small content-width `Reflect` primary action is aligned at the upper right of the detail header.

The existing Report selector is removed. Comparison retains its baseline selector because baseline selection is local to detail.

## Reflect analysis

Reflect consumes a standard analyzer interface:

`reflect(report, target_revision) -> tuple[ReflectionSuggestion, ...]`

The initial analyzer is deterministic and rule-based. A future LLM implementation can replace it without changing the UI or submission service. Each suggestion contains a stable ID, Area, Evidence, Current value, Suggested value, and a structured config patch.

Initial rules may suggest:

- Prompt changes when cases fail or Judge dimensions are weak;
- deterministic Model parameters when quality is unstable;
- policy flags when Tool Evidence contains failures.

Only keys explicitly supported by the analyzer may be patched. Suggestions never modify Tool bindings, Model identity, MCP selection, or KB selection in the initial implementation.

Analysis renders:

- selected Report and Target Revision context;
- a concise failure summary;
- one native editable suggestion table with `Agree`, Area, Evidence, Current, and Suggested columns;
- a compact Target Revision preview showing the next revision number and accepted changes;
- a content-width `Submit` primary button.

Agree is a checkbox per suggestion. Submit is disabled when no suggestions are accepted.

## Submission

Submit reloads the selected Report, its Run, and the exact Target Revision used by that Run. It rejects stale or mismatched context rather than applying suggestions to a different Target.

Accepted patches are applied to a copy of that immutable Revision's `config_snapshot`. Unselected suggestions do not change configuration. Existing Tool bindings are preserved. `AgentRegistry.revise()` creates a new immutable Target Revision; no existing Revision is mutated.

After success, the selected Target remains active, `target_view` becomes `detail`, and global navigation moves to Target. The new Revision is visible in Target detail and can be evaluated again.

## Errors and empty states

- A missing Report or Run returns safely to Report list with an error.
- A Report with no actionable findings shows `No Target changes suggested` and disables Submit.
- Analyzer failures show a concise error and do not expose a partial patch.
- Submission errors preserve accepted choices for retry.

## Testing

Tests cover list row shape, View routing, detail Back and Reflect actions, deterministic suggestion generation, accepted-only patch application, disabled empty submission, preservation of Tool bindings, new immutable Revision creation, stale context rejection, successful Target-detail navigation, legacy Report rendering, and the full existing suite.
