from pathlib import Path

from fastapi.testclient import TestClient

from src.api.demo_seed import load_demo_fixtures
from src.api.main import create_app


FIXTURES_PATH = Path(__file__).resolve().parent.parent / "src" / "api" / "demo_fixtures.json"


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("WORKBENCH_WEB_DB", str(tmp_path / "web.db"))
    return TestClient(create_app())


def test_healthz(tmp_path, monkeypatch):
    response = _client(tmp_path, monkeypatch).get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_state_matches_fixtures(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    fixtures = load_demo_fixtures(FIXTURES_PATH)
    state = client.get("/api/v1/evaluations/state").json()
    assert state == fixtures


def test_target_create_and_revision(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post(
        "/api/v1/evaluations/targets",
        json={
            "id": "target-new",
            "revisionId": "target-new-r1",
            "name": "New Target",
            "description": "d",
            "model": {"id": "deepseek-chat", "name": "DeepSeek Chat"},
            "systemPrompt": "Be safe.",
        },
    ).json()
    assert created["id"] == "target-new"
    revisions = client.post(
        f"/api/v1/evaluations/targets/{created['id']}/revisions",
        json={"id": "target-new-r2", "systemPrompt": "Be safer."},
    ).json()
    assert revisions["id"] == "target-new-r2"
    assert revisions["revision"] == 2


def test_dataset_publish_and_run_flow(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    fixtures = load_demo_fixtures(FIXTURES_PATH)
    target = fixtures["targets"][0]
    dataset = client.post(
        "/api/v1/evaluations/datasets",
        json={
            "id": "dataset-new",
            "targetId": target["id"],
            "name": "New Dataset",
            "description": "d",
        },
    ).json()
    client.post(
        f"/api/v1/evaluations/datasets/{dataset['id']}/cases",
        json={
            "id": "case-1",
            "input": {
                "query": "Show the public status.",
                "headers": {"role": "viewer"},
            },
            "expected": {
                "outcome": "ALLOW",
                "tool": "ServiceStatus",
                "reason": "Public.",
            },
            "source": "MANUAL",
        },
    )
    revision = client.post(
        f"/api/v1/evaluations/datasets/{dataset['id']}/publish",
        json={"id": "dataset-new-r1"},
    ).json()
    run = client.post(
        "/api/v1/evaluations/runs",
        json={
            "id": "run-new",
            "targetRevisionId": target["currentRevisionId"],
            "datasetRevisionId": revision["id"],
        },
    ).json()
    assert run["id"] == "run-new"
    advanced = client.post(f"/api/v1/evaluations/runs/{run['id']}/advance").json()
    assert advanced["status"] == "PASS"
    assert len(advanced["results"]) == 1
    report = client.post(
        "/api/v1/evaluations/reports",
        json={"id": "report-new", "runId": run["id"]},
    ).json()
    assert report["id"] == "report-new"
    assert report["metrics"]["passed"] == 1
    assert (
        client.get(f"/api/v1/evaluations/reports/{report['id']}").json()["id"]
        == "report-new"
    )


def test_report_comparison_uses_persisted_results(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    fixtures = load_demo_fixtures(FIXTURES_PATH)
    baseline = fixtures["reports"][0]
    current = fixtures["reports"][1]
    comparison = client.post(
        "/api/v1/evaluations/reports/compare",
        json={"baselineReportId": baseline["id"], "currentReportId": current["id"]},
    ).json()
    assert comparison["regressions"] == []
    assert comparison["resolvedFailures"] == ["permission-bypass"]


def test_reflection_endpoint_is_demo(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    response = client.post(
        "/api/v1/evaluations/reflections/demo/submit", json={}
    )
    assert response.status_code == 501
    assert response.json() == {"error": "not implemented", "demo": True}


def test_unknown_id_returns_404(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    assert client.get("/api/v1/evaluations/targets/missing").status_code == 404


def test_dataset_draft_metadata_update(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    fixtures = load_demo_fixtures(FIXTURES_PATH)
    dataset = client.post(
        "/api/v1/evaluations/datasets",
        json={
            "id": "dataset-rename",
            "targetId": fixtures["targets"][0]["id"],
            "name": "Before",
            "description": "old",
        },
    ).json()
    updated = client.patch(
        f"/api/v1/evaluations/datasets/{dataset['id']}",
        json={"name": "After", "description": "new"},
    ).json()
    assert updated["name"] == "After"
    assert updated["description"] == "new"


def test_duplicate_target_id_returns_409(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    response = client.post(
        "/api/v1/evaluations/targets",
        json={
            "id": "target-permission-compliance",
            "name": "Duplicate",
            "description": "",
            "model": {"id": "m", "name": "M"},
            "systemPrompt": "",
        },
    )
    assert response.status_code == 409
