from fastapi import APIRouter, Depends

from src.sqlite_workbench import SQLiteWorkbenchRepository

from ..deps import get_repository
from ..dto import run_to_dto
from ..evaluator import advance_run as real_advance


router = APIRouter(prefix="/api/v1/evaluations/runs", tags=["runs"])


def _dto(run, repository: SQLiteWorkbenchRepository) -> dict:
    target_revision = repository.get_agent_revision(run.agent_revision_id)
    dataset_revision = repository.get_dataset_revision(run.dataset_revision_id)
    report = next(
        (
            item
            for item in repository.list_reports(run.agent_id)
            if item.run_id == run.run_id
        ),
        None,
    )
    return run_to_dto(
        run,
        target_revision,
        dataset_revision,
        report.report_id if report else None,
    )


@router.post("")
def create_run(
    payload: dict,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    run = repository.create_run(
        payload["targetRevisionId"],
        payload["datasetRevisionId"],
        run_id=payload.get("id"),
        created_at=payload.get("createdAt"),
        started_at=payload.get("startedAt"),
    )
    return _dto(run, repository)


@router.get("/{run_id}")
def get_run(
    run_id: str,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    return _dto(repository.get_run(run_id), repository)


@router.post("/{run_id}/advance")
def advance(
    run_id: str,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    run = repository.get_run(run_id)
    dataset_revision = repository.get_dataset_revision(run.dataset_revision_id)
    if not all("tool" in case.expected_output for case in dataset_revision.cases):
        raise NotImplementedError("runner only supports permission-shaped datasets")
    finished = real_advance(repository, run_id)
    return _dto(finished, repository)
