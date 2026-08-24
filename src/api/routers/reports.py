from fastapi import APIRouter, Depends

from src.sqlite_workbench import SQLiteWorkbenchRepository

from ..deps import get_repository
from ..dto import build_report_summary, compare_runs_ui, report_to_dto


router = APIRouter(prefix="/api/v1/evaluations/reports", tags=["reports"])


@router.post("")
def create_report(
    payload: dict,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    run = repository.get_run(payload["runId"])
    if not run.case_results:
        raise ValueError("run has no case results")
    summary = build_report_summary(run.case_results)
    status = "FAIL" if summary["metrics"]["failed"] else "PASS"
    report = repository.save_report(
        run.run_id,
        status,
        summary,
        repository.db_path.parent
        / "reports"
        / f"{payload.get('id', run.run_id)}.md",
        report_id=payload.get("id"),
        created_at=payload.get("createdAt"),
    )
    return report_to_dto(report, run)


@router.get("/{report_id}")
def get_report(
    report_id: str,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    report = repository.get_report(report_id)
    return report_to_dto(report, repository.get_run(report.run_id))


@router.get("")
def list_reports(
    target_id: str,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> list[dict]:
    return [
        report_to_dto(item, repository.get_run(item.run_id))
        for item in repository.list_reports(target_id)
    ]


@router.post("/compare")
def compare(
    payload: dict,
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    baseline_report = repository.get_report(payload["baselineReportId"])
    current_report = repository.get_report(payload["currentReportId"])
    return compare_runs_ui(
        repository.get_run(baseline_report.run_id),
        repository.get_run(current_report.run_id),
    )
