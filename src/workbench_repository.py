from pathlib import Path
from typing import Protocol

from .workbench_models import (
    AgentProfile,
    AgentRevision,
    CaseResult,
    DatasetRevision,
    EvalRun,
    ReportSnapshot,
    RunStatus,
    TestCase,
    ToolBinding,
    UsageCost,
)


class WorkbenchRepository(Protocol):
    def create_agent(self, name: str, description: str) -> AgentProfile: ...

    def list_agents(self) -> list[AgentProfile]: ...

    def get_agent(self, agent_id: str) -> AgentProfile: ...

    def rename_agent(self, agent_id: str, name: str) -> AgentProfile: ...

    def create_agent_revision(
        self,
        agent_id: str,
        config_snapshot: dict,
        tools: tuple[ToolBinding, ...],
    ) -> AgentRevision: ...

    def get_agent_revision(self, revision_id: str) -> AgentRevision: ...

    def get_current_agent_revision(self, agent_id: str) -> AgentRevision | None: ...

    def create_dataset(self, agent_id: str, name: str) -> str: ...

    def replace_draft_cases(self, dataset_id: str, cases: list[TestCase]) -> None: ...

    def list_draft_cases(self, dataset_id: str) -> list[TestCase]: ...

    def add_dataset_generation_cost(self, dataset_id: str, cost: UsageCost) -> None: ...

    def publish_dataset(self, dataset_id: str) -> DatasetRevision: ...

    def get_dataset_revision(self, revision_id: str) -> DatasetRevision: ...

    def create_run(
        self,
        agent_revision_id: str,
        dataset_revision_id: str,
    ) -> EvalRun: ...

    def save_case_result(self, run_id: str, result: CaseResult) -> None: ...

    def save_judged_case_result(self, run_id: str, result: CaseResult) -> None: ...

    def finish_run(self, run_id: str, status: RunStatus) -> EvalRun: ...

    def get_run(self, run_id: str) -> EvalRun: ...

    def list_runs(self, agent_id: str) -> list[EvalRun]: ...

    def save_report(
        self,
        run_id: str,
        status: str,
        summary: dict,
        markdown_path: Path,
    ) -> ReportSnapshot: ...

    def get_report(self, report_id: str) -> ReportSnapshot: ...

    def list_reports(self, agent_id: str) -> list[ReportSnapshot]: ...
