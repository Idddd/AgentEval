import json
import sqlite3

import pytest

from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import (
    CaseResult,
    DatasetColumn,
    DatasetSchema,
    DEFAULT_DATASET_SCHEMA,
    JudgeResult,
    RunStatus,
    TestCase as WorkbenchTestCase,
    ToolBinding,
    ToolEvidence,
    UsageCost,
)


def tool(name="Lookup"):
    return ToolBinding(
        "lookup",
        name,
        "Lookup data",
        "python",
        {"callable": "lookup"},
        {"type": "object"},
        {"type": "object"},
        {},
        ("Return a result",),
        False,
        True,
    )


def test_agent_revision_and_dataset_revision_survive_restart(tmp_path):
    db = tmp_path / "workbench.db"
    repo = SQLiteWorkbenchRepository(db)
    agent = repo.create_agent("Agent A", "General agent")
    revision = repo.create_agent_revision(agent.agent_id, {"model": "m1"}, (tool(),))
    dataset_id = repo.create_dataset(agent.agent_id, "Regression")
    repo.replace_draft_cases(
        dataset_id,
        [WorkbenchTestCase("case-1", {"query": "look up A"}, {"expected_tool_called": "lookup"})],
    )
    dataset_revision = repo.publish_dataset(dataset_id)

    reopened = SQLiteWorkbenchRepository(db)
    assert reopened.get_agent(agent.agent_id).current_revision == 1
    assert reopened.get_agent_revision(revision.revision_id).tools[0].tool_id == "lookup"
    assert reopened.get_dataset_revision(dataset_revision.revision_id).cases[0].case_id == "case-1"


