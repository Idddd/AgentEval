import pytest

from src.agent_registry import AgentRegistry
from src.dataset_registry import DatasetRegistry
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import TestCase, UsageCost


def test_dataset_draft_is_empty_until_cases_are_explicitly_added(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Empty Agent", "")
    datasets = DatasetRegistry(repo)
    dataset_id = datasets.create(agent.agent_id, "Test dataset")

    assert datasets.list_draft(dataset_id) == []
    datasets.add_cases(dataset_id, [TestCase("c1", {"query": "hello"}, {})])
    assert [case.case_id for case in datasets.list_draft(dataset_id)] == ["c1"]


def test_case_mutations_reject_duplicate_ids_and_queries(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Agent", "")
    datasets = DatasetRegistry(repo)
    dataset_id = datasets.create(agent.agent_id, "Draft")
    datasets.add_cases(dataset_id, [TestCase("one", {"query": "Hello"}, {})])

    with pytest.raises(ValueError, match="case IDs must be unique"):
        datasets.add_cases(dataset_id, [TestCase("one", {"query": "Other"}, {})])
    with pytest.raises(ValueError, match="queries must be unique"):
        datasets.add_cases(dataset_id, [TestCase("two", {"query": "hello"}, {})])


def test_generation_cost_is_limited_to_dataset_category(tmp_path):
    repo = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = AgentRegistry(repo).create("Agent", "")
    datasets = DatasetRegistry(repo)
    dataset_id = datasets.create(agent.agent_id, "Draft")

    with pytest.raises(ValueError, match="category 'dataset'"):
        datasets.record_generation_cost(dataset_id, UsageCost("agent", "m", 0, 0, 0, 0, 0.0))

    datasets.record_generation_cost(dataset_id, UsageCost("dataset", "m", 0, 0, 0, 0, 0.0))
    assert datasets.publish(dataset_id).generation_costs[0].category == "dataset"
