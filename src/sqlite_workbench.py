"""SQLite-backed durable storage for the versioned evaluation workbench."""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .workbench_models import (
    AgentProfile,
    AgentRevision,
    CaseResult,
    DatasetRevision,
    EvalRun,
    JudgeResult,
    ReportSnapshot,
    RunStatus,
    TestCase,
    ToolBinding,
    ToolEvidence,
    UsageCost,
)


SCHEMA_V1 = """
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
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex


def _json(value: Any) -> str:
    return json.dumps(value, default=_json_default, separators=(",", ":"), sort_keys=True)


def _json_default(value: Any) -> list[Any]:
    if isinstance(value, (set, frozenset)):
        return sorted(value, key=repr)
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def _model_json(model: Any) -> str:
    return _json(asdict(model))


def _usage_cost(payload: dict[str, Any]) -> UsageCost:
    return UsageCost(**payload)


def _tool_evidence(payload: dict[str, Any]) -> ToolEvidence:
    return ToolEvidence(**payload)


def _case_result(payload: dict[str, Any]) -> CaseResult:
    judge_data = payload["judge"]
    judge = None
    if judge_data is not None:
        usage_data = judge_data.get("usage_cost")
        judge = JudgeResult(
            scores=judge_data["scores"],
            reasons=judge_data["reasons"],
            summary=judge_data["summary"],
            model=judge_data["model"],
            prompt_version=judge_data["prompt_version"],
            trace_id=judge_data["trace_id"],
            observation_id=judge_data["observation_id"],
            usage_cost=_usage_cost(usage_data) if usage_data is not None else None,
        )
    return CaseResult(
        case_id=payload["case_id"],
        trace_id=payload["trace_id"],
        response=payload["response"],
        deterministic_scores=payload["deterministic_scores"],
        deterministic_reasons=payload["deterministic_reasons"],
        tool_evidence=tuple(_tool_evidence(item) for item in payload["tool_evidence"]),
        judge=judge,
        usage_costs=tuple(_usage_cost(item) for item in payload["usage_costs"]),
        status=payload["status"],
    )


class SQLiteWorkbenchRepository:
    """Persist immutable workbench snapshots and evaluation artifacts in SQLite."""

    def __init__(self, db_path: Path):
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(SCHEMA_V1)

    @property
    def db_path(self) -> Path:
        return self._db_path

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @staticmethod
    def _require(row: sqlite3.Row | None, identifier: str) -> sqlite3.Row:
        if row is None:
            raise KeyError(identifier)
        return row

    @staticmethod
    def _agent(row: sqlite3.Row) -> AgentProfile:
        return AgentProfile(**dict(row))

    def create_agent(self, name: str, description: str) -> AgentProfile:
        agent = AgentProfile(_new_id(), name, description, 0, _now())
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO agents VALUES (?, ?, ?, ?, ?)",
                (agent.agent_id, agent.name, agent.description, agent.current_revision, agent.created_at),
            )
        return agent

    def list_agents(self) -> list[AgentProfile]:
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM agents ORDER BY created_at, agent_id").fetchall()
        return [self._agent(row) for row in rows]

    def get_agent(self, agent_id: str) -> AgentProfile:
        with self._connect() as connection:
            row = self._require(
                connection.execute("SELECT * FROM agents WHERE agent_id = ?", (agent_id,)).fetchone(),
                agent_id,
            )
        return self._agent(row)

    def create_agent_revision(
        self,
        agent_id: str,
        config_snapshot: dict,
        tools: tuple[ToolBinding, ...],
    ) -> AgentRevision:
        revision_id = _new_id()
        created_at = _now()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            agent = self._require(
                connection.execute("SELECT current_revision FROM agents WHERE agent_id = ?", (agent_id,)).fetchone(),
                agent_id,
            )
            revision_number = agent["current_revision"] + 1
            connection.execute(
                "INSERT INTO agent_revisions VALUES (?, ?, ?, ?, ?)",
                (revision_id, agent_id, revision_number, _json(config_snapshot), created_at),
            )
            connection.executemany(
                "INSERT INTO agent_revision_tools VALUES (?, ?, ?)",
                [(revision_id, tool.tool_id, _model_json(tool)) for tool in tools],
            )
            connection.execute(
                "UPDATE agents SET current_revision = ? WHERE agent_id = ?",
                (revision_number, agent_id),
            )
        return AgentRevision(revision_id, agent_id, revision_number, config_snapshot, tools, created_at)

    def get_agent_revision(self, revision_id: str) -> AgentRevision:
        with self._connect() as connection:
            row = self._require(
                connection.execute(
                    "SELECT * FROM agent_revisions WHERE revision_id = ?", (revision_id,)
                ).fetchone(),
                revision_id,
            )
            tool_rows = connection.execute(
                "SELECT tool_json FROM agent_revision_tools WHERE revision_id = ? ORDER BY tool_id",
                (revision_id,),
            ).fetchall()
        return AgentRevision(
            revision_id=row["revision_id"],
            agent_id=row["agent_id"],
            revision=row["revision"],
            config_snapshot=json.loads(row["config_json"]),
            tools=tuple(ToolBinding(**json.loads(tool_row["tool_json"])) for tool_row in tool_rows),
            created_at=row["created_at"],
        )

    def create_dataset(self, agent_id: str, name: str) -> str:
        dataset_id = _new_id()
        with self._connect() as connection:
            self._require(
                connection.execute("SELECT agent_id FROM agents WHERE agent_id = ?", (agent_id,)).fetchone(),
                agent_id,
            )
            connection.execute(
                "INSERT INTO datasets VALUES (?, ?, ?, ?, ?)",
                (dataset_id, agent_id, name, 0, _now()),
            )
        return dataset_id

    def replace_draft_cases(self, dataset_id: str, cases: list[TestCase]) -> None:
        with self._connect() as connection:
            self._require(
                connection.execute("SELECT dataset_id FROM datasets WHERE dataset_id = ?", (dataset_id,)).fetchone(),
                dataset_id,
            )
            connection.execute("DELETE FROM dataset_draft_cases WHERE dataset_id = ?", (dataset_id,))
            connection.executemany(
                "INSERT INTO dataset_draft_cases VALUES (?, ?, ?, ?)",
                [(dataset_id, case.case_id, position, _model_json(case)) for position, case in enumerate(cases)],
            )

    def list_draft_cases(self, dataset_id: str) -> list[TestCase]:
        with self._connect() as connection:
            self._require(
                connection.execute("SELECT dataset_id FROM datasets WHERE dataset_id = ?", (dataset_id,)).fetchone(),
                dataset_id,
            )
            rows = connection.execute(
                "SELECT case_json FROM dataset_draft_cases WHERE dataset_id = ? ORDER BY position",
                (dataset_id,),
            ).fetchall()
        return [TestCase(**json.loads(row["case_json"])) for row in rows]

    def add_dataset_generation_cost(self, dataset_id: str, cost: UsageCost) -> None:
        with self._connect() as connection:
            self._require(
                connection.execute("SELECT dataset_id FROM datasets WHERE dataset_id = ?", (dataset_id,)).fetchone(),
                dataset_id,
            )
            connection.execute(
                "INSERT INTO dataset_draft_usage_costs VALUES (?, ?, ?)",
                (dataset_id, _new_id(), _model_json(cost)),
            )

    def publish_dataset(self, dataset_id: str) -> DatasetRevision:
        revision_id = _new_id()
        created_at = _now()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            dataset = self._require(
                connection.execute("SELECT * FROM datasets WHERE dataset_id = ?", (dataset_id,)).fetchone(),
                dataset_id,
            )
            revision_number = dataset["current_revision"] + 1
            case_rows = connection.execute(
                "SELECT case_id, position, case_json FROM dataset_draft_cases WHERE dataset_id = ? ORDER BY position",
                (dataset_id,),
            ).fetchall()
            cost_rows = connection.execute(
                "SELECT usage_json FROM dataset_draft_usage_costs WHERE dataset_id = ? ORDER BY rowid",
                (dataset_id,),
            ).fetchall()
            costs = tuple(_usage_cost(json.loads(cost_row["usage_json"])) for cost_row in cost_rows)
            connection.execute(
                "INSERT INTO dataset_revisions VALUES (?, ?, ?, ?, ?, ?)",
                (revision_id, dataset_id, dataset["agent_id"], revision_number, _json([asdict(cost) for cost in costs]), created_at),
            )
            connection.executemany(
                "INSERT INTO dataset_revision_cases VALUES (?, ?, ?, ?)",
                [
                    (revision_id, case_row["case_id"], case_row["position"], case_row["case_json"])
                    for case_row in case_rows
                ],
            )
            connection.execute(
                "UPDATE datasets SET current_revision = ? WHERE dataset_id = ?",
                (revision_number, dataset_id),
            )
        return DatasetRevision(
            revision_id,
            dataset_id,
            dataset["agent_id"],
            dataset["name"],
            revision_number,
            tuple(TestCase(**json.loads(case_row["case_json"])) for case_row in case_rows),
            created_at,
            costs,
        )

    def get_dataset_revision(self, revision_id: str) -> DatasetRevision:
        with self._connect() as connection:
            row = self._require(
                connection.execute(
                    """
                    SELECT dataset_revisions.*, datasets.name
                    FROM dataset_revisions JOIN datasets USING (dataset_id)
                    WHERE revision_id = ?
                    """,
                    (revision_id,),
                ).fetchone(),
                revision_id,
            )
            case_rows = connection.execute(
                "SELECT case_json FROM dataset_revision_cases WHERE revision_id = ? ORDER BY position",
                (revision_id,),
            ).fetchall()
        return DatasetRevision(
            revision_id=row["revision_id"],
            dataset_id=row["dataset_id"],
            agent_id=row["agent_id"],
            name=row["name"],
            revision=row["revision"],
            cases=tuple(TestCase(**json.loads(case_row["case_json"])) for case_row in case_rows),
            created_at=row["created_at"],
            generation_costs=tuple(_usage_cost(cost) for cost in json.loads(row["generation_costs_json"])),
        )

    def create_run(self, agent_revision_id: str, dataset_revision_id: str) -> EvalRun:
        with self._connect() as connection:
            agent_revision = self._require(
                connection.execute(
                    "SELECT agent_id FROM agent_revisions WHERE revision_id = ?", (agent_revision_id,)
                ).fetchone(),
                agent_revision_id,
            )
            dataset_revision = self._require(
                connection.execute(
                    "SELECT agent_id FROM dataset_revisions WHERE revision_id = ?", (dataset_revision_id,)
                ).fetchone(),
                dataset_revision_id,
            )
            if agent_revision["agent_id"] != dataset_revision["agent_id"]:
                raise ValueError("agent revision and dataset revision belong to different agents")
            run = EvalRun(
                _new_id(),
                agent_revision["agent_id"],
                agent_revision_id,
                dataset_revision_id,
                RunStatus.QUEUED,
                _now(),
                None,
                "v1",
            )
            connection.execute(
                "INSERT INTO eval_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    run.run_id,
                    run.agent_id,
                    run.agent_revision_id,
                    run.dataset_revision_id,
                    run.status.value,
                    run.started_at,
                    run.completed_at,
                    run.evaluator_version,
                ),
            )
        return run

    def save_case_result(self, run_id: str, result: CaseResult) -> None:
        with self._connect() as connection:
            self._require(
                connection.execute("SELECT run_id FROM eval_runs WHERE run_id = ?", (run_id,)).fetchone(),
                run_id,
            )
            connection.execute(
                "INSERT OR REPLACE INTO case_results VALUES (?, ?, ?)",
                (run_id, result.case_id, _model_json(result)),
            )
            connection.execute(
                "DELETE FROM tool_evidence WHERE run_id = ? AND case_id = ?", (run_id, result.case_id)
            )
            connection.execute(
                "DELETE FROM judge_scores WHERE run_id = ? AND case_id = ?", (run_id, result.case_id)
            )
            connection.execute(
                "DELETE FROM usage_costs WHERE run_id = ? AND case_id = ?", (run_id, result.case_id)
            )
            connection.executemany(
                "INSERT INTO tool_evidence VALUES (?, ?, ?, ?)",
                [
                    (run_id, result.case_id, evidence.call_id, _model_json(evidence))
                    for evidence in result.tool_evidence
                ],
            )
            if result.judge is not None:
                connection.executemany(
                    "INSERT INTO judge_scores VALUES (?, ?, ?, ?, ?)",
                    [
                        (
                            run_id,
                            result.case_id,
                            dimension,
                            score,
                            result.judge.reasons.get(dimension, ""),
                        )
                        for dimension, score in result.judge.scores.items()
                    ],
                )
            connection.executemany(
                "INSERT INTO usage_costs VALUES (?, ?, ?, ?, ?)",
                [
                    (run_id, result.case_id, cost.category, cost.model, _model_json(cost))
                    for cost in result.usage_costs
                ],
            )

    def finish_run(self, run_id: str, status: RunStatus) -> EvalRun:
        with self._connect() as connection:
            self._require(
                connection.execute("SELECT run_id FROM eval_runs WHERE run_id = ?", (run_id,)).fetchone(),
                run_id,
            )
            connection.execute(
                "UPDATE eval_runs SET status = ?, completed_at = ? WHERE run_id = ?",
                (status.value, _now(), run_id),
            )
        return self.get_run(run_id)

    def get_run(self, run_id: str) -> EvalRun:
        with self._connect() as connection:
            row = self._require(
                connection.execute("SELECT * FROM eval_runs WHERE run_id = ?", (run_id,)).fetchone(), run_id
            )
            result_rows = connection.execute(
                "SELECT result_json FROM case_results WHERE run_id = ? ORDER BY case_id", (run_id,)
            ).fetchall()
        return EvalRun(
            run_id=row["run_id"],
            agent_id=row["agent_id"],
            agent_revision_id=row["agent_revision_id"],
            dataset_revision_id=row["dataset_revision_id"],
            status=RunStatus(row["status"]),
            started_at=row["started_at"],
            completed_at=row["completed_at"],
            evaluator_version=row["evaluator_version"],
            case_results=tuple(_case_result(json.loads(result_row["result_json"])) for result_row in result_rows),
        )

    def list_runs(self, agent_id: str) -> list[EvalRun]:
        with self._connect() as connection:
            run_ids = connection.execute(
                "SELECT run_id FROM eval_runs WHERE agent_id = ? ORDER BY started_at DESC, run_id DESC", (agent_id,)
            ).fetchall()
        return [self.get_run(row["run_id"]) for row in run_ids]

    def save_report(
        self, run_id: str, status: str, summary: dict, markdown_path: Path
    ) -> ReportSnapshot:
        report = ReportSnapshot(_new_id(), run_id, 0, status, summary, str(markdown_path), _now())
        with self._connect() as connection:
            self._require(
                connection.execute("SELECT run_id FROM eval_runs WHERE run_id = ?", (run_id,)).fetchone(), run_id
            )
            connection.execute("BEGIN IMMEDIATE")
            artifact_version = connection.execute(
                "SELECT COALESCE(MAX(artifact_version), 0) + 1 FROM reports WHERE run_id = ?", (run_id,)
            ).fetchone()[0]
            report = ReportSnapshot(
                report.report_id,
                report.run_id,
                artifact_version,
                report.status,
                report.summary,
                report.markdown_path,
                report.created_at,
            )
            connection.execute(
                "INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    report.report_id,
                    report.run_id,
                    report.artifact_version,
                    report.status,
                    _json(report.summary),
                    report.markdown_path,
                    report.created_at,
                ),
            )
        return report

    def get_report(self, report_id: str) -> ReportSnapshot:
        with self._connect() as connection:
            row = self._require(
                connection.execute("SELECT * FROM reports WHERE report_id = ?", (report_id,)).fetchone(), report_id
            )
        return ReportSnapshot(
            report_id=row["report_id"],
            run_id=row["run_id"],
            artifact_version=row["artifact_version"],
            status=row["status"],
            summary=json.loads(row["summary_json"]),
            markdown_path=row["markdown_path"],
            created_at=row["created_at"],
        )

    def list_reports(self, agent_id: str) -> list[ReportSnapshot]:
        with self._connect() as connection:
            report_ids = connection.execute(
                """
                SELECT reports.report_id FROM reports
                JOIN eval_runs ON eval_runs.run_id = reports.run_id
                WHERE eval_runs.agent_id = ?
                ORDER BY reports.created_at DESC, reports.report_id DESC
                """,
                (agent_id,),
            ).fetchall()
        return [self.get_report(row["report_id"]) for row in report_ids]
