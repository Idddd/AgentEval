# Modular Agent Evaluation Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local modular Agent evaluation workbench with Agent-owned tools and datasets, immutable runs and reports, Langfuse-backed tool/cost evidence, fixed LLM-as-a-Judge scoring, and historical report comparison.

**Architecture:** SQLite is the durable product store for Agent, Dataset, Run, Case Result, and Report snapshots. Langfuse remains the observability store for typed Agent, Generation, Guardrail, Tool, and Evaluator observations; SQLite rows link to Langfuse IDs. Streamlit becomes a thin English UI over focused services instead of owning evaluation state in one monolithic file.

**Tech Stack:** Python 3, standard-library `sqlite3`, dataclasses, Streamlit 1.60-compatible APIs, Langfuse Python SDK `>=3.3.1,<4.0`, Anthropic/OpenAI clients, Pandas, Plotly, Pytest, Docker Compose.

## Global Constraints

- The first release is local and single-user; do not add authentication, teams, PostgreSQL, or production traffic monitors.
- All user-facing copy is English.
- No fixed Agent identities or fixed three-Tool assumptions may appear in domain or UI code.
- Every Tool, Dataset, Run, and Report belongs to one Agent Profile.
- Agent Revisions, Dataset Revisions, completed Eval Runs, and recorded cost snapshots are immutable.
- Secret values are never persisted; store only environment-variable names or secret references.
- Deterministic evaluator failures override LLM Judge scores.
- The fixed Judge rubric is Correctness, Relevance, Completeness, and Safety, each scored 1–5; pass requires average `>= 4.0` and Safety `>= 4`.
- Tool evidence is Requested → Executed → Succeeded → Effect verified; effect verification is `NOT REQUIRED` for read-only Tools.
- Evaluation Total is Agent Run Cost plus Judge Cost. Dataset Generation Cost is shown separately.
- Status must always include text (`PASS`, `FAIL`, `INCOMPLETE`, `NEEDS ATTENTION`); color alone never carries meaning.
- The formal UI has no `Reset Demo` control and no Roadmap icons or text.
- Preserve unrelated working-tree changes, including `langfuse/docker-compose.yml` and `.claude/`.
- Run tests with `.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_modular` on Windows.

## Delivery Milestones

1. **Domain and Persistence:** Tasks 1–3 produce Agent-owned, versioned records in SQLite without changing the running evaluator.
2. **Observability and Evaluation:** Tasks 4–8 produce typed Tool evidence, token/cost snapshots, fixed Judge scores, and immutable Eval Runs.
3. **Reports and Comparison:** Task 9 produces durable structured reports and revision-aware comparisons.
4. **Modular UI and Migration:** Tasks 10–12 replace the monolithic UI, migrate the current demo safely, and verify the complete local stack.

---

### Task 1: Product Domain Types and Repository Contract

**Files:**
- Create: `src/workbench_models.py`
- Create: `src/workbench_repository.py`
- Create: `tests/test_workbench_models.py`

**Interfaces:**
- Consumes: only Python standard-library types.
- Produces: `AgentProfile`, `ToolBinding`, `AgentRevision`, `TestCase`, `DatasetRevision`, `UsageCost`, `ToolEvidence`, `JudgeResult`, `CaseResult`, `EvalRun`, `ReportSnapshot`, `RunStatus`, and `WorkbenchRepository`.

- [ ] **Step 1: Write failing model-invariant tests**

```python
from dataclasses import FrozenInstanceError

import pytest

from src.workbench_models import (
    AgentRevision, JudgeResult, RunStatus, ToolBinding, ToolEvidence, UsageCost,
)


def test_agent_revision_and_tool_binding_are_immutable():
    tool = ToolBinding(
        tool_id="weather", name="Weather", description="Forecast lookup",
        connection_type="http", adapter_config={"url": "http://service/weather"},
        input_schema={"type": "object"}, output_schema={"type": "object"},
        permission={}, test_requirements=("Handle timeout",),
        verification_required=False, enabled=True,
    )
    revision = AgentRevision(
        revision_id="ar_1", agent_id="agent_1", revision=1,
        config_snapshot={"model": "deepseek-v4-flash"}, tools=(tool,),
        created_at="2026-07-30T00:00:00+00:00",
    )
    with pytest.raises(FrozenInstanceError):
        revision.revision = 2


def test_judge_pass_gate_and_cost_total_are_deterministic():
    judge = JudgeResult(
        scores={"correctness": 4, "relevance": 5, "completeness": 4, "safety": 4},
        reasons={"correctness": "Accurate", "relevance": "Direct",
                 "completeness": "Complete", "safety": "Safe"},
        summary="Good response", model="judge-model", prompt_version="judge-v1",
        trace_id="trace_judge", observation_id="obs_judge",
    )
    costs = [
        UsageCost("agent", "agent-model", 100, 20, 0, 0, 0.01),
        UsageCost("judge", "judge-model", 80, 10, 0, 0, 0.005),
        UsageCost("dataset", "judge-model", 50, 5, 0, 0, 0.002),
    ]
    assert judge.passed is True
    assert UsageCost.evaluation_total(costs) == pytest.approx(0.015)


def test_read_only_tool_evidence_does_not_require_effect_receipt():
    evidence = ToolEvidence(
        call_id="call_1", tool_id="weather", requested=True, executed=True,
        succeeded=True, effect_verified=None, verification_required=False,
        requested_arguments={"city": "Paris"}, executed_arguments={"city": "Paris"},
        output={"temperature": 21}, error=None, trace_id="t1",
        observation_id="o1", started_at="s", ended_at="e", latency_ms=12.0,
        receipt=None,
    )
    assert evidence.passed is True
    assert evidence.effect_status == "NOT REQUIRED"
    assert RunStatus.COMPLETED.value == "COMPLETED"
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```powershell
.venv\Scripts\python.exe -m pytest tests\test_workbench_models.py -v --basetemp=.pytest_tmp_modular
```

Expected: collection fails with `ModuleNotFoundError: No module named 'src.workbench_models'`.

- [ ] **Step 3: Implement immutable domain types**

Create `src/workbench_models.py` with these exact public fields and properties:

```python
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class RunStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"


@dataclass(frozen=True)
class AgentProfile:
    agent_id: str
    name: str
    description: str
    current_revision: int
    created_at: str


@dataclass(frozen=True)
class ToolBinding:
    tool_id: str
    name: str
    description: str
    connection_type: str
    adapter_config: dict[str, Any]
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    permission: dict[str, Any]
    test_requirements: tuple[str, ...]
    verification_required: bool
    enabled: bool


@dataclass(frozen=True)
class AgentRevision:
    revision_id: str
    agent_id: str
    revision: int
    config_snapshot: dict[str, Any]
    tools: tuple[ToolBinding, ...]
    created_at: str


@dataclass(frozen=True)
class TestCase:
    case_id: str
    input: dict[str, Any]
    expected_output: dict[str, Any]
    reference_answer: str | None = None
    tags: tuple[str, ...] = ()
    source: str = "manual"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DatasetRevision:
    revision_id: str
    dataset_id: str
    agent_id: str
    name: str
    revision: int
    cases: tuple[TestCase, ...]
    created_at: str
    generation_costs: tuple["UsageCost", ...] = ()


@dataclass(frozen=True)
class UsageCost:
    category: str
    model: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    reasoning_tokens: int
    cost_usd: float

    @staticmethod
    def evaluation_total(items: list["UsageCost"] | tuple["UsageCost", ...]) -> float:
        return sum(item.cost_usd for item in items if item.category in {"agent", "judge"})


@dataclass(frozen=True)
class ToolEvidence:
    call_id: str
    tool_id: str
    requested: bool
    executed: bool
    succeeded: bool
    effect_verified: bool | None
    verification_required: bool
    requested_arguments: dict[str, Any]
    executed_arguments: dict[str, Any] | None
    output: dict[str, Any] | None
    error: str | None
    trace_id: str
    observation_id: str | None
    started_at: str | None
    ended_at: str | None
    latency_ms: float | None
    receipt: dict[str, Any] | None

    @property
    def effect_status(self) -> str:
        if not self.verification_required:
            return "NOT REQUIRED"
        return "VERIFIED" if self.effect_verified else "UNVERIFIED"

    @property
    def passed(self) -> bool:
        return self.requested and self.executed and self.succeeded and (
            not self.verification_required or self.effect_verified is True
        )


@dataclass(frozen=True)
class JudgeResult:
    scores: dict[str, int]
    reasons: dict[str, str]
    summary: str
    model: str
    prompt_version: str
    trace_id: str
    observation_id: str | None
    usage_cost: UsageCost | None = None

    @property
    def average(self) -> float:
        return sum(self.scores.values()) / len(self.scores) if self.scores else 0.0

    @property
    def passed(self) -> bool:
        return self.average >= 4.0 and self.scores.get("safety", 0) >= 4


@dataclass(frozen=True)
class CaseResult:
    case_id: str
    trace_id: str
    response: str
    deterministic_scores: dict[str, float]
    deterministic_reasons: dict[str, str]
    tool_evidence: tuple[ToolEvidence, ...]
    judge: JudgeResult | None
    usage_costs: tuple[UsageCost, ...]
    status: str


@dataclass(frozen=True)
class EvalRun:
    run_id: str
    agent_id: str
    agent_revision_id: str
    dataset_revision_id: str
    status: RunStatus
    started_at: str
    completed_at: str | None
    evaluator_version: str
    case_results: tuple[CaseResult, ...] = ()


@dataclass(frozen=True)
class ReportSnapshot:
    report_id: str
    run_id: str
    artifact_version: int
    status: str
    summary: dict[str, Any]
    markdown_path: str
    created_at: str
