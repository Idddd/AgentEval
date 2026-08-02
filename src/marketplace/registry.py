"""SQLite-backed marketplace registry. Rows are immutable after insert."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .manifest import AgentManifest, parse_manifest

_SCHEMA = """
CREATE TABLE IF NOT EXISTS marketplace_agents (
    agent_id      TEXT NOT NULL,
    version       TEXT NOT NULL,
    image_digest  TEXT NOT NULL,
    protocol      TEXT NOT NULL,
    manifest_yaml TEXT NOT NULL,
    registered_at TEXT NOT NULL,
    PRIMARY KEY (agent_id, version)
)
"""


class DuplicateAgentError(ValueError):
    """The agent_id/version pair is already registered."""


@dataclass(frozen=True)
class RegisteredAgent:
    manifest: AgentManifest
    registered_at: str
    version_count: int = 1


class MarketplaceRegistry:
    def __init__(self, db_path: Path | str):
        self._db_path = str(db_path)
        with self._connect() as conn:
            conn.execute(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self._db_path)

    def register(self, manifest_yaml: str) -> RegisteredAgent:
        manifest = parse_manifest(manifest_yaml)
        registered_at = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            try:
                conn.execute(
                    "INSERT INTO marketplace_agents VALUES (?, ?, ?, ?, ?, ?)",
                    (manifest.agent_id, manifest.version, manifest.image_digest,
                     manifest.protocol, manifest_yaml, registered_at),
                )
            except sqlite3.IntegrityError:
                raise DuplicateAgentError(
                    f"Agent '{manifest.agent_id}' version '{manifest.version}' "
                    f"is already registered; publish a new version instead") from None
        return RegisteredAgent(manifest=manifest, registered_at=registered_at)

    def get(self, agent_id: str, version: str) -> RegisteredAgent | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT manifest_yaml, registered_at FROM marketplace_agents "
                "WHERE agent_id = ? AND version = ?",
                (agent_id, version),
            ).fetchone()
        if row is None:
            return None
        return RegisteredAgent(manifest=parse_manifest(row[0]), registered_at=row[1])

    def list_agents(self) -> list[RegisteredAgent]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT a.manifest_yaml, a.registered_at, s.version_count "
                "FROM marketplace_agents a "
                "JOIN (SELECT agent_id, MAX(registered_at) AS latest, "
                "             COUNT(*) AS version_count "
                "      FROM marketplace_agents GROUP BY agent_id) s "
                "  ON a.agent_id = s.agent_id AND a.registered_at = s.latest "
                "ORDER BY a.agent_id",
            ).fetchall()
        return [RegisteredAgent(manifest=parse_manifest(r[0]), registered_at=r[1],
                                version_count=r[2]) for r in rows]
