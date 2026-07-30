# Tasks 8–9 Delivery Report

## Status

Complete. The workbench can now execute immutable Agent/Dataset revision pairs,
persist every case result before terminalizing the run, create versioned
structured reports, retain report history, and compare reports using only
shared stable case IDs.

## Commits

- `0490b0e feat: persist immutable evaluation runs`
- `99d5ab3 feat: add durable reports and run comparison`

## Task 8: Immutable Evaluation Runs

- Added the `AgentAdapter` protocol, frozen `AgentAdapterResult`, and
  `PermissionAgentAdapter` boundary around the existing `TargetAgent`.
- Normalized workbench case inputs into the current Agent call, retained typed
  tool evidence, fetched the flushed normalized trace, and extracted Agent
  generation token/cost observations.
- Added `EvalRunner.run_revision(agent_revision_id, dataset_revision_id,
  progress=None)` while preserving the deprecated six-argument CLI runner.
- Loaded immutable Agent/Dataset revisions before creating a run, evaluated
  cases in published Dataset order, and persisted each `CaseResult`
  immediately.
- Enforced case quality precedence: required deterministic failures remain
  `FAIL` even when Judge data is unavailable; Judge-only incompleteness is
  `INCOMPLETE`; Judge gate failures are `FAIL`; otherwise cases are `PASS`.
- Terminalized runs as `COMPLETED`, `PARTIAL`, or `FAILED` without rewriting
  terminal artifacts. A completed run may still contain quality failures.

## Task 9: Structured Reports and Comparison

- Added pure report quality status derivation with textual `PASS`,
  `NEEDS ATTENTION`, and `INCOMPLETE` precedence while retaining textual
  per-case `PASS`, `FAIL`, and `INCOMPLETE` values.
- Added JSON-serializable report summaries with the required top-level keys:
  identity, status, metrics, Judge dimensions, tool funnel, costs, tokens,
  cases, and failures.
- Kept Agent/Judge evaluation cost separate from Dataset-generation cost and
  retained category-specific token totals.
- Rendered Markdown solely from the immutable summary and saved reports through
  repository history, producing incrementing artifact versions and distinct
  files.
- Added revision-aware comparison over stable shared case IDs, with coverage
  changes, shared-case pass-rate delta, Judge/tool/cost/token deltas, failure
  transitions, Agent config changes, and Dataset revision detection.

## Verification

- Focused combined suite:
  `python -m pytest tests/test_eval_run_persistence.py tests/test_code_evaluator.py tests/test_report_service.py tests/test_report_compare.py tests/test_report_generator.py -v`
  — 25 passed.
- Full suite:
  `python -m pytest -q --basetemp=.pytest_tmp_modular_t89_full`
  — 96 passed in 5.76s.
- Full-suite warning: one pre-existing `PytestCollectionWarning` because the
  frozen workbench model named `TestCase` is imported into a test module; no
  test failures resulted.
- `git diff --check` reported no whitespace errors in the owned Task 8–9 files.

## Self-review and Concerns

- Deterministic gating always requires `permission_compliance` and
  `execution_correctness`; a case may declare additional required score names
  through `expected_output.required_deterministic_scores`.
- The report filename version is selected from repository history before the
  repository assigns its artifact version. This is intentionally sufficient
  for the demo's single-process workflow; production multi-writer report
  scheduling would need atomic filename/version allocation.
- Concurrent UI and packaging work left unrelated working-tree changes. Those
  files were not staged or modified by Tasks 8–9.