```

- [ ] **Step 4: Add the repository protocol**

Create `src/workbench_repository.py`:

```python
from pathlib import Path
from typing import Protocol

from .workbench_models import (
    AgentProfile, AgentRevision, CaseResult, DatasetRevision, EvalRun,
    ReportSnapshot, RunStatus, TestCase, ToolBinding, UsageCost,
)


class WorkbenchRepository(Protocol):
    def create_agent(self, name: str, description: str) -> AgentProfile: ...
    def list_agents(self) -> list[AgentProfile]: ...
    def get_agent(self, agent_id: str) -> AgentProfile: ...
    def create_agent_revision(self, agent_id: str, config_snapshot: dict,
                              tools: tuple[ToolBinding, ...]) -> AgentRevision: ...
    def get_agent_revision(self, revision_id: str) -> AgentRevision: ...
    def create_dataset(self, agent_id: str, name: str) -> str: ...
    def replace_draft_cases(self, dataset_id: str, cases: list[TestCase]) -> None: ...
    def list_draft_cases(self, dataset_id: str) -> list[TestCase]: ...
    def add_dataset_generation_cost(self, dataset_id: str, cost: UsageCost) -> None: ...
    def publish_dataset(self, dataset_id: str) -> DatasetRevision: ...
    def get_dataset_revision(self, revision_id: str) -> DatasetRevision: ...
    def create_run(self, agent_revision_id: str,
                   dataset_revision_id: str) -> EvalRun: ...
    def save_case_result(self, run_id: str, result: CaseResult) -> None: ...
    def finish_run(self, run_id: str, status: RunStatus) -> EvalRun: ...
    def get_run(self, run_id: str) -> EvalRun: ...
    def list_runs(self, agent_id: str) -> list[EvalRun]: ...
    def save_report(self, run_id: str, status: str, summary: dict,
                    markdown_path: Path) -> ReportSnapshot: ...
    def get_report(self, report_id: str) -> ReportSnapshot: ...
    def list_reports(self, agent_id: str) -> list[ReportSnapshot]: ...
```

- [ ] **Step 5: Run the model tests**

Run the Step 2 command. Expected: `3 passed`.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src\workbench_models.py src\workbench_repository.py tests\test_workbench_models.py
git commit -m "feat: add modular workbench domain model"
```

---

### Task 2: SQLite Schema and Durable Repository

**Files:**
- Create: `src/sqlite_workbench.py`
- Create: `tests/test_sqlite_workbench.py`
- Modify: `src/settings.py`

**Interfaces:**
- Consumes: all Task 1 models and `WorkbenchRepository` signatures.
- Produces: `SQLiteWorkbenchRepository(db_path: Path)` with public read-only
  `db_path: Path` and schema version 1.

- [ ] **Step 1: Write failing repository lifecycle tests**

```python
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import TestCase, ToolBinding


def tool(name="Lookup"):
    return ToolBinding("lookup", name, "Lookup data", "python", {"callable": "lookup"},
                       {"type": "object"}, {"type": "object"}, {},
                       ("Return a result",), False, True)


def test_agent_revision_and_dataset_revision_survive_restart(tmp_path):
    db = tmp_path / "workbench.db"
    repo = SQLiteWorkbenchRepository(db)
    agent = repo.create_agent("Agent A", "General agent")
    revision = repo.create_agent_revision(agent.agent_id, {"model": "m1"}, (tool(),))
    dataset_id = repo.create_dataset(agent.agent_id, "Regression")
    repo.replace_draft_cases(dataset_id, [
        TestCase("case-1", {"query": "look up A"}, {"expected_tool_called": "lookup"})
    ])
    dataset_revision = repo.publish_dataset(dataset_id)

    reopened = SQLiteWorkbenchRepository(db)
    assert reopened.get_agent(agent.agent_id).current_revision == 1
    assert reopened.get_agent_revision(revision.revision_id).tools[0].tool_id == "lookup"
    assert reopened.get_dataset_revision(dataset_revision.revision_id).cases[0].case_id == "case-1"


def test_agent_ownership_is_enforced(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    first = repo.create_agent("First", "")
    second = repo.create_agent("Second", "")
    revision = repo.create_agent_revision(first.agent_id, {}, (tool(),))
    dataset_id = repo.create_dataset(second.agent_id, "Other dataset")
    dataset_revision = repo.publish_dataset(dataset_id)
    try:
        repo.create_run(revision.revision_id, dataset_revision.revision_id)
    except ValueError as error:
        assert str(error) == "agent revision and dataset revision belong to different agents"
    else:
        raise AssertionError("cross-agent run must be rejected")
```

- [ ] **Step 2: Verify the repository tests fail**

Run:

```powershell
.venv\Scripts\python.exe -m pytest tests\test_sqlite_workbench.py -v --basetemp=.pytest_tmp_modular
```

Expected: collection fails because `src.sqlite_workbench` does not exist.

- [ ] **Step 3: Add the database path setting**

Add this field to `Settings` and pass it from `load_settings()`:

```python
workbench_db: Path = field(default_factory=lambda: PROJECT_ROOT / "data" / "workbench.db")
```

```python
workbench_db=Path(os.getenv("WORKBENCH_DB", str(PROJECT_ROOT / "data" / "workbench.db"))),
```

- [ ] **Step 4: Implement schema version 1 and transaction handling**

Create `src/sqlite_workbench.py` with a `SCHEMA_V1` script containing these
tables and foreign keys:

```sql
CREATE TABLE IF NOT EXISTS agents (
  agent_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
  current_revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_revisions (
  revision_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(agent_id),
  revision INTEGER NOT NULL, config_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(agent_id, revision)
);
CREATE TABLE IF NOT EXISTS agent_revision_tools (
  revision_id TEXT NOT NULL REFERENCES agent_revisions(revision_id),
  tool_id TEXT NOT NULL, tool_json TEXT NOT NULL,
  PRIMARY KEY(revision_id, tool_id)
);
CREATE TABLE IF NOT EXISTS datasets (
  dataset_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(agent_id),
  name TEXT NOT NULL, current_revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dataset_draft_cases (
  dataset_id TEXT NOT NULL REFERENCES datasets(dataset_id), case_id TEXT NOT NULL,
  position INTEGER NOT NULL, case_json TEXT NOT NULL,
  PRIMARY KEY(dataset_id, case_id)
);
CREATE TABLE IF NOT EXISTS dataset_draft_usage_costs (
  dataset_id TEXT NOT NULL REFERENCES datasets(dataset_id), event_id TEXT NOT NULL,
  usage_json TEXT NOT NULL, PRIMARY KEY(dataset_id, event_id)
);
CREATE TABLE IF NOT EXISTS dataset_revisions (
  revision_id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL REFERENCES datasets(dataset_id),
  agent_id TEXT NOT NULL REFERENCES agents(agent_id), revision INTEGER NOT NULL,
  generation_costs_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(dataset_id, revision)
);
CREATE TABLE IF NOT EXISTS dataset_revision_cases (
  revision_id TEXT NOT NULL REFERENCES dataset_revisions(revision_id),
  case_id TEXT NOT NULL, position INTEGER NOT NULL, case_json TEXT NOT NULL,
  PRIMARY KEY(revision_id, case_id)
);
CREATE TABLE IF NOT EXISTS eval_runs (
  run_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(agent_id),
  agent_revision_id TEXT NOT NULL REFERENCES agent_revisions(revision_id),
  dataset_revision_id TEXT NOT NULL REFERENCES dataset_revisions(revision_id),
  status TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT,
  evaluator_version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS case_results (
  run_id TEXT NOT NULL REFERENCES eval_runs(run_id), case_id TEXT NOT NULL,
  result_json TEXT NOT NULL, PRIMARY KEY(run_id, case_id)
);
CREATE TABLE IF NOT EXISTS tool_evidence (
  run_id TEXT NOT NULL, case_id TEXT NOT NULL, call_id TEXT NOT NULL,
  evidence_json TEXT NOT NULL, PRIMARY KEY(run_id, case_id, call_id)
);
CREATE TABLE IF NOT EXISTS judge_scores (
  run_id TEXT NOT NULL, case_id TEXT NOT NULL, dimension TEXT NOT NULL,
  score INTEGER NOT NULL, reason TEXT NOT NULL,
  PRIMARY KEY(run_id, case_id, dimension)
);
CREATE TABLE IF NOT EXISTS usage_costs (
  run_id TEXT NOT NULL, case_id TEXT NOT NULL, category TEXT NOT NULL,
  model TEXT NOT NULL, usage_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  report_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES eval_runs(run_id),
  artifact_version INTEGER NOT NULL, status TEXT NOT NULL,
  summary_json TEXT NOT NULL, markdown_path TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(run_id, artifact_version)
);
PRAGMA user_version = 1;
```

Initialize connections with `PRAGMA foreign_keys = ON`, use `sqlite3.Row`, and
wrap every write method in `with self._connect() as connection:` so commits and
rollbacks are deterministic. Store `self.db_path = Path(db_path)` in the
constructor and create its parent directory before opening the first connection.

- [ ] **Step 5: Implement JSON serializers and all repository methods**

Use `dataclasses.asdict()` for immutable models and explicit constructors on
read. Generate IDs as `uuid.uuid4().hex` and timestamps as
`datetime.now(timezone.utc).isoformat()`. `create_agent_revision()` and
`publish_dataset()` must increment revisions inside `BEGIN IMMEDIATE`
transactions. `create_run()` must query both owning `agent_id` values and raise
the exact error asserted in Step 1 when they differ.

`save_case_result()` must write the full `result_json` and replace the matching
normalized `tool_evidence`, `judge_scores`, and `usage_costs` rows in the same
transaction. `get_run()` reconstructs `CaseResult` instances ordered by
`case_id`.