def test_current_agent_revision_returns_none_for_drafts_and_the_current_snapshot(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    draft = repo.create_agent("Draft", "No revision yet")
    agent = repo.create_agent("Versioned", "Has revisions")
    first = repo.create_agent_revision(agent.agent_id, {"model": "v1"}, (tool(),))
    current = repo.create_agent_revision(agent.agent_id, {"model": "v2"}, (tool(),))

    assert repo.get_current_agent_revision(draft.agent_id) is None
    assert repo.get_current_agent_revision(agent.agent_id) == current
    assert repo.get_current_agent_revision(agent.agent_id) != first
    with pytest.raises(KeyError):
        repo.get_current_agent_revision("missing-agent")


def test_create_agent_with_revision_is_atomic_on_invalid_configuration(tmp_path):
    """A failed first Revision must never leave an unversioned Target behind."""
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")

    with pytest.raises(ValueError, match="secret values"):
        repo.create_agent_with_revision(
            "Unsafe Target",
            "",
            {"model": "test", "api_key": "plaintext-secret"},
            (),
        )

    assert repo.list_agents() == []


def test_agent_ownership_is_enforced(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    first = repo.create_agent("First", "")
    second = repo.create_agent("Second", "")
    revision = repo.create_agent_revision(first.agent_id, {}, (tool(),))
    dataset_id = repo.create_dataset(second.agent_id, "Other dataset")
    dataset_revision = repo.publish_dataset(dataset_id)
    try:
        repo.create_run(revision.revision_id, dataset_revision.revision_id)
    except ValueError as error:
        assert str(error) == "agent revision and dataset revision belong to different agents"
    else:
        raise AssertionError("cross-agent run must be rejected")


def test_reopened_revision_snapshots_remain_deeply_immutable(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Frozen", "")
    revision = repo.create_agent_revision(
        agent.agent_id,
        {"model": {"names": {"m1"}}},
        (tool(),),
    )
    loaded = SQLiteWorkbenchRepository(repo.db_path).get_agent_revision(revision.revision_id)

    try:
        loaded.config_snapshot["model"]["names"].add("m2")
    except AttributeError:
        pass
    else:
        raise AssertionError("nested persisted sets must remain immutable")


def test_run_results_and_reports_round_trip(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Artifacts", "")
    agent_revision = repo.create_agent_revision(agent.agent_id, {}, ())
    dataset_id = repo.create_dataset(agent.agent_id, "Dataset")
    case = WorkbenchTestCase("case-1", {"query": "hello"}, {})
    repo.replace_draft_cases(dataset_id, [case])
    repo.add_dataset_generation_cost(dataset_id, UsageCost("dataset", "m1", 1, 2, 0, 0, 0.01))
    dataset_revision = repo.publish_dataset(dataset_id)
    run = repo.create_run(agent_revision.revision_id, dataset_revision.revision_id)
    result = CaseResult(
        "case-1",
        "trace-1",
        "answer",
        {"execution_correctness": 1.0},
        {"execution_correctness": "called"},
        (
            ToolEvidence(
                "call-1", "lookup", True, True, True, None, False, {"q": "hello"},
                {"q": "hello"}, {"found": True}, None, "trace-1", None, None, None, 1.0, None,
            ),
        ),
        JudgeResult(
            {"correctness": 4, "relevance": 4, "completeness": 4, "safety": 4},
            {"correctness": "ok", "relevance": "ok", "completeness": "ok", "safety": "ok"},
            "pass", "judge", "v1", "judge-trace", None,
        ),
        (UsageCost("agent", "m1", 1, 2, 0, 0, 0.02),),
        "PASS",
    )
    repo.save_case_result(run.run_id, result)
    completed = repo.finish_run(run.run_id, RunStatus.COMPLETED)
    first_report = repo.save_report(run.run_id, "PASS", {"score": 4}, tmp_path / "first.md")
    second_report = repo.save_report(run.run_id, "PASS", {"score": 5}, tmp_path / "second.md")

    reopened = SQLiteWorkbenchRepository(repo.db_path)
    loaded = reopened.get_run(run.run_id)
    assert completed.status is RunStatus.COMPLETED
    assert loaded.case_results == (result,)
    assert reopened.list_runs(agent.agent_id) == [loaded]
    traces = reopened.list_traces(agent.agent_id)
    assert len(traces) == 1
    assert traces[0].trace_id == "trace-1"
    assert traces[0].observation_count == 2
    assert traces[0].latency_ms == 1.0
    assert traces[0].cost_usd == 0.02
    assert reopened.get_trace("trace-1").result == result
    with pytest.raises(KeyError):
        reopened.get_trace("missing-trace")
    assert dataset_revision.generation_costs[0].cost_usd == 0.01
    assert (first_report.artifact_version, second_report.artifact_version) == (1, 2)
    assert reopened.get_report(second_report.report_id).summary == {"score": 5}
    assert reopened.list_reports(agent.agent_id) == [second_report, first_report]


def test_rejects_raw_secret_values_but_accepts_secret_references(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Secure", "")

    with pytest.raises(ValueError):
        repo.create_agent_revision(agent.agent_id, {"api_key": "sk-live-secret"}, ())

    with pytest.raises(ValueError):
        repo.create_agent_revision(
            agent.agent_id,
            {},
            (
                ToolBinding(
                    "secure", "Secure", "", "python", {"token": "raw-secret"}, {}, {}, {}, (), False, True
                ),
            ),
        )

    revision = repo.create_agent_revision(
        agent.agent_id,
        {"api_key": {"env": "OPENAI_API_KEY"}},
        (
            ToolBinding(
                "secure", "Secure", "", "python", {"token": "secret://workbench/tool-token"}, {}, {}, {}, (), False, True
            ),
        ),
    )
    assert revision.revision == 1


def test_terminal_run_rejects_result_changes_and_status_rewrites(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Terminal", "")
    agent_revision = repo.create_agent_revision(agent.agent_id, {}, ())
    dataset_id = repo.create_dataset(agent.agent_id, "Dataset")
    repo.replace_draft_cases(dataset_id, [WorkbenchTestCase("case-1", {}, {})])
    run = repo.create_run(agent_revision.revision_id, repo.publish_dataset(dataset_id).revision_id)
    repo.finish_run(run.run_id, RunStatus.COMPLETED)
    replacement = CaseResult("case-1", "trace-1", "changed", {}, {}, (), None, (), "PASS")

    with pytest.raises(ValueError):
        repo.save_case_result(run.run_id, replacement)
    with pytest.raises(ValueError):
        repo.finish_run(run.run_id, RunStatus.FAILED)


def test_nested_set_and_frozenset_snapshots_round_trip_exactly(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Collections", "")
    revision = repo.create_agent_revision(
        agent.agent_id,
        {"nested": {"set": {"a", "b"}, "frozenset": frozenset({"c", "d"})}},
        (),
    )

    loaded = SQLiteWorkbenchRepository(repo.db_path).get_agent_revision(revision.revision_id)
    snapshot = loaded.config_snapshot["nested"]
    assert snapshot == revision.config_snapshot["nested"]
    assert isinstance(snapshot["set"], frozenset)
    assert isinstance(snapshot["frozenset"], frozenset)


def test_reloaded_run_artifacts_and_report_summary_are_deeply_immutable(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Immutable artifacts", "")
    agent_revision = repo.create_agent_revision(agent.agent_id, {}, ())
    dataset_id = repo.create_dataset(agent.agent_id, "Dataset")
    repo.replace_draft_cases(dataset_id, [WorkbenchTestCase("case-1", {}, {})])
    run = repo.create_run(agent_revision.revision_id, repo.publish_dataset(dataset_id).revision_id)
    result = CaseResult(
        "case-1", "trace-1", "answer", {"score": 1.0}, {"score": "reason"},
        (ToolEvidence("call-1", "tool", True, True, True, None, False, {"nested": {"value": 1}}, None,
                      {"output": {"value": 1}}, None, "trace-1", None, None, None, None, None),),
        JudgeResult(
            {"correctness": 4, "relevance": 4, "completeness": 4, "safety": 4},
            {"correctness": "ok", "relevance": "ok", "completeness": "ok", "safety": "ok"},
            "pass", "judge", "v1", "judge-trace", None,
        ),
        (), "PASS",
    )
    repo.save_case_result(run.run_id, result)
    report = repo.save_report(run.run_id, "PASS", {"nested": {"value": 1}}, tmp_path / "report.md")
    reopened = SQLiteWorkbenchRepository(repo.db_path)
    loaded_result = reopened.get_run(run.run_id).case_results[0]
    loaded_report = reopened.get_report(report.report_id)

    with pytest.raises(TypeError):
        loaded_result.deterministic_scores["score"] = 0.0
    with pytest.raises(TypeError):
        loaded_result.tool_evidence[0].requested_arguments["nested"]["value"] = 2
    with pytest.raises(TypeError):
        loaded_result.judge.scores["safety"] = 1
    with pytest.raises(TypeError):
        loaded_report.summary["nested"]["value"] = 2
    with pytest.raises(TypeError):
        report.summary["nested"]["value"] = 2


def test_secret_validation_ignores_tool_schemas_permissions_and_descriptions(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Schema fields", "auth documentation")
    schema_tool = ToolBinding(
        "schema", "Schema", "authorization is an output label", "python", {},
        {"properties": {"max_tokens": {"type": "integer"}, "token_count": {"type": "integer"}}},
        {"properties": {"access_token": {"type": "string"}}},
        {"authorization": "domain-policy-value"}, (), False, True,
    )

    revision = repo.create_agent_revision(agent.agent_id, {}, (schema_tool,))
    assert revision.tools == (schema_tool,)


def test_exact_credential_keys_require_references_and_normal_urls_are_allowed(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Credentials", "")

    with pytest.raises(ValueError):
        repo.create_agent_revision(agent.agent_id, {"auth": "plain"}, ())

    normal_url = ToolBinding("url", "URL", "", "http", {"url": "https://api.example.test/v1"}, {}, {}, {}, (), False, True)
    revision = repo.create_agent_revision(
        agent.agent_id,
        {"auth": {"env": "SERVICE_AUTH"}},
        (normal_url,),
    )
    assert revision.revision == 1


def test_connection_urls_with_inline_credentials_are_rejected(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Connection", "")
    credential_url = ToolBinding(
        "url", "URL", "", "http", {"url": "https://user:password@api.example.test/v1"}, {}, {}, {}, (), False, True
    )

    with pytest.raises(ValueError):
        repo.create_agent_revision(agent.agent_id, {}, (credential_url,))
    with pytest.raises(ValueError):
        repo.create_agent_revision(agent.agent_id, {"endpoint": "https://user:password@api.example.test/v1"}, ())


def test_collection_tag_shaped_user_dictionary_round_trips_unchanged(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Tag collision", "")
    envelope = {"__workbench_collection__": "set", "items": ["ordinary", "user", "data"]}
    revision = repo.create_agent_revision(agent.agent_id, {"payload": envelope}, ())

    loaded = SQLiteWorkbenchRepository(repo.db_path).get_agent_revision(revision.revision_id)
    assert loaded.config_snapshot["payload"] == revision.config_snapshot["payload"]
    assert isinstance(loaded.config_snapshot["payload"], dict)


def _seed_v1_dataset(db_path) -> tuple[str, str]:
    """Create a database using only the original V1 schema (no description/schema_json)."""
    connection = sqlite3.connect(db_path)
    connection.executescript(
        """
        CREATE TABLE agents (
          agent_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
          current_revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
        );
        CREATE TABLE datasets (
          dataset_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL,
          name TEXT NOT NULL, current_revision INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        PRAGMA user_version = 1;
        """
    )
    agent_id = "agent-legacy"
    dataset_id = "dataset-legacy"
    connection.execute(
        "INSERT INTO agents VALUES (?, ?, ?, ?, ?)",
        (agent_id, "Legacy Agent", "", 0, "2026-07-31T00:00:00+00:00"),
    )
    connection.execute(
        "INSERT INTO datasets VALUES (?, ?, ?, ?, ?)",
        (dataset_id, agent_id, "Legacy Dataset", 0, "2026-07-31T00:00:00+00:00"),
    )
    connection.commit()
    connection.close()
    return agent_id, dataset_id


def test_legacy_database_is_migrated_with_default_schema_backfill(tmp_path):
    db_path = tmp_path / "legacy.db"
    agent_id, dataset_id = _seed_v1_dataset(db_path)

    repo = SQLiteWorkbenchRepository(db_path)

    with repo._connect() as connection:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        description = connection.execute(
            "SELECT description FROM datasets WHERE dataset_id = ?", (dataset_id,)
        ).fetchone()[0]
        schema_json = connection.execute(
            "SELECT schema_json FROM datasets WHERE dataset_id = ?", (dataset_id,)
        ).fetchone()[0]

    assert version == 2
    assert description == ""
    assert json.loads(schema_json)["columns"] == json.loads(_dataset_schema_json(DEFAULT_DATASET_SCHEMA))["columns"]
    assert repo.get_dataset_schema(dataset_id) == DEFAULT_DATASET_SCHEMA


def _dataset_schema_json(schema: DatasetSchema) -> str:
    from dataclasses import asdict
    return json.dumps(asdict(schema), sort_keys=True)


def test_create_dataset_persists_description_and_schema_and_round_trips(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Agent", "")
    custom_schema = DatasetSchema(
        columns=(
            DatasetColumn("prompt", "input", "string", required=True, description="the prompt"),
            DatasetColumn("context", "input", "json", required=False),
            DatasetColumn("expected_label", "output", "string", required=True),
            DatasetColumn("score", "output", "number", required=False),
        )
    )

    dataset_id = repo.create_dataset(
        agent.agent_id,
        "Custom schema dataset",
        description="Classifies prompts",
        schema=custom_schema,
    )

    with repo._connect() as connection:
        row = connection.execute(
            "SELECT name, description, schema_json FROM datasets WHERE dataset_id = ?",
            (dataset_id,),
        ).fetchone()

    assert row["name"] == "Custom schema dataset"
    assert row["description"] == "Classifies prompts"
    assert json.loads(row["schema_json"]) == json.loads(_dataset_schema_json(custom_schema))
    assert repo.get_dataset_schema(dataset_id) == custom_schema


def test_create_dataset_without_schema_falls_back_to_default(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repo.create_agent("Agent", "")
    dataset_id = repo.create_dataset(agent.agent_id, "Default schema")

    assert repo.get_dataset_schema(dataset_id) == DEFAULT_DATASET_SCHEMA


def test_migrated_database_accepts_new_schema_driven_datasets(tmp_path):
    db_path = tmp_path / "legacy.db"
    agent_id, _ = _seed_v1_dataset(db_path)

    repo = SQLiteWorkbenchRepository(db_path)
    new_schema = DatasetSchema(
        columns=(DatasetColumn("instruction", "input", "string", required=True),)
    )
    new_dataset_id = repo.create_dataset(
        agent_id, "Fresh dataset", description="post-migration", schema=new_schema
    )

    assert repo.get_dataset_schema(new_dataset_id) == new_schema
