"""FastAPI dependency wiring for the web evaluation backend."""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import Request

from src.api.demo_seed import load_demo_fixtures, seed_demo_fixtures
from src.settings import PROJECT_ROOT
from src.sqlite_workbench import SQLiteWorkbenchRepository


DEMO_FIXTURES_PATH = PROJECT_ROOT / "src" / "api" / "demo_fixtures.json"


def build_repository(db_path: Path | None = None) -> SQLiteWorkbenchRepository:
    path = db_path or Path(
        os.getenv(
            "WORKBENCH_WEB_DB",
            str(PROJECT_ROOT / "data" / "web-workbench.db"),
        )
    )
    return SQLiteWorkbenchRepository(path)


def seed_if_needed(repository: SQLiteWorkbenchRepository) -> None:
    fixtures = load_demo_fixtures(DEMO_FIXTURES_PATH)
    seed_demo_fixtures(
        repository, fixtures, repository.db_path.parent / "reports"
    )


def get_repository(request: Request) -> SQLiteWorkbenchRepository:
    """Per-app-state repository so each app instance gets its own SQLite file
    and one idempotent seed."""
    repository = getattr(request.app.state, "repository", None)
    if repository is None:
        repository = build_repository()
        seed_if_needed(repository)
        request.app.state.repository = repository
    return repository
