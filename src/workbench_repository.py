from pathlib import Path
from typing import Protocol

from .workbench_models import (
    AgentProfile,
    AgentRevision,
    CaseResult,
    DatasetProfile,
    DatasetRevision,
    DatasetSchema,
    EvalRun,
    ReportSnapshot,
    RunStatus,
    TestCase,
    ToolBinding,
    TraceDetail,
    TraceSummary,
    UsageCost,
)


class WorkbenchRepository(Protocol):
    def create_agent(
        self,
        name: str,
        description: str,
        *,
        agent_id: str | None = None,
        created_at: str | None = None,
        updated_at: str | None = None,
    ) -> AgentProfile: ...

    def create_agent_with_revision(
        self,
        name: str,
        description: str,
        config_snapshot: dict,
        tools: tuple[ToolBinding, ...],
        *,
        agent_id: str | None = None,
        revision_id: str | None = None,
        created_at: str | None = None,
        updated_at: str | None = None,
    ) -> tuple[AgentProfile, AgentRevision]: ...

    def list_agents(self) -> list[AgentProfile]: ...

    def get_agent(self, agent_id: str) -> AgentProfile: ...

    def create_agent_revision(
        self,
        agent_id: str,
        config_snapshot: dict,
        tools: tuple[ToolBinding, ...],
        *,
        revision_id: str | None = None,
        created_at: str | None = None,
    ) -> AgentRevision: ...

    def get_agent_revision(self, revision_id: str) -> AgentRevision: ...

    def get_current_agent_revision(self, agent_id: str) -> AgentRevision | None: ...

    def list_agent_revisions(self, agent_id: str) -> list[AgentRevision]: ...

    def create_dataset(
        self,
        agent_id: str,
        name: str,
        *,
        description: str = "",
        schema: DatasetSchema | None = None,
        dataset_id: str | None = None,
        created_at: str | None = None,
        updated_at: str | None = None,
    ) -> str: ...

    def get_dataset(self, dataset_id: str) -> DatasetProfile: ...

    def list_datasets(self, agent_id: str) -> list[DatasetProfile]: ...

    def list_dataset_revisions(self, dataset_id: str) -> list[DatasetRevision]: ...

    def get_current_dataset_revision(self, dataset_id: str) -> DatasetRevision | None: ...

    def get_dataset_schema(self, dataset_id: str) -> DatasetSchema: ...

    def get_dataset_description(self, dataset_id: str) -> str: ...

    def update_dataset_metadata(
        self,
        dataset_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> DatasetProfile: ...

    def replace_draft_cases(
        self,
        dataset_id: str,
        cases: list[TestCase],
        *,
        touch_updated_at: bool = True,
    ) -> None: ...

    def list_draft_cases(self, dataset_id: str) -> list[TestCase]: ...

    def add_dataset_generation_cost(self, dataset_id: str, cost: UsageCost) -> None: ...

    def publish_dataset(
        self,
        dataset_id: str,
        *,
        revision_id: str | None = None,
        created_at: str | None = None,
    ) -> DatasetRevision: ...

    def get_dataset_revision(self, revision_id: str) -> DatasetRevision: ...

    def create_run(
        self,
        agent_revision_id: str,
        dataset_revision_id: str,
        *,
        run_id: str | None = None,
        created_at: str | None = None,
        started_at: str | None = None,
        stage: str | None = None,
    ) -> EvalRun: ...

    def save_case_result(self, run_id: str, result: CaseResult) -> None: ...

    def finish_run(
        self,
        run_id: str,
        status: RunStatus,
        *,
        completed_at: str | None = None,
    ) -> EvalRun: ...

    def get_run(self, run_id: str) -> EvalRun: ...

    def list_runs(self, agent_id: str) -> list[EvalRun]: ...

    def list_traces(self, agent_id: str) -> list[TraceSummary]: ...

    def get_trace(self, trace_id: str) -> TraceDetail: ...

    def save_report(
        self,
        run_id: str,
        status: str,
        summary: dict,
        markdown_path: Path,
        *,
        report_id: str | None = None,
        created_at: str | None = None,
    ) -> ReportSnapshot: ...

    def get_report(self, report_id: str) -> ReportSnapshot: ...

    def list_reports(self, agent_id: str) -> list[ReportSnapshot]: ...
