# Tasks 4–5: Observability and Tool Runtime Report

## Delivered

- Added typed observations to the common tracing protocol, local JSON backend, and Langfuse v3 mapping. Local traces now use an `agent_root` observation and preserve observation type, level/status, model, usage, and cost fields.
- Added a small adapter registry/executor that redacts sensitive fields, records tool observations, returns `ToolResult` plus immutable `ToolEvidence`, and captures adapter failures.
- Routed `TargetAgent` through the executor with a legacy `python` mock-tool adapter and returned `tool_evidence` in its result.
- Extended deterministic evaluation with `tool_requested`, `tool_executed`, `tool_succeeded`, and `effect_verified`; read-only effects report `NOT_REQUIRED`.

## TDD evidence

1. Task 4 RED: `tests/test_local_backend.py::test_typed_tool_and_generation_roundtrip` failed because `LocalTracer.observation` was absent; `tests/test_langfuse_mapping.py` failed because `SpanRecord` lacked typed fields.
2. Task 4 GREEN: the backend-focused command passed 5 tests.
3. Task 5 RED: `tests/test_tool_runtime.py` failed during collection because `src.tool_runtime` was missing. The agent-route test subsequently failed with missing `tool_evidence`.
4. Task 5 GREEN: runtime/evaluator tests passed after the minimal adapter/runtime, evaluator, and agent integration.

## Verification commands and output

- `C:\Users\95602\IdeaProjects\AgentEval\.venv\Scripts\python.exe -m pytest tests\test_local_backend.py tests\test_langfuse_mapping.py tests\test_tool_runtime.py tests\test_code_evaluator.py -v --basetemp=.pytest_tmp_modular` — 21 passed.
- `C:\Users\95602\IdeaProjects\AgentEval\.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_modular` — 71 passed, 2 pre-existing Pytest collection warnings for dataclass `TestCase` names.
- `git diff --check` — clean (only line-ending advisory warnings from Git).

## Files

- `src/models.py`
- `src/backends/base.py`
- `src/backends/local_backend.py`
- `src/backends/langfuse_backend.py`
- `src/tool_runtime.py`
- `src/agent.py`
- `src/code_evaluator.py`
- `tests/test_local_backend.py`
- `tests/test_langfuse_mapping.py`
- `tests/test_tool_runtime.py`
- `tests/test_code_evaluator.py`

## Commit

- `b18c37c feat: add typed observations and tool evidence`

## Concerns

- The Langfuse behavior is covered with normalized fake SDK records; no live Langfuse credentials were used.
- The full suite passes with two existing `PytestCollectionWarning` warnings unrelated to this bundle.
