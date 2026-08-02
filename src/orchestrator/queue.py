"""SQLite-backed marketplace run queue.

States: QUEUED -> RUNNING -> COMPLETED | PARTIAL | FAILED. Terminal states
are immutable; a rerun is a new run. `claim_next` transitions exactly one
QUEUED row to RUNNING so multiple workers cannot double-claim.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

TERMINAL_STATES = {"COMPLETED", "PARTIAL", "FAILED"}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS marketplace_runs (
    run_id       TEXT PRIMARY KEY,
    agent_id     TEXT NOT NULL,
    version      TEXT NOT NULL,
    image_digest TEXT NOT NULL,
    status       TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    started_at   TEXT,
    finished_at  TEXT,
    error        TEXT,
    report_path  TEXT,
    results_json TEXT
)
"""


@dataclass(frozen=True)
class RunRecord:
    run_id: str
    agent_id: str
    version: str
    image_digest: str
    status: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    report_path: str | None = None
    results: dict | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RunQueue:
    def __init__(self, db_path: Path | str):
        self._db_path = str(db_path)
        with self._connect() as conn:
            conn.execute(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path)

    def enqueue(self, agent_id: str, version: str, image_digest: str) -> str:
        run_id = f"mkt-{uuid.uuid4().hex[:12]}"
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO marketplace_runs "
                "(run_id, agent_id, version, image_digest, status, created_at) "
                "VALUES (?, ?, ?, ?, 'QUEUED', ?)",
                (run_id, agent_id, version, image_digest, _now()))
        return run_id

    def claim_next(self) -> RunRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT run_id FROM marketplace_runs WHERE status = 'QUEUED' "
                "ORDER BY created_at LIMIT 1").fetchone()
            if row is None:
                return None
            updated = conn.execute(
                "UPDATE marketplace_runs SET status = 'RUNNING', started_at = ? "
                "WHERE run_id = ? AND status = 'QUEUED'", (_now(), row[0]))
            if updated.rowcount != 1:
                return None
        return self.get(row[0])

    def finish(self, run_id: str, status: str, *, error: str | None = None,
               report_path: str | None = None, results: dict | None = None) -> None:
        if status not in TERMINAL_STATES:
            raise ValueError(f"'{status}' is not a terminal run state")
        with self._connect() as conn:
            updated = conn.execute(
                "UPDATE marketplace_runs SET status = ?, finished_at = ?, error = ?, "
                "report_path = ?, results_json = ? "
                "WHERE run_id = ? AND status = 'RUNNING'",
                (status, _now(), error, report_path,
                 json.dumps(results) if results is not None else None, run_id))
            if updated.rowcount != 1:
                raise ValueError(
                    f"Run '{run_id}' is not RUNNING; terminal results are immutable")

    def reap_stale(self, max_runtime_s: int = 3600) -> list[str]:
        """Mark RUNNING rows older than the limit as FAILED (worker crash)."""
        cutoff = datetime.now(timezone.utc).timestamp() - max_runtime_s
        reaped = []
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT run_id, started_at FROM marketplace_runs "
                "WHERE status = 'RUNNING'").fetchall()
            for run_id, started_at in rows:
                started = datetime.fromisoformat(started_at).timestamp() if started_at else 0
                if started < cutoff:
                    conn.execute(
                        "UPDATE marketplace_runs SET status = 'FAILED', finished_at = ?, "
                        "error = 'Orchestrator did not finish this run (stale RUNNING)' "
                        "WHERE run_id = ? AND status = 'RUNNING'", (_now(), run_id))
                    reaped.append(run_id)
        return reaped

    def get(self, run_id: str) -> RunRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT run_id, agent_id, version, image_digest, status, created_at, "
                "started_at, finished_at, error, report_path, results_json "
                "FROM marketplace_runs WHERE run_id = ?", (run_id,)).fetchone()
        return self._to_record(row) if row else None

    def list_runs(self, limit: int = 50) -> list[RunRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT run_id, agent_id, version, image_digest, status, created_at, "
                "started_at, finished_at, error, report_path, results_json "
                "FROM marketplace_runs ORDER BY created_at DESC LIMIT ?",
                (limit,)).fetchall()
        return [self._to_record(row) for row in rows]

    @staticmethod
    def _to_record(row) -> RunRecord:
        return RunRecord(
            run_id=row[0], agent_id=row[1], version=row[2], image_digest=row[3],
            status=row[4], created_at=row[5], started_at=row[6], finished_at=row[7],
            error=row[8], report_path=row[9],
            results=json.loads(row[10]) if row[10] else None)
