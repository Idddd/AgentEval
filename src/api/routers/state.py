from fastapi import APIRouter, Depends

from src.sqlite_workbench import SQLiteWorkbenchRepository

from ..deps import DEMO_FIXTURES_PATH, get_repository
from ..demo_seed import load_demo_fixtures
from ..dto import (
    agent_profile_to_target,
    agent_revision_to_target_revision,
    dataset_profile_to_record,
    dataset_revision_to_dto,
    report_to_dto,
    run_to_dto,
)


router = APIRouter(prefix="/api/v1/evaluations", tags=["state"])


def build_state(repository: SQLiteWorkbenchRepository) -> dict:
    fixtures = load_demo_fixtures(DEMO_FIXTURES_PATH)
    targets: list[dict] = []
    target_revisions: list[dict] = []
    datasets: list[dict] = []
    dataset_revisions: list[dict] = []
    runs: list[dict] = []
    reports: list[dict] = []
    report_by_run: dict[str, str] = {}
    for agent in repository.list_agents():
        revisions = repository.list_agent_revisions(agent.agent_id)
        current = repository.get_current_agent_revision(agent.agent_id)
        targets.append(
            agent_profile_to_target(agent, current.revision_id if current else None)
        )
        target_revisions.extend(
            agent_revision_to_target_revision(revision) for revision in revisions
        )
        for profile in repository.list_datasets(agent.agent_id):
            cases = repository.list_draft_cases(profile.dataset_id)
            current_ds = repository.get_current_dataset_revision(profile.dataset_id)
            datasets.append(
                dataset_profile_to_record(
                    profile, cases, current_ds.revision_id if current_ds else None
                )
            )
            dataset_revisions.extend(
                dataset_revision_to_dto(revision)
                for revision in repository.list_dataset_revisions(profile.dataset_id)
            )
        for run in repository.list_runs(agent.agent_id):
            target_revision = repository.get_agent_revision(run.agent_revision_id)
            dataset_revision = repository.get_dataset_revision(
                run.dataset_revision_id
            )
            report = next(
                (
                    item
                    for item in repository.list_reports(agent.agent_id)
                    if item.run_id == run.run_id
                ),
                None,
            )
            if report:
                report_by_run[run.run_id] = report.report_id
                reports.append(report_to_dto(report, run))
            runs.append(
                run_to_dto(
                    run,
                    target_revision,
                    dataset_revision,
                    report_by_run.get(run.run_id),
                )
            )
    runs.sort(key=lambda item: item["createdAt"], reverse=True)
    reports.sort(key=lambda item: item["createdAt"], reverse=True)
    return {
        "targets": targets,
        "targetRevisions": target_revisions,
        "datasets": datasets,
        "datasetRevisions": dataset_revisions,
        "runs": runs,
        "reports": reports,
        "reflections": fixtures["reflections"],
    }


@router.get("/state")
def get_state(
    repository: SQLiteWorkbenchRepository = Depends(get_repository),
) -> dict:
    return build_state(repository)
