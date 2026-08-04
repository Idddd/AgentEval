import pytest

from src.agent_registry import AgentRegistry
from src.dataset_registry import DatasetRegistry
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import (
    DatasetColumn,
    DatasetSchema,
    DEFAULT_DATASET_SCHEMA,
    TestCase,
    UsageCost,
)


def test_dataset_draft_is_empty_until_cases_are_explicitly_added(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Empty Agent", "")
    datasets = DatasetRegistry(repo)
    dataset_id = datasets.create(agent.agent_id, "Test dataset")

    assert datasets.list_draft(dataset_id) == []
    datasets.add_cases(
        dataset_id,
        [TestCase("c1", {"query": "hello"}, {"expected_action": "reply"})],
    )
    assert [case.case_id for case in datasets.list_draft(dataset_id)] == ["c1"]


def test_case_mutations_reject_duplicate_ids_and_full_inputs(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Agent", "")
    datasets = DatasetRegistry(repo)
    dataset_id = datasets.create(agent.agent_id, "Draft")
    datasets.add_cases(
        dataset_id,
        [TestCase("one", {"query": "Hello"}, {"expected_action": "reply"})],
    )

    with pytest.raises(ValueError, match="case IDs must be unique"):
        datasets.add_cases(
            dataset_id,
            [TestCase("one", {"query": "Other"}, {"expected_action": "reply"})],
        )
    datasets.add_cases(
        dataset_id,
        [
            TestCase(
                "two",
                {"query": "hello", "header": {"user_role": "guest"}},
                {"expected_action": "reply"},
            )
        ],
    )
    with pytest.raises(ValueError, match="case inputs must be unique"):
        datasets.add_cases(
            dataset_id,
            [TestCase("three", {"query": "Hello"}, {"expected_action": "reply"})],
        )


def test_generation_cost_is_limited_to_dataset_category(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Agent", "")
    datasets = DatasetRegistry(repo)
    dataset_id = datasets.create(agent.agent_id, "Draft")

    with pytest.raises(ValueError, match="category 'dataset'"):
        datasets.record_generation_cost(dataset_id, UsageCost("agent", "m", 0, 0, 0, 0, 0.0))

    datasets.record_generation_cost(dataset_id, UsageCost("dataset", "m", 0, 0, 0, 0, 0.0))
    assert datasets.publish(dataset_id).generation_costs[0].category == "dataset"


def test_create_persists_description_and_schema_and_schema_for_round_trips(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Agent", "")
    datasets = DatasetRegistry(repo)
    custom_schema = DatasetSchema(
        columns=(
            DatasetColumn("prompt", "input", "string", required=True),
            DatasetColumn("expected_label", "output", "string", required=True),
        )
    )

    dataset_id = datasets.create(
        agent.agent_id,
        "Classify prompts",
        description="binary classifier eval",
        schema=custom_schema,
    )

    assert datasets.schema_for(dataset_id) == custom_schema
    assert datasets.description_for(dataset_id) == "binary classifier eval"


def test_create_without_schema_uses_default(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Agent", "")
    datasets = DatasetRegistry(repo)

    dataset_id = datasets.create(agent.agent_id, "Default")

    assert datasets.schema_for(dataset_id) == DEFAULT_DATASET_SCHEMA


def test_add_cases_rejects_case_that_violates_schema_required_field(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Agent", "")
    datasets = DatasetRegistry(repo)
    dataset_id = datasets.create(
        agent.agent_id,
        "Schema dataset",
        schema=DatasetSchema(
            columns=(
                DatasetColumn("prompt", "input", "string", required=True),
                DatasetColumn("expected_label", "output", "string", required=True),
            )
        ),
    )

    with pytest.raises(ValueError, match="prompt"):
        datasets.add_cases(dataset_id, [TestCase("c1", {"prompt": ""}, {"expected_label": "x"})])
    with pytest.raises(ValueError, match="expected_label"):
        datasets.add_cases(
            dataset_id,
            [TestCase("c2", {"prompt": "hi"}, {"expected_label": ""})],
        )


def test_add_cases_rejects_case_with_wrong_typed_field(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Agent", "")
    datasets = DatasetRegistry(repo)
    dataset_id = datasets.create(
        agent.agent_id,
        "Schema dataset",
        schema=DatasetSchema(
            columns=(
                DatasetColumn("prompt", "input", "string", required=True),
                DatasetColumn("score", "output", "number", required=False),
            )
        ),
    )

    with pytest.raises(ValueError, match="score"):
        datasets.add_cases(
            dataset_id,
            [TestCase("c1", {"prompt": "hi"}, {"score": "high"})],
        )


def test_replace_case_validates_against_schema(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Agent", "")
    datasets = DatasetRegistry(repo)
    dataset_id = datasets.create(
        agent.agent_id,
        "Schema dataset",
        schema=DatasetSchema(
            columns=(
                DatasetColumn("prompt", "input", "string", required=True),
                DatasetColumn("expected_label", "output", "string", required=True),
            )
        ),
    )
    datasets.add_cases(
        dataset_id,
        [TestCase("c1", {"prompt": "hello"}, {"expected_label": "greeting"})],
    )

    with pytest.raises(ValueError, match="prompt"):
        datasets.replace_case(
            dataset_id,
            TestCase("c1", {"prompt": ""}, {"expected_label": "greeting"}),
        )


def test_add_cases_uniqueness_uses_full_input_for_custom_schema(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Agent", "")
    datasets = DatasetRegistry(repo)
    dataset_id = datasets.create(
        agent.agent_id,
        "Prompt dataset",
        schema=DatasetSchema(
            columns=(DatasetColumn("prompt", "input", "string", required=True),)
        ),
    )
    datasets.add_cases(dataset_id, [TestCase("c1", {"prompt": "Hi"}, {})])

    with pytest.raises(ValueError, match="case inputs must be unique"):
        datasets.add_cases(dataset_id, [TestCase("c2", {"prompt": "hi"}, {})])
