"""Draft dataset service with stable case identities and validation."""
from __future__ import annotations

from .workbench_models import DatasetRevision, TestCase, UsageCost
from .workbench_repository import WorkbenchRepository


class DatasetRegistry:
    def __init__(self, repository: WorkbenchRepository):
        self.repository = repository

    def create(self, agent_id: str, name: str) -> str:
        return self.repository.create_dataset(agent_id, name)

    def list_draft(self, dataset_id: str) -> list[TestCase]:
        return self.repository.list_draft_cases(dataset_id)

    def add_cases(self, dataset_id: str, cases: list[TestCase]) -> None:
        current = self.list_draft(dataset_id)
        self._replace_validated(dataset_id, [*current, *cases])

    def replace_case(self, dataset_id: str, case: TestCase) -> None:
        current = self.list_draft(dataset_id)
        replacement = [case if item.case_id == case.case_id else item for item in current]
        if not any(item.case_id == case.case_id for item in current):
            raise KeyError(case.case_id)
        self._replace_validated(dataset_id, replacement)

    def delete_case(self, dataset_id: str, case_id: str) -> None:
        current = self.list_draft(dataset_id)
        updated = [item for item in current if item.case_id != case_id]
        if len(updated) == len(current):
            raise KeyError(case_id)
        self._replace_validated(dataset_id, updated)

    def record_generation_cost(self, dataset_id: str, cost: UsageCost) -> None:
        if cost.category != "dataset":
            raise ValueError("dataset generation cost must use category 'dataset'")
        self.repository.add_dataset_generation_cost(dataset_id, cost)

    def publish(self, dataset_id: str) -> DatasetRevision:
        return self.repository.publish_dataset(dataset_id)

    def _replace_validated(self, dataset_id: str, cases: list[TestCase]) -> None:
        case_ids = [case.case_id for case in cases]
        if len(case_ids) != len(set(case_ids)):
            raise ValueError("case IDs must be unique within a dataset draft")
        queries = [str(case.input.get("query", "")).casefold() for case in cases]
        if len(queries) != len(set(queries)):
            raise ValueError("case queries must be unique within a dataset draft")
        self.repository.replace_draft_cases(dataset_id, cases)
