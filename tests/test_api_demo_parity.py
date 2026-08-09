from pathlib import Path

from src.api.demo_seed import load_demo_fixtures, seed_demo_fixtures
from src.api.dto import (
    agent_profile_to_target,
    agent_revision_to_target_revision,
    dataset_profile_to_record,
    dataset_revision_to_dto,
    report_to_dto,
    run_to_dto,
)
from src.sqlite_workbench import SQLiteWorkbenchRepository


FIXTURES_PATH = Path(__file__).resolve().parent.parent / "src" / "api" / "demo_fixtures.json"


def _state_dict(repo: SQLiteWorkbenchRepository, fixtures: dict) -> dict:
    targets = []
    target_revisions = []
    datasets = []
    dataset_revisions = []
    runs = []
    reports = []
    report_by_run: dict[str, str] = {}
    for agent in repo.list_agents():
        revisions = repo.list_agent_revisions(agent.agent_id)
        current = repo.get_current_agent_revision(agent.agent_id)
        targets.append(
            agent_profile_to_target(agent, current.revision_id if current else None)
        )
        target_revisions.extend(
            agent_revision_to_target_revision(revision) for revision in revisions
        )
        for profile in repo.list_datasets(agent.agent_id):
            cases = repo.list_draft_cases(profile.dataset_id)
            current_ds = repo.get_current_dataset_revision(profile.dataset_id)
            datasets.append(
                dataset_profile_to_record(
                    profile, cases, current_ds.revision_id if current_ds else None
                )
            )
            dataset_revisions.extend(
                dataset_revision_to_dto(revision)
                for revision in repo.list_dataset_revisions(profile.dataset_id)
            )
        for run in repo.list_runs(agent.agent_id):
            target_revision = repo.get_agent_revision(run.agent_revision_id)
            dataset_revision = repo.get_dataset_revision(run.dataset_revision_id)
            report = next(
                (
                    item
                    for item in repo.list_reports(agent.agent_id)
                    if item.run_id == run.run_id
                ),
                None,
            )
            if report:
                report_by_run[run.run_id] = report.report_id
                reports.append(report_to_dto(report, run))
            runs.append(
                run_to_dto(
                    run, target_revision, dataset_revision, report_by_run.get(run.run_id)
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


def test_seed_matches_ui_fixtures(tmp_path):
    fixtures = load_demo_fixtures(FIXTURES_PATH)
    repo = SQLiteWorkbenchRepository(tmp_path / "wb.db")
    seed_demo_fixtures(repo, fixtures, tmp_path / "reports")
    seed_demo_fixtures(repo, fixtures, tmp_path / "reports")  # idempotent
    assert _state_dict(repo, fixtures) == fixtures