- [ ] **Step 6: Run repository and existing tests**

```powershell
.venv\Scripts\python.exe -m pytest tests\test_sqlite_workbench.py tests\test_workbench_models.py -v --basetemp=.pytest_tmp_modular
.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_modular
```

Expected: new tests pass and the existing suite remains green.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src\settings.py src\sqlite_workbench.py tests\test_sqlite_workbench.py
git commit -m "feat: persist versioned workbench records in sqlite"
```

---

### Task 3: Agent and Dataset Revision Services with Legacy Import

**Files:**
- Create: `src/agent_registry.py`
- Create: `src/dataset_registry.py`
- Create: `src/legacy_import.py`
- Create: `tests/test_agent_registry.py`
- Create: `tests/test_dataset_registry.py`
- Modify: `src/case_studio.py`

**Interfaces:**
- Consumes: `WorkbenchRepository`, `ToolBinding`, `TestCase`, current `ToolsConfig`, and Case Studio validation.
- Produces: `AgentRegistry`, `DatasetRegistry`, and `import_legacy_agent(repo, config)`.

- [ ] **Step 1: Write failing service tests**

```python
from src.agent_registry import AgentRegistry
from src.dataset_registry import DatasetRegistry
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import TestCase, ToolBinding


def test_editing_tools_creates_a_new_agent_revision(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    service = AgentRegistry(repo)
    agent = service.create("Configurable Agent", "")
    first = service.revise(agent.agent_id, {"model": "m1"}, ())
    tool = ToolBinding("t1", "Lookup", "", "python", {}, {}, {}, {}, (), False, True)
    second = service.revise(agent.agent_id, {"model": "m1"}, (tool,))
    assert (first.revision, second.revision) == (1, 2)
    assert first.tools == ()
    assert second.tools == (tool,)


def test_dataset_draft_is_empty_until_cases_are_explicitly_added(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Empty Agent", "")
    datasets = DatasetRegistry(repo)
    dataset_id = datasets.create(agent.agent_id, "Test dataset")
    assert datasets.list_draft(dataset_id) == []
    datasets.add_cases(dataset_id, [TestCase("c1", {"query": "hello"}, {})])
    assert [case.case_id for case in datasets.list_draft(dataset_id)] == ["c1"]
```

- [ ] **Step 2: Run and verify missing service failures**

```powershell
.venv\Scripts\python.exe -m pytest tests\test_agent_registry.py tests\test_dataset_registry.py -v --basetemp=.pytest_tmp_modular
```

Expected: imports fail for both new service modules.

- [ ] **Step 3: Implement Agent and Dataset services**

`AgentRegistry` delegates storage but centralizes validation:

```python
class AgentRegistry:
    def __init__(self, repository: WorkbenchRepository):
        self.repository = repository

    def create(self, name: str, description: str) -> AgentProfile:
        name = name.strip()
        if not name:
            raise ValueError("agent name must not be empty")
        return self.repository.create_agent(name, description.strip())

    def revise(self, agent_id: str, config_snapshot: dict,
               tools: tuple[ToolBinding, ...]) -> AgentRevision:
        ids = [tool.tool_id for tool in tools]
        if len(ids) != len(set(ids)):
            raise ValueError("tool IDs must be unique within an agent revision")
        return self.repository.create_agent_revision(agent_id, config_snapshot, tools)
```

`DatasetRegistry` exposes `create()`, `list_draft()`, `add_cases()`,
`replace_case()`, `delete_case()`, `record_generation_cost()`, and `publish()`.
`record_generation_cost(dataset_id, cost)` accepts only
`UsageCost(category="dataset", ...)` and calls
`repository.add_dataset_generation_cost()`. Every case mutation reads the
current draft, creates a new list, rejects duplicate stable `case_id` and
case-insensitive duplicate `input["query"]`, then calls
`replace_draft_cases()`.

```python
def record_generation_cost(self, dataset_id: str, cost: UsageCost) -> None:
    if cost.category != "dataset":
        raise ValueError("dataset generation cost must use category 'dataset'")
    self.repository.add_dataset_generation_cost(dataset_id, cost)
```

- [ ] **Step 4: Make Case Studio return product `TestCase` objects**

Add `candidate_to_test_case(draft, config, dataset_id)` alongside the existing
backend conversion. It must derive expected behavior through `compute_case()`,
use `uuid.uuid4().hex` for `case_id`, set `source="llm"`, and keep
`metadata={"scenario": scenario, "tool_name": draft.tool_name,
"user_role": draft.user_role}`. JSON-imported candidates set `source="json"`
in the calling UI service.

- [ ] **Step 5: Implement one-time legacy Agent import**

`import_legacy_agent()` returns the existing Agent if any Agent already exists.
Otherwise it creates `Permission Compliance Agent`, converts every `ToolDef`
to a `ToolBinding(connection_type="python")`, stores only callable names in
`adapter_config`, and creates revision 1. It does not generate baseline cases.

- [ ] **Step 6: Run focused and full tests**

Run the Step 2 command, then the full suite. Expected: all pass and existing
Case Studio behavior remains compatible.

- [ ] **Step 7: Commit Task 3**

```powershell
git add src\agent_registry.py src\dataset_registry.py src\legacy_import.py src\case_studio.py tests\test_agent_registry.py tests\test_dataset_registry.py
git commit -m "feat: add agent-owned revision services"
```

---

### Task 4: Typed Langfuse and Local Observations

**Files:**
- Modify: `src/models.py`
- Modify: `src/backends/base.py`
- Modify: `src/backends/local_backend.py`
- Modify: `src/backends/langfuse_backend.py`
- Modify: `tests/test_local_backend.py`
- Create: `tests/test_langfuse_mapping.py`

**Interfaces:**
- Consumes: current `Tracer`, `TraceRecord`, and Langfuse SDK 3 APIs.
- Produces: `Tracer.observation(...)`, typed `SpanRecord`, usage/cost fields, and an `ObservationHandle` capable of recording output, usage, and errors.

- [ ] **Step 1: Write failing typed-observation round-trip tests**

```python
def test_typed_tool_and_generation_roundtrip(tmp_path):
    backend = LocalJsonBackend(tmp_path)
    with backend.tracer.start_trace("agent-run", user_id="u1", tags=["run-1"], metadata={}):
        with backend.tracer.observation(
            "call-tool", as_type="tool", input={"city": "Paris"}, metadata={"call_id": "c1"}
        ) as tool:
            tool.set_output({"temperature": 21})
        with backend.tracer.observation(
            "answer", as_type="generation", input={"prompt": "weather"},
            metadata={}, model="model-a"
        ) as generation:
            generation.set_output({"text": "21 C"})
            generation.set_usage({"input": 10, "output": 4}, {"input": 0.001, "output": 0.002})
    trace = LocalJsonStore(tmp_path).get_trace(backend.tracer.last_trace_id())
    assert trace.find_span("call-tool").observation_type == "tool"
    assert trace.find_span("answer").usage_details == {"input": 10, "output": 4}
    assert trace.find_span("answer").cost_details["output"] == 0.002
```

Import `LocalJsonBackend` and `LocalJsonStore` from
`src.backends.local_backend` at the top of the test module.

- [ ] **Step 2: Run focused tests and verify the missing API**

```powershell
.venv\Scripts\python.exe -m pytest tests\test_local_backend.py tests\test_langfuse_mapping.py -v --basetemp=.pytest_tmp_modular
```

Expected: `LocalTracer` has no `observation` method and `SpanRecord` lacks typed
fields.

- [ ] **Step 3: Extend normalized trace models**

Add these defaulted fields to `SpanRecord` so existing constructors remain
compatible:

```python
observation_type: str = "span"
level: str = "DEFAULT"
status_message: str | None = None
model: str | None = None
usage_details: dict[str, int] = field(default_factory=dict)
cost_details: dict[str, float] = field(default_factory=dict)
```

- [ ] **Step 4: Extend the Tracer protocol and handles**

Add:

```python
class ObservationHandle(Protocol):
    @property
    def observation_id(self) -> str | None: ...
    def set_output(self, output: dict) -> None: ...
    def set_usage(self, usage_details: dict[str, int],
                  cost_details: dict[str, float] | None = None) -> None: ...
    def set_error(self, message: str) -> None: ...


def observation(self, name: str, *, as_type: str = "span",
                input: dict | None = None, metadata: dict | None = None,
                model: str | None = None) -> AbstractContextManager: ...
```

Retain `span()` as a compatibility wrapper calling
`observation(as_type="span")`.

- [ ] **Step 5: Implement local typed serialization**

Serialize and deserialize all six new fields. `_LocalSpanHandle.observation_id`
returns the local span ID. `set_usage()` updates both dictionaries and
`set_error()` sets `level="ERROR"` and `status_message`. `LocalTracer.start_trace`
creates one `SpanRecord(name="agent_root", observation_type="agent")`, places it
in `root_spans` and on the stack before yielding, then sets its `end_time` and
pops it on exit. Every Tool, Generation, Guardrail, and Evaluator observation is
therefore nested beneath the Agent root in local traces.

- [ ] **Step 6: Implement Langfuse typed observations**

Replace the `start_trace()` root context with
`start_as_current_observation(name="agent_root", as_type="agent")`, then retain
the current `update_current_trace()` metadata call. Implement child observations
with:

```python
with self._lf.start_as_current_observation(
    name=name, as_type=as_type, input=input, metadata=metadata or {}, model=model
) as observation:
    yield _LangfuseObservationHandle(observation)
```

The handle exposes `observation_id` from `observation.id`, calls
`update(output=...)`, `update(usage_details=..., cost_details=...)`, and
`update(level="ERROR", status_message=...)`. `_to_trace_record()` maps Langfuse
`type`, `level`, `status_message`, `model`, `usage_details`, and `cost_details`
into `SpanRecord`.

- [ ] **Step 7: Run backend tests and commit**

Run the Step 2 command and the full suite. Expected: all pass.

```powershell
git add src\models.py src\backends\base.py src\backends\local_backend.py src\backends\langfuse_backend.py tests\test_local_backend.py tests\test_langfuse_mapping.py
git commit -m "feat: record typed langfuse observations"
```

---

### Task 5: Tool Adapter Runtime and Four-State Evidence

**Files:**
- Create: `src/tool_runtime.py`
- Modify: `src/agent.py`
- Modify: `src/code_evaluator.py`
- Create: `tests/test_tool_runtime.py`
- Modify: `tests/test_code_evaluator.py`

**Interfaces:**
- Consumes: `ToolBinding`, `Tracer.observation`, and callable adapters.
- Produces: `ToolRequest`, `ToolResult`, `ToolAdapter`, `ToolAdapterRegistry`, `ToolExecutor.execute()`, and `ToolEvidenceEvaluator.evaluate()`.

- [ ] **Step 1: Write failing execution-evidence tests**

```python
from src.backends.local_backend import LocalTracer
from src.tool_runtime import ToolAdapterRegistry, ToolExecutor, ToolRequest
from src.workbench_models import ToolBinding


def binding(*, verification_required):
    return ToolBinding(
        "restart", "Restart", "Restart a service", "python", {},
        {"type": "object"}, {"type": "object"}, {}, (),
        verification_required, True,
    )


def test_executor_records_success_and_receipt(tmp_path):
    local_tracer = LocalTracer(tmp_path / "traces.jsonl")
    mutable_tool_binding = binding(verification_required=True)
    registry = ToolAdapterRegistry()
    registry.register("python", lambda binding: lambda arguments: {
        "result": "restarted", "receipt": {"request_id": "req-1"}
    })
    executor = ToolExecutor(local_tracer, registry)
    with local_tracer.start_trace("run", user_id="u", tags=[], metadata={}):
        result, evidence = executor.execute(
            mutable_tool_binding,
            ToolRequest("call-1", mutable_tool_binding.tool_id, {"service": "orders"}),
        )
    assert result.output["result"] == "restarted"
    assert evidence.requested is True
    assert evidence.executed is True
    assert evidence.succeeded is True
    assert evidence.effect_verified is True
    assert evidence.observation_id


def test_executor_records_adapter_error(tmp_path):
    local_tracer = LocalTracer(tmp_path / "traces.jsonl")
    read_only_tool_binding = binding(verification_required=False)
    registry = ToolAdapterRegistry()
    registry.register("python", lambda binding: lambda arguments: (_ for _ in ()).throw(TimeoutError("slow")))
    executor = ToolExecutor(local_tracer, registry)
    with local_tracer.start_trace("run", user_id="u", tags=[], metadata={}):
        result, evidence = executor.execute(
            read_only_tool_binding, ToolRequest("call-2", read_only_tool_binding.tool_id, {})
        )
    assert result.error == "TimeoutError: slow"
    assert evidence.executed is True
    assert evidence.succeeded is False
```

- [ ] **Step 2: Run and verify missing runtime failures**

```powershell
.venv\Scripts\python.exe -m pytest tests\test_tool_runtime.py -v --basetemp=.pytest_tmp_modular
```

Expected: `src.tool_runtime` is missing.

- [ ] **Step 3: Implement adapter and executor types**

```python
@dataclass(frozen=True)
class ToolRequest:
    call_id: str
    tool_id: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class ToolResult:
    output: dict[str, Any] | None
    error: str | None
    receipt: dict[str, Any] | None


class ToolAdapter(Protocol):
    def __call__(self, arguments: dict[str, Any]) -> dict[str, Any]: ...


class ToolAdapterRegistry:
    def __init__(self):
        self._factories: dict[str, Callable[[ToolBinding], ToolAdapter]] = {}

    def register(self, connection_type: str,
                 factory: Callable[[ToolBinding], ToolAdapter]) -> None:
        self._factories[connection_type] = factory

    def build(self, binding: ToolBinding) -> ToolAdapter:
        if binding.connection_type not in self._factories:
            raise KeyError(f"no adapter registered for '{binding.connection_type}'")
        return self._factories[binding.connection_type](binding)
```

`ToolExecutor.execute()` records `started_at` before entering a Langfuse
`tool` observation, puts `call_id` and `tool_id` in metadata, calls the adapter
inside the context, records sanitized output or error, calculates latency, and
returns `(ToolResult, ToolEvidence)`. A receipt verifies effect only when it is
a non-empty dictionary and `verification_required` is true. Redact keys matching
`authorization`, `api_key`, `token`, `secret`, and `password`, case-insensitively,
before writing inputs or outputs.

- [ ] **Step 4: Route the current Agent through ToolExecutor**

Inject `ToolExecutor` into `TargetAgent`. Replace direct `run_mock_tool()` calls
with `executor.execute()` and return `tool_evidence` in the Agent result. Keep a
registered `python` adapter that wraps the existing mock functions during the
legacy migration; the executor now proves the function actually ran even when
its data is simulated.

- [ ] **Step 5: Extend deterministic evaluation**

Add scores `tool_requested`, `tool_executed`, `tool_succeeded`, and
`effect_verified` to `CodeEvaluator`. Use `NOT_REQUIRED` as the reason code for
read-only effects, and never infer execution from a model request alone. Keep
existing permission and execution scores unchanged for backward compatibility.

- [ ] **Step 6: Run focused/full tests and commit**

```powershell
.venv\Scripts\python.exe -m pytest tests\test_tool_runtime.py tests\test_code_evaluator.py -v --basetemp=.pytest_tmp_modular
.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_modular
git add src\tool_runtime.py src\agent.py src\code_evaluator.py tests\test_tool_runtime.py tests\test_code_evaluator.py
git commit -m "feat: evaluate real tool execution evidence"
```

---

### Task 6: Shared LLM Gateway with Usage and Cost

**Files:**
- Create: `src/llm_gateway.py`
- Modify: `src/intent.py`
- Modify: `src/settings.py`
- Create: `tests/test_llm_gateway.py`
- Modify: `tests/test_case_studio.py`

**Interfaces:**
- Consumes: Anthropic/OpenAI SDK responses and `Tracer.observation`.
- Produces: `LlmUsage`, `LlmResponse`, `LlmGateway`, `AnthropicGateway`, `OpenAIGateway`, and `ObservedLlmGateway.complete()`.

- [ ] **Step 1: Write failing normalized-usage tests**

```python
from src.backends.local_backend import LocalJsonStore, LocalTracer
from src.llm_gateway import LlmResponse, LlmUsage, ObservedLlmGateway


class FakeGateway:
    model = "fake-model"
    def complete(self, system, messages, max_tokens, json_mode=False):
        return LlmResponse(
            text='{"ok": true}', model=self.model, stop_reason="end_turn",
            usage=LlmUsage(input_tokens=120, output_tokens=30, cached_tokens=10,
                           reasoning_tokens=0, cost_usd=0.004),
        )


def test_observed_gateway_records_generation_usage(tmp_path):
    tracer = LocalTracer(tmp_path / "traces.jsonl")
    gateway = ObservedLlmGateway(FakeGateway(), tracer, category="judge")
    with tracer.start_trace("judge", user_id="eval", tags=[], metadata={}):
        response = gateway.complete("system", [{"role": "user", "content": "x"}], 100, True)
    assert response.usage.input_tokens == 120
    trace = LocalJsonStore(tmp_path).get_trace(tracer.last_trace_id())
    generation = trace.find_span("judge-generation")
    assert generation.observation_type == "generation"
    assert generation.usage_details["input"] == 110
    assert generation.usage_details["input_cached"] == 10
```

The exclusive input bucket is `input_tokens - cached_tokens`; this prevents
Langfuse from double-counting cached tokens.

- [ ] **Step 2: Run and verify the missing gateway**

Run `tests\test_llm_gateway.py`; expected: missing module failure.

- [ ] **Step 3: Implement normalized gateway types and provider adapters**

```python
@dataclass(frozen=True)
class LlmUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    reasoning_tokens: int = 0
    cost_usd: float = 0.0


@dataclass(frozen=True)
class LlmResponse:
    text: str
    model: str
    stop_reason: str | None
    usage: LlmUsage


class LlmGateway(Protocol):
    model: str
    def complete(self, system: str, messages: list[dict], max_tokens: int,
                 json_mode: bool = False) -> LlmResponse: ...
```

`AnthropicGateway` extracts text blocks, `stop_reason`,
`usage.input_tokens`, `usage.output_tokens`, and cache fields when present.
`OpenAIGateway` extracts message content, `finish_reason`, prompt/completion
tokens, cached tokens, and reasoning tokens. Both set `cost_usd=0.0` unless the
provider returns a billed-cost field; Langfuse may infer cost from the model
definition.

- [ ] **Step 4: Implement the observation wrapper**

`ObservedLlmGateway.complete()` opens a generation named
`f"{category}-generation"`, records the model and request, delegates to the
provider, writes the response text, and passes exclusive usage buckets through
`set_usage()` with `cost_details={"total": response.usage.cost_usd}` when cost
is non-zero. It stores `last_trace_id` from `tracer.last_trace_id()` and
`last_observation_id` from the observation handle for Judge linkage, then
returns the provider `LlmResponse` unchanged. On exception it
calls `set_error(f"{type(error).__name__}: {error}")` and re-raises.

- [ ] **Step 5: Refactor intent and Case Studio generation**

Replace direct SDK construction in `AnthropicIntentAnalyzer`,
`LlmIntentAnalyzer`, and `generate_case_candidates()` with injected gateways.
Keep current public factory functions compatible by building a provider gateway
from `Settings`. Preserve the current parser errors and fallback behavior. When
Case Studio accepts a generated response, convert its `LlmUsage` into
`UsageCost(category="dataset", ...)` and call
`DatasetRegistry.record_generation_cost()` for the active Dataset draft before
the user reviews candidates. Publishing the Dataset snapshots those costs into
`DatasetRevision.generation_costs`.

- [ ] **Step 6: Run tests and commit**

Run gateway, intent, and Case Studio tests plus the full suite. Expected: all
pass.

```powershell
git add src\llm_gateway.py src\intent.py src\settings.py tests\test_llm_gateway.py tests\test_case_studio.py
git commit -m "feat: capture llm token usage and cost"
```

---

### Task 7: Fixed Four-Dimension LLM Judge

**Files:**
- Create: `src/llm_judge.py`
- Create: `tests/test_llm_judge.py`

**Interfaces:**
- Consumes: `ObservedLlmGateway`, `Tracer`, `TestCase`, Agent response text,
  Tool Evidence summary, and deterministic scores.
- Produces: `LlmJudge(gateway, tracer).evaluate(case, response, evidence,
  deterministic_scores) -> JudgeResult` and `JudgeIncompleteError`.

- [ ] **Step 1: Write failing rubric and repair tests**

```python
import pytest

from src.backends.local_backend import LocalTracer
from src.llm_judge import JudgeIncompleteError, LlmJudge
from src.llm_gateway import LlmResponse, LlmUsage
from src.workbench_models import TestCase


class SequenceGateway:
    model = "judge-model"
    def __init__(self, texts): self.texts = iter(texts)
    def complete(self, system, messages, max_tokens, json_mode=False):
        return LlmResponse(next(self.texts), self.model, "end_turn", LlmUsage())


def case():
    return TestCase("case-1", {"query": "What happened?"},
                    {"expected_tool_called": None}, reference_answer="A concise answer")


def test_judge_returns_fixed_dimensions(tmp_path):
    gateway = SequenceGateway(['{"scores":{"correctness":4,"relevance":5,"completeness":4,"safety":4},"reasons":{"correctness":"Accurate","relevance":"Direct","completeness":"Complete","safety":"Safe"},"summary":"Pass"}'])
    result = LlmJudge(gateway, LocalTracer(tmp_path / "traces.jsonl")).evaluate(
        case(), "answer", (), {"execution_correctness": 1.0})
    assert tuple(result.scores) == ("correctness", "relevance", "completeness", "safety")
    assert result.passed is True


def test_judge_repairs_once_then_marks_incomplete(tmp_path):
    gateway = SequenceGateway(["not-json", "still-not-json"])
    with pytest.raises(JudgeIncompleteError, match="invalid judge response after one repair"):
        LlmJudge(gateway, LocalTracer(tmp_path / "traces.jsonl")).evaluate(
            case(), "answer", (), {})
```

- [ ] **Step 2: Run and verify missing Judge failure**

Run `tests\test_llm_judge.py`; expected: missing module.

- [ ] **Step 3: Implement the versioned Judge prompt and parser**

Set `PROMPT_VERSION = "judge-v1"`. The system prompt requires a JSON object with
exact keys `scores`, `reasons`, and `summary`; scores must contain exactly the
four approved dimensions and integers from 1 through 5. Include the user input,
reference answer when present, Agent output, compact tool-state list, and
deterministic score names without exposing secrets or raw trace payloads.

Parse with `json.loads()`, reject booleans as integers, reject missing/extra
dimensions, and require non-empty reasons. On the first parse failure, append a
repair message containing the validation error and call the gateway once more.
On the second failure raise `JudgeIncompleteError` with the exact message used
in Step 1.

- [ ] **Step 4: Create `JudgeResult` with observation linkage**

`LlmJudge.evaluate()` starts a trace named `llm-judge-{case.case_id}` and an
`evaluator` observation named `score-response`. The configured
`ObservedLlmGateway` records its Judge generation beneath that observation.
Use `tracer.last_trace_id()` and the evaluator handle's `observation_id` for
linkage. Persist `model`, `PROMPT_VERSION`, scores, reasons, and summary.
Convert the successful response's `LlmUsage` to
`UsageCost(category="judge", ...)` and store it in `JudgeResult.usage_cost`.
Do not calculate deterministic pass/fail inside the Judge.

- [ ] **Step 5: Run tests and commit**

```powershell
.venv\Scripts\python.exe -m pytest tests\test_llm_judge.py tests\test_workbench_models.py -v --basetemp=.pytest_tmp_modular
git add src\llm_judge.py src\llm_gateway.py tests\test_llm_judge.py
git commit -m "feat: add fixed rubric llm judge"
```

---

### Task 8: Immutable Evaluation Run Orchestration

**Files:**
- Modify: `src/eval_runner.py`
- Create: `src/agent_adapter.py`
- Modify: `src/agent.py`
- Create: `tests/test_eval_run_persistence.py`

**Interfaces:**
- Consumes: `AgentRevision`, `DatasetRevision`, `WorkbenchRepository`, `AgentAdapter`, `CodeEvaluator`, `LlmJudge`, and typed traces.
- Produces: `AgentAdapter.run(case, run_id) -> AgentAdapterResult` and `EvalRunner.run_revision(agent_revision_id, dataset_revision_id, progress=None) -> EvalRun`.

- [ ] **Step 1: Write failing immutable-run integration test**

```python
import asyncio

from src.agent_adapter import AgentAdapterResult
from src.code_evaluator import CodeEvaluator
from src.llm_judge import JudgeIncompleteError
from src.models import TraceRecord
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import JudgeResult, RunStatus, TestCase


class FakeAgent:
    async def run(self, case, run_id):
        trace = TraceRecord(trace_id=f"trace-{case.case_id}", name="fake-agent")
        return AgentAdapterResult("answer", trace.trace_id, trace, (), ())


class FakeJudge:
    def evaluate(self, case, response, evidence, deterministic_scores):
        return JudgeResult(
            {"correctness": 4, "relevance": 4, "completeness": 4, "safety": 4},
            {name: "Pass" for name in ("correctness", "relevance", "completeness", "safety")},
            "Pass", "judge-model", "judge-v1", "judge-trace", "judge-observation",
        )


class FailingJudge:
    def evaluate(self, case, response, evidence, deterministic_scores):
        raise JudgeIncompleteError("invalid judge response after one repair")


def seed_workbench(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Agent", "")
    agent_revision = repo.create_agent_revision(agent.agent_id, {"model": "m1"}, ())
    dataset_id = repo.create_dataset(agent.agent_id, "Dataset")
    repo.replace_draft_cases(dataset_id, [TestCase("case-1", {"query": "hello"}, {})])
    return repo, agent_revision, repo.publish_dataset(dataset_id)


def test_run_freezes_revisions_and_persists_case_results(tmp_path):
    repo, agent_revision, dataset_revision = seed_workbench(tmp_path)
    runner = EvalRunner(repo, FakeAgent(), CodeEvaluator(), FakeJudge())
    completed = asyncio.run(runner.run_revision(agent_revision.revision_id,
                                                dataset_revision.revision_id))
    reopened = SQLiteWorkbenchRepository(repo.db_path).get_run(completed.run_id)
    assert reopened.status is RunStatus.COMPLETED
    assert reopened.agent_revision_id == agent_revision.revision_id
    assert reopened.dataset_revision_id == dataset_revision.revision_id
    assert len(reopened.case_results) == len(dataset_revision.cases)
    assert reopened.case_results[0].judge is not None


def test_judge_failure_makes_run_partial(tmp_path):
    repo, agent_revision, dataset_revision = seed_workbench(tmp_path)
    run = asyncio.run(EvalRunner(repo, FakeAgent(), CodeEvaluator(), FailingJudge())
                      .run_revision(agent_revision.revision_id, dataset_revision.revision_id))
    assert run.status is RunStatus.PARTIAL
    assert run.case_results[0].status == "INCOMPLETE"
```

- [ ] **Step 2: Run and verify constructor/signature failure**

Run `tests\test_eval_run_persistence.py`; expected: current `EvalRunner` does not
accept the repository/adapter dependencies.

- [ ] **Step 3: Add the Agent adapter boundary**

```python
@dataclass(frozen=True)
class AgentAdapterResult:
    response: str
    trace_id: str
    trace: TraceRecord
    tool_evidence: tuple[ToolEvidence, ...]
    usage_costs: tuple[UsageCost, ...]


class AgentAdapter(Protocol):
    async def run(self, case: TestCase, run_id: str) -> AgentAdapterResult: ...
```

Wrap the current `TargetAgent` as `PermissionAgentAdapter`; it converts the
normalized `TestCase` to the current query/user inputs, collects ToolExecutor
evidence, flushes and reads the normalized `TraceRecord`, and extracts `agent`
usage costs from generation observations.
`EvalRunner` never imports or constructs a concrete Agent.

- [ ] **Step 4: Implement run lifecycle and case status precedence**

`run_revision()` loads both immutable revisions, calls `repository.create_run()`,
and evaluates cases in Dataset order. For each case:

1. call the Agent adapter;
2. fetch its normalized trace;
3. run `CodeEvaluator`;
4. run `LlmJudge`;
5. create `CaseResult`, combining `AgentAdapterResult.usage_costs` with
   `JudgeResult.usage_cost` when present;
6. call `save_case_result()` immediately.

Case status is `FAIL` when any required deterministic score is below 1.0 or the
Judge gate fails; `INCOMPLETE` when trace/Judge data is unavailable; otherwise
`PASS`. Final run status is `PARTIAL` if any case is incomplete, `FAILED` only
when no usable case result exists, otherwise `COMPLETED`. A completed run may
contain failing cases; quality status belongs to the Report, not `RunStatus`.

- [ ] **Step 5: Preserve the CLI compatibility wrapper**

Keep the current constructor path in a small deprecated wrapper only until Task
12 migrates `main.py`. No new UI code may use dataset names or experiment tags
as Run identity.

- [ ] **Step 6: Run tests and commit**

```powershell
.venv\Scripts\python.exe -m pytest tests\test_eval_run_persistence.py tests\test_code_evaluator.py -v --basetemp=.pytest_tmp_modular
.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_modular
git add src\agent_adapter.py src\agent.py src\eval_runner.py tests\test_eval_run_persistence.py
git commit -m "feat: persist immutable evaluation runs"
```

---

### Task 9: Structured Reports, History, and Revision-Aware Comparison

**Files:**
- Create: `src/report_service.py`
- Create: `src/report_compare.py`
- Modify: `src/report_generator.py`
- Create: `tests/test_report_service.py`
- Create: `tests/test_report_compare.py`
- Modify: `tests/test_report_generator.py`

**Interfaces:**
- Consumes: immutable `EvalRun`, Agent/Dataset revisions, Case Results, and `WorkbenchRepository`.
- Produces: `derive_report_status(run) -> str`,
  `ReportService.create(run_id) -> ReportSnapshot`, `ReportComparison`, and
  `compare_report_summaries(...) -> ReportComparison`.

- [ ] **Step 1: Write failing report-status and comparison tests**

```python
from src.report_compare import compare_report_summaries
from src.report_service import derive_report_status
from src.workbench_models import CaseResult, EvalRun, RunStatus


def case_result(case_id, status):
    return CaseResult(case_id, f"trace-{case_id}", "answer", {}, {}, (), None, (), status)


def run_with(status):
    return EvalRun("run", "agent", "ar", "dr", RunStatus.COMPLETED,
                   "2026-07-30T00:00:00+00:00", "2026-07-30T00:01:00+00:00",
                   "eval-v1", (case_result("case-a", status),))


def test_report_status_precedence():
    assert derive_report_status(run_with("INCOMPLETE")) == "INCOMPLETE"
    assert derive_report_status(run_with("FAIL")) == "NEEDS ATTENTION"
    assert derive_report_status(run_with("PASS")) == "PASS"


def test_comparison_uses_shared_cases_and_lists_coverage_changes():
    baseline = {
        "identity": {"dataset": {"revision": 1}},
        "cases": [{"case_id": "case-a", "status": "PASS"},
                  {"case_id": "case-b", "status": "FAIL"}],
        "judge_dimensions": {"correctness": 4.0},
        "tool_funnel": {"executed": 1},
        "costs": {"evaluation_total": 0.03},
    }
    current = {
        "identity": {"dataset": {"revision": 2}},
        "cases": [{"case_id": "case-a", "status": "PASS"},
                  {"case_id": "case-b", "status": "PASS"},
                  {"case_id": "case-c", "status": "FAIL"}],
        "judge_dimensions": {"correctness": 4.5},
        "tool_funnel": {"executed": 2},
        "costs": {"evaluation_total": 0.02},
    }
    comparison = compare_report_summaries(
        "report-1", baseline, {"model": "m1"},
        "report-2", current, {"model": "m2"},
    )
    assert comparison.shared_case_ids == ("case-a", "case-b")
    assert comparison.added_case_ids == ("case-c",)
    assert comparison.removed_case_ids == ()
    assert comparison.pass_rate_delta_shared == 50.0
    assert comparison.different_dataset_revisions is True
    assert comparison.agent_changes["model"] == {"before": "m1", "after": "m2"}
```

- [ ] **Step 2: Run and verify missing service failures**

Run both new report test modules; expected: missing modules.

- [ ] **Step 3: Implement structured Report summaries**

Implement quality-status precedence as a pure function:

```python
def derive_report_status(run: EvalRun) -> str:
    statuses = [result.status for result in run.case_results]
    if not statuses or "INCOMPLETE" in statuses or run.status in {RunStatus.PARTIAL, RunStatus.FAILED}:
        return "INCOMPLETE"
    if "FAIL" in statuses:
        return "NEEDS ATTENTION"
    return "PASS"
```

`ReportService.create()` loads the Run and both revisions, calculates status in
the approved precedence order, and builds a JSON-serializable summary with exact
top-level keys:

```python
agent = self.repository.get_agent(run.agent_id)
agent_revision = self.repository.get_agent_revision(run.agent_revision_id)
dataset_revision = self.repository.get_dataset_revision(run.dataset_revision_id)
results = list(run.case_results)
evidence = [item for result in results for item in result.tool_evidence]
run_costs = [item for result in results for item in result.usage_costs]
dataset_costs = list(dataset_revision.generation_costs)
passed = sum(result.status == "PASS" for result in results)
judge_results = [result.judge for result in results if result.judge is not None]
dimensions = ("correctness", "relevance", "completeness", "safety")
judge_dimensions = {
    name: (sum(judge.scores[name] for judge in judge_results) / len(judge_results)
           if judge_results else 0.0)
    for name in dimensions
}
agent_cost = sum(item.cost_usd for item in run_costs if item.category == "agent")
judge_cost = sum(item.cost_usd for item in run_costs if item.category == "judge")
dataset_cost = sum(item.cost_usd for item in dataset_costs)
all_costs = run_costs + dataset_costs
token_fields = ("input_tokens", "output_tokens", "cached_tokens", "reasoning_tokens")
token_totals = {
    f"{category}_{field}": sum(getattr(item, field) for item in all_costs
                                if item.category == category)
    for category in ("agent", "judge", "dataset")
    for field in token_fields
}

summary = {
    "identity": {
        "run_id": run.run_id,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "agent": {"id": agent.agent_id, "name": agent.name,
                  "revision": agent_revision.revision},
        "dataset": {"id": dataset_revision.dataset_id, "name": dataset_revision.name,
                    "revision": dataset_revision.revision},
    },
    "status": quality_status,
    "metrics": {
        "total_cases": len(results),
        "passed_cases": passed,
        "pass_rate": passed / len(results) * 100 if results else 0.0,
        "judge_average": (sum(judge.average for judge in judge_results) /
                          len(judge_results) if judge_results else 0.0),
        "verified_tools": sum(item.effect_verified is True for item in evidence),
        "required_verifications": sum(item.verification_required for item in evidence),
        "evaluation_cost_usd": agent_cost + judge_cost,
        "dataset_generation_cost_usd": dataset_cost,
    },
    "judge_dimensions": judge_dimensions,
    "tool_funnel": {
        "requested": sum(item.requested for item in evidence),
        "executed": sum(item.executed for item in evidence),
        "succeeded": sum(item.succeeded for item in evidence),
        "verified": sum(item.effect_verified is True for item in evidence),
    },
    "costs": {"agent": agent_cost, "judge": judge_cost,
              "evaluation_total": agent_cost + judge_cost, "dataset": dataset_cost},
    "tokens": token_totals,
    "cases": [self._case_summary(result) for result in results],
    "failures": [self._failure_summary(result) for result in results
                 if result.status != "PASS"],
}
```

Render Markdown from this structure in `ReportGenerator`; do not re-query
mutable traces during rendering. Save through `repository.save_report()` so
artifact versions increment instead of overwriting history.

Implement `_case_summary()` with keys `case_id`, `status`, `response`,
`deterministic_scores`, `deterministic_reasons`, `judge`, `tool_evidence`,
`usage_costs`, and `trace_id`. Implement `_failure_summary()` with `case_id`,
`status`, deterministic reason codes, Judge reasons, failed Tool states, and
`trace_id`. Both helpers return JSON-safe dictionaries via explicit field
selection; they never call `dataclasses.asdict()` on unredacted adapter data.

- [ ] **Step 4: Implement comparison dataclasses and rules**

Define the exact immutable result type:

```python
@dataclass(frozen=True)
class ReportComparison:
    baseline_report_id: str
    current_report_id: str
    shared_case_ids: tuple[str, ...]
    added_case_ids: tuple[str, ...]
    removed_case_ids: tuple[str, ...]
    pass_rate_delta_shared: float
    judge_deltas: dict[str, float]
    tool_state_deltas: dict[str, int]
    cost_delta_usd: float
    token_deltas: dict[str, int]
    resolved_failure_ids: tuple[str, ...]
    regression_ids: tuple[str, ...]
    unchanged_failure_ids: tuple[str, ...]
    agent_changes: dict[str, dict[str, object]]
    different_dataset_revisions: bool


def compare_report_summaries(
    baseline_report_id: str, baseline: dict, baseline_config: dict,
    current_report_id: str, current: dict, current_config: dict,
) -> ReportComparison:
    baseline_cases = {item["case_id"]: item for item in baseline["cases"]}
    current_cases = {item["case_id"]: item for item in current["cases"]}
    shared = tuple(sorted(baseline_cases.keys() & current_cases.keys()))
    added = tuple(sorted(current_cases.keys() - baseline_cases.keys()))
    removed = tuple(sorted(baseline_cases.keys() - current_cases.keys()))

    def shared_rate(cases):
        return (sum(cases[case_id]["status"] == "PASS" for case_id in shared) /
                len(shared) * 100 if shared else 0.0)

    baseline_failures = {case_id for case_id in shared
                         if baseline_cases[case_id]["status"] != "PASS"}
    current_failures = {case_id for case_id in shared
                        if current_cases[case_id]["status"] != "PASS"}
    judge_names = baseline.get("judge_dimensions", {}).keys() | current.get("judge_dimensions", {}).keys()
    tool_names = baseline.get("tool_funnel", {}).keys() | current.get("tool_funnel", {}).keys()
    token_names = baseline.get("tokens", {}).keys() | current.get("tokens", {}).keys()
    config_keys = ("model", "system_prompt", "model_parameters", "tools", "policy")
    changes = {
        key: {"before": baseline_config.get(key), "after": current_config.get(key)}
        for key in config_keys if baseline_config.get(key) != current_config.get(key)
    }
    return ReportComparison(
        baseline_report_id=baseline_report_id,
        current_report_id=current_report_id,
        shared_case_ids=shared,
        added_case_ids=added,
        removed_case_ids=removed,
        pass_rate_delta_shared=shared_rate(current_cases) - shared_rate(baseline_cases),
        judge_deltas={name: current.get("judge_dimensions", {}).get(name, 0.0) -
                      baseline.get("judge_dimensions", {}).get(name, 0.0)
                      for name in judge_names},
        tool_state_deltas={name: current.get("tool_funnel", {}).get(name, 0) -
                           baseline.get("tool_funnel", {}).get(name, 0)
                           for name in tool_names},
        cost_delta_usd=current["costs"]["evaluation_total"] -
                       baseline["costs"]["evaluation_total"],
        token_deltas={name: current.get("tokens", {}).get(name, 0) -
                      baseline.get("tokens", {}).get(name, 0)
                      for name in token_names},
        resolved_failure_ids=tuple(sorted(baseline_failures - current_failures)),
        regression_ids=tuple(sorted(current_failures - baseline_failures)),
        unchanged_failure_ids=tuple(sorted(baseline_failures & current_failures)),
        agent_changes=changes,
        different_dataset_revisions=(
            baseline["identity"]["dataset"]["revision"] !=
            current["identity"]["dataset"]["revision"]
        ),
    )
```

Match only on stable `case_id`. Compare nested Agent
config keys `model`, `system_prompt`, `model_parameters`, `tools`, and `policy`
using `{before, after}` values.

`ReportService.compare(baseline_report_id, current_report_id)` loads both
snapshots and their Agent Revision config snapshots, then delegates to
`compare_report_summaries(baseline_id, baseline_summary, baseline_config,
current_id, current_summary, current_config)`.

- [ ] **Step 5: Run report/full tests and commit**

```powershell
.venv\Scripts\python.exe -m pytest tests\test_report_service.py tests\test_report_compare.py tests\test_report_generator.py -v --basetemp=.pytest_tmp_modular
.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_modular
git add src\report_service.py src\report_compare.py src\report_generator.py tests\test_report_service.py tests\test_report_compare.py tests\test_report_generator.py
git commit -m "feat: add durable reports and run comparison"
```

---

### Task 10: Modular Streamlit Shell, Agent List, and Tool Module

**Files:**
- Create: `src/ui/__init__.py`
- Create: `src/ui/shell.py`
- Create: `src/ui/agents.py`
- Create: `src/ui/tools.py`
- Create: `src/ui/state.py`
- Modify: `app.py`
- Modify: `requirements.txt`
- Create: `tests/test_ui_agents.py`

**Interfaces:**
- Consumes: `AgentRegistry`, `WorkbenchRepository`, and approved UI hierarchy.
- Produces: `render_shell()`, `render_agents_page()`, `render_agent_workspace()`, and `render_tools_module()`.

- [ ] **Step 1: Write failing AppTest for modular ownership**

```python
from src.agent_registry import AgentRegistry
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import ToolBinding
from streamlit.testing.v1 import AppTest


def visible_text(app):
    nodes = (app.get("title") + app.get("header") + app.get("subheader") +
             app.get("text") + app.get("markdown"))
    return "\n".join(str(node.value) for node in nodes)


def binding(tool_id, name):
    return ToolBinding(tool_id, name, "", "python", {}, {}, {}, {}, (), False, True)


def test_agents_page_and_tool_switching(tmp_path, monkeypatch):
    db = tmp_path / "workbench.db"
    repo = SQLiteWorkbenchRepository(db)
    registry = AgentRegistry(repo)
    one = registry.create("Agent One", "")
    registry.revise(one.agent_id, {}, (binding("one", "Tool One"),))
    two = registry.create("Agent Two", "")
    registry.revise(two.agent_id, {}, (binding("two", "Tool Two"),))
    monkeypatch.setenv("WORKBENCH_DB", str(db))
    app = AppTest.from_file("app.py").run(timeout=20)
    assert not app.exception
    assert "Agents" in visible_text(app)
    assert "Agent One" in visible_text(app)
    assert "Tool One" in visible_text(app)
    next(button for button in app.button
         if button.key == f"select_agent_{two.agent_id}").click().run(timeout=20)
    assert "Tool Two" in visible_text(app)
    assert "Tool One" not in visible_text(app)
    assert "Reset Demo" not in visible_text(app)
    assert "Roadmap" not in visible_text(app)
```

- [ ] **Step 2: Run and verify the current UI failure**

Run `tests\test_ui_agents.py`; expected: current app lacks modular Agent
selectors and still renders the old workflow.

- [ ] **Step 3: Add Streamlit state and shell routing**

`src/ui/state.py` initializes only `selected_agent_id`, `active_page`,
`active_agent_module`, and transient dialog/draft keys. It must not duplicate
SQLite records in session state.

`render_shell()` renders the English global navigation `Agents`, `Datasets`,
`Reports`, `Settings` with a horizontal `st.radio`, then dispatches to one page
renderer. Default to `Agents`.

- [ ] **Step 4: Implement Agent list and workspace**

Render the empty state `No agents yet` with `New agent` when the repository is
empty. Otherwise render one compact selectable row/card per Agent with name,
Tool count, Dataset count, and Run count. Use stable widget keys
`select_agent_{agent_id}`. The selected workspace header shows the Agent name,
current revision, availability, `Revisions`, `Edit agent`, and `New evaluation`.

Use a horizontal module selector with `Tools`, `Datasets`, `Runs`, `Reports`.
Selecting another Agent must update every module query to the new `agent_id`.

- [ ] **Step 5: Implement Agent-owned Tool list and editor**

`render_tools_module()` loads the selected current Agent Revision and shows only
its Tool Bindings. Columns are Tool, Connection, Test requirements, Status, and
icon actions. `Add tool` and `Edit` open forms for all `ToolBinding` fields.
Saving calls `AgentRegistry.revise()` and immediately selects the new revision.
Remove creates a revision without that binding; it never mutates an old
revision. Unknown adapter types display `UNAVAILABLE`.

- [ ] **Step 6: Reduce `app.py` to composition**

Keep page config, stylesheet loading, settings/repository construction, and one
`render_shell()` call. Remove old Roadmap imports, Reset Demo flow, fixed Tool
cards, Pipeline sidebar buttons, and duplicated report rendering. Do not delete
the underlying legacy modules until Task 12 migration tests pass.

- [ ] **Step 7: Run UI/full tests and commit**

```powershell
.venv\Scripts\python.exe -m pytest tests\test_ui_agents.py -v --basetemp=.pytest_tmp_modular
.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_modular
git add app.py requirements.txt src\ui tests\test_ui_agents.py
git commit -m "feat: add modular agent workspace ui"
```

---

### Task 11: Dataset, Run, Report, and Compare UI Modules

**Files:**
- Create: `src/ui/datasets.py`
- Create: `src/ui/runs.py`
- Create: `src/ui/reports.py`
- Create: `src/ui/charts.py`
- Create: `tests/test_ui_evaluation_flow.py`
- Create: `tests/test_ui_reports.py`

**Interfaces:**
- Consumes: `DatasetRegistry`, `EvalRunner`, `ReportService`, `ReportComparison`, and selected Agent state.
- Produces: Agent-scoped Dataset/Run/Report modules and the contextual New Evaluation wizard.

- [ ] **Step 1: Write failing empty-list and history tests**

```python
from pathlib import Path

from src.agent_registry import AgentRegistry
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import CaseResult, RunStatus, TestCase
from streamlit.testing.v1 import AppTest


def seed_agent_db(tmp_path, with_report=False):
    db = tmp_path / "workbench.db"
    repo = SQLiteWorkbenchRepository(db)
    agent = AgentRegistry(repo).create("Agent One", "")
    agent_revision = repo.create_agent_revision(agent.agent_id, {"model": "m1"}, ())
    dataset_id = repo.create_dataset(agent.agent_id, "Dataset")
    if with_report:
        repo.replace_draft_cases(dataset_id, [TestCase("case-1", {"query": "hello"}, {})])
        dataset_revision = repo.publish_dataset(dataset_id)
        run = repo.create_run(agent_revision.revision_id, dataset_revision.revision_id)
        repo.save_case_result(run.run_id, CaseResult(
            "case-1", "trace-1", "answer", {"execution_correctness": 1.0},
            {}, (), None, (), "PASS",
        ))
        repo.finish_run(run.run_id, RunStatus.COMPLETED)
        repo.save_report(
            run.run_id, "PASS",
            {"identity": {"run_id": run.run_id}, "status": "PASS",
             "metrics": {"evaluation_cost_usd": 0.0},
             "judge_dimensions": {}, "tool_funnel": {},
             "costs": {"agent": 0.0, "judge": 0.0,
                       "evaluation_total": 0.0, "dataset": 0.0},
             "cases": [], "failures": []},
            tmp_path / "report.md",
        )
    return db, agent.agent_id


def visible_text(app):
    nodes = (app.get("title") + app.get("header") + app.get("subheader") +
             app.get("text") + app.get("markdown"))
    return "\n".join(str(node.value) for node in nodes)


def test_dataset_starts_empty_and_exposes_only_add_actions(tmp_path, monkeypatch):
    db, agent_id = seed_agent_db(tmp_path)
    monkeypatch.setenv("WORKBENCH_DB", str(db))
    app = AppTest.from_file("app.py").run(timeout=20)
    next(button for button in app.button
         if button.key == f"select_agent_{agent_id}").click().run(timeout=20)
    next(radio for radio in app.radio
         if radio.key == "agent_module").set_value("Datasets").run(timeout=20)
    assert "No cases in the current draft" in visible_text(app)
    labels = [button.label for button in app.button]
    assert "Add case" in labels
    keys = {button.key for button in app.button}
    assert "dataset_generate_llm" in keys
    assert "dataset_import_json" in keys


def test_report_history_survives_app_restart(tmp_path, monkeypatch):
    db, agent_id = seed_agent_db(tmp_path, with_report=True)
    monkeypatch.setenv("WORKBENCH_DB", str(db))
    first = AppTest.from_file("app.py").run(timeout=20)
    next(button for button in first.button
         if button.key == f"select_agent_{agent_id}").click().run(timeout=20)
    next(radio for radio in first.radio
         if radio.key == "agent_module").set_value("Reports").run(timeout=20)
    assert "Evaluation cost" in visible_text(first)
    second = AppTest.from_file("app.py").run(timeout=20)
    next(button for button in second.button
         if button.key == f"select_agent_{agent_id}").click().run(timeout=20)
    next(radio for radio in second.radio
         if radio.key == "agent_module").set_value("Reports").run(timeout=20)
    assert "Evaluation cost" in visible_text(second)
    assert "PASS" in visible_text(second)
```

- [ ] **Step 2: Run and verify missing module failures**

Run both new UI test modules; expected: import/render failures.

- [ ] **Step 3: Implement Agent-scoped Dataset module**

Render the empty draft list first, then the icon actions `Add case`, `Generate
with LLM`, `Import JSON`, and `Complete coverage`. Reuse Case Studio review,
edit, select, and confirm behavior, but convert accepted drafts to `TestCase`
and save through `DatasetRegistry`. Row actions are Edit, Duplicate, and Delete.
`Publish revision` freezes the current ordered list and remains disabled for an
empty draft. Use stable widget keys `dataset_add_case`, `dataset_generate_llm`,
`dataset_import_json`, `dataset_complete_coverage`, and `dataset_publish`.

- [ ] **Step 4: Implement contextual New Evaluation wizard**

Use four explicit stages in one selected-Agent context:

1. confirm Agent Revision;
2. select an existing Dataset Revision or publish the current draft;
3. show deterministic evaluator version, Judge model/rubric, and cost categories;
4. start `EvalRunner.run_revision()` and open the created Report.

The Run list displays timestamp, Agent Revision, Dataset Revision, run status,
quality status, and cost. Disable start when an enabled Tool needed by a selected
case is unavailable. Preserve per-case progress and persist each result before
updating the UI.

- [ ] **Step 5: Implement Report visualization and history**

Use `ReportSnapshot.summary` only. Render:

- a textual status banner;
- four KPIs: Pass Rate, Judge Score, Verified Tools, Evaluation Cost;
- four labelled Judge bars on a 1–5 axis;
- Requested/Executed/Succeeded/Verified Tool funnel;
- a case table with textual status;
- Agent/Judge cost bars and Dataset cost as excluded context;
- failure reasons and Langfuse links;
- Report History for the selected Agent.

Use Plotly only for Judge, funnel, and cost visuals. Configure text labels on
marks, accessible headings around charts, and theme-aware colors. Never use a
red/green fill without visible PASS/FAIL text.

- [ ] **Step 6: Implement Report comparison UI**

Provide baseline/current selectors restricted to the selected Agent. Show the
`Different dataset revisions` warning when applicable, Agent configuration
diff, shared-case score deltas, resolved failures, regressions, unchanged
failures, added/removed cases, Tool-state changes, token deltas, and cost delta.
Do not show a headline pass-rate delta based on different case sets; use
`pass_rate_delta_shared`.

- [ ] **Step 7: Run UI/full tests and commit**

```powershell
.venv\Scripts\python.exe -m pytest tests\test_ui_evaluation_flow.py tests\test_ui_reports.py -v --basetemp=.pytest_tmp_modular
.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_modular
git add src\ui\datasets.py src\ui\runs.py src\ui\reports.py src\ui\charts.py tests\test_ui_evaluation_flow.py tests\test_ui_reports.py
git commit -m "feat: add guided runs and visual report history"
```

---

### Task 12: CLI Migration, Docker Persistence, Documentation, and End-to-End Verification

**Files:**
- Modify: `main.py`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.gitignore`
- Create: `tests/test_legacy_import.py`
- Modify: `tests/ui_smoke.py`

**Interfaces:**
- Consumes: all prior services and the existing YAML/local JSON demo data.
- Produces: migrated CLI commands, persistent SQLite Docker volume, documented startup, and complete regression coverage.

- [ ] **Step 1: Write failing legacy-import idempotency test**

```python
def test_legacy_import_runs_once(tmp_path, tools_config):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    first = import_legacy_agent(repo, tools_config)
    second = import_legacy_agent(repo, tools_config)
    assert first.agent_id == second.agent_id
    assert len(repo.list_agents()) == 1
    assert repo.get_agent(first.agent_id).current_revision == 1
```

- [ ] **Step 2: Migrate the CLI to stable IDs**

Replace `--dataset`/`--experiment` as primary identity with:

```text
python main.py agents list
python main.py agents import-legacy
python main.py datasets publish --dataset-id <id>
python main.py runs start --agent-revision-id <id> --dataset-revision-id <id>
python main.py reports create --run-id <id>
python main.py reports compare --baseline <report-id> --current <report-id>
```

Keep the old `--step` interface for one release as a compatibility shim that
prints a deprecation message and routes through imported stable records.

- [ ] **Step 3: Configure durable local storage**

Set `WORKBENCH_DB=/app/data/workbench.db` in `docker-compose.yml` and ensure the
existing `agent-eval-data:/app/data` volume persists it. Do not change the
separate Langfuse compose stack. Keep Langfuse Web and MinIO bound to
`127.0.0.1` as already modified locally.

Add `.superpowers/`, `.pytest_tmp_modular/`, SQLite `-wal`/`-shm` files, and
generated Report artifacts to `.gitignore` without ignoring the committed
`docs/superpowers/` specs and plans.

- [ ] **Step 4: Rewrite README startup and product flow**

Document, in this order:

1. copy `.env.example` to `.env` and configure DeepSeek/OpenAI plus Langfuse;
2. start local Langfuse with `docker compose -f langfuse/docker-compose.yml up -d`;
3. start AgentEval with `.venv\Scripts\python.exe -m streamlit run app.py --server.port 8501 --server.headless true`;
4. create/import an Agent;
5. configure that Agent's Tools;
6. create and publish a Dataset;
7. run an evaluation;
8. reopen and compare Reports;
9. explain Agent, Judge, Dataset, and total cost categories;
10. stop both stacks without deleting volumes.

Remove instructions for `Reset Demo`, Roadmap previews, fixed baseline case
generation, and the fixed three-Tool homepage.

- [ ] **Step 5: Update the end-to-end smoke test**

The smoke test must create two Agents with different Tool lists, add one manual
case to the first Agent, publish a Dataset Revision, run with fake Agent/Judge
adapters, generate two Reports from two Agent revisions, compare them, restart
the Streamlit AppTest, and assert the history remains. It must also assert
`PASS`/`NEEDS ATTENTION` text, Tool funnel labels, and Agent/Judge cost labels.

- [ ] **Step 6: Run complete verification**

```powershell
.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_modular
.venv\Scripts\python.exe tests\ui_smoke.py
docker compose config
docker compose -f langfuse\docker-compose.yml config
```

Expected: all tests pass, both Compose files validate, no fixed Agent/Tool names
appear in `src/ui`, and no `Reset Demo` or Roadmap copy appears in `app.py` or
`src/ui`.

Run the copy scan:

```powershell
rg -n "WeatherTool|EmployeeQueryTool|SystemRestartTool|Reset Demo|Roadmap" app.py src\ui
```

Expected: no matches.

- [ ] **Step 7: Start the local stack and perform manual acceptance**

Start one Streamlit process on `localhost:8501` and the Langfuse stack on
`localhost:3000`. Verify Agent switching changes Tool rows, a fresh Agent has an
empty Dataset draft, a completed Report survives a Streamlit restart, Compare
shows configuration and shared-case deltas, Tool evidence links open Langfuse,
and Token/Cost totals equal stored case details.

- [ ] **Step 8: Commit Task 12**

```powershell
git add main.py README.md .env.example Dockerfile docker-compose.yml .gitignore tests\test_legacy_import.py tests\ui_smoke.py
git commit -m "docs: complete modular workbench migration"
```

---

## Final Verification Gate

Before claiming completion:

1. Run the complete command set from Task 12 Step 6 and capture passing output.
2. Run `git status --short` and confirm only known unrelated user changes remain.
3. Open `http://localhost:8501` and inspect all four Agent modules at desktop and narrow widths.
4. Open one linked Tool observation and one Judge generation in Langfuse.
5. Recalculate one Report's Evaluation Total from Agent and Judge case costs.
6. Compare two Reports with the same Dataset Revision and two with different Dataset Revisions.
7. Confirm no secrets appear in SQLite JSON, Markdown reports, Streamlit output, or Langfuse Tool inputs/outputs.
