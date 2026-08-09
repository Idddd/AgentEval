from pathlib import Path

from src.api.demo_seed import load_demo_fixtures, seed_demo_fixtures
from src.api.evaluator import advance_run, evaluate_permission_case
from src.sqlite_workbench import SQLiteWorkbenchRepository


FIXTURES_PATH = Path(__file__).resolve().parent.parent / "src" / "api" / "demo_fixtures.json"


def _seeded_run(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "wb.db")
    fixtures = load_demo_fixtures(FIXTURES_PATH)
    seed_demo_fixtures(repo, fixtures, tmp_path / "reports")
    run_fixture = fixtures["runs"][0]
    run = repo.create_run(
        run_fixture["targetRevisionId"],
        run_fixture["datasetRevisionId"],
        run_id="run-new",
        created_at="2026-08-05T00:00:00.000Z",
        started_at="2026-08-05T00:00:00.000Z",
    )
    return repo, fixtures, run


def test_injected_regression_at_index_four(tmp_path):
    repo, fixtures, _run = _seeded_run(tmp_path)
    dataset_revision = repo.get_dataset_revision(
        fixtures["runs"][0]["datasetRevisionId"]
    )
    case = dataset_revision.cases[4]
    result = evaluate_permission_case(case, 4, "run-new")
    assert result.status == "FAIL"
    assert result.deterministic_reasons["actual_outcome"] == "ALLOW"
    assert result.deterministic_scores["judge_score"] == 0.25


def test_advance_completes_run_and_persists_results(tmp_path):
    repo, _fixtures, run = _seeded_run(tmp_path)
    finished = advance_run(repo, run.run_id)
    assert finished.status.value == "COMPLETED"
    assert len(finished.case_results) == 6
    assert any(item.status == "FAIL" for item in finished.case_results)
    reopened = SQLiteWorkbenchRepository(tmp_path / "wb.db")
    assert len(reopened.get_run(run.run_id).case_results) == 6
