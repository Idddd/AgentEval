from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class RunStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"


@dataclass(frozen=True)
class AgentProfile:
    agent_id: str
    name: str
    description: str
    current_revision: int
    created_at: str


@dataclass(frozen=True)
class ToolBinding:
    tool_id: str
    name: str
    description: str
    connection_type: str
    adapter_config: dict[str, Any]
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    permission: dict[str, Any]
    test_requirements: tuple[str, ...]
    verification_required: bool
    enabled: bool


@dataclass(frozen=True)
class AgentRevision:
    revision_id: str
    agent_id: str
    revision: int
    config_snapshot: dict[str, Any]
    tools: tuple[ToolBinding, ...]
    created_at: str


@dataclass(frozen=True)
class TestCase:
    case_id: str
    input: dict[str, Any]
    expected_output: dict[str, Any]
    reference_answer: str | None = None
    tags: tuple[str, ...] = ()
    source: str = "manual"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DatasetRevision:
    revision_id: str
    dataset_id: str
    agent_id: str
    name: str
    revision: int
    cases: tuple[TestCase, ...]
    created_at: str
    generation_costs: tuple[UsageCost, ...] = ()


@dataclass(frozen=True)
class UsageCost:
    category: str
    model: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    reasoning_tokens: int
    cost_usd: float

    @staticmethod
    def evaluation_total(items: list[UsageCost] | tuple[UsageCost, ...]) -> float:
        return sum(item.cost_usd for item in items if item.category in {"agent", "judge"})


@dataclass(frozen=True)
class ToolEvidence:
    call_id: str
    tool_id: str
    requested: bool
    executed: bool
    succeeded: bool
    effect_verified: bool | None
    verification_required: bool
    requested_arguments: dict[str, Any]
    executed_arguments: dict[str, Any] | None
    output: dict[str, Any] | None
    error: str | None
    trace_id: str
    observation_id: str | None
    started_at: str | None
    ended_at: str | None
    latency_ms: float | None
    receipt: dict[str, Any] | None

    @property
    def effect_status(self) -> str:
        if not self.verification_required:
            return "NOT REQUIRED"
        return "VERIFIED" if self.effect_verified else "UNVERIFIED"

    @property
    def passed(self) -> bool:
        return self.requested and self.executed and self.succeeded and (
            not self.verification_required or self.effect_verified is True
        )


@dataclass(frozen=True)
class JudgeResult:
    scores: dict[str, int]
    reasons: dict[str, str]
    summary: str
    model: str
    prompt_version: str
    trace_id: str
    observation_id: str | None
    usage_cost: UsageCost | None = None

    @property
    def average(self) -> float:
        return sum(self.scores.values()) / len(self.scores) if self.scores else 0.0

    @property
    def passed(self) -> bool:
        return self.average >= 4.0 and self.scores.get("safety", 0) >= 4


@dataclass(frozen=True)
class CaseResult:
    case_id: str
    trace_id: str
    response: str
    deterministic_scores: dict[str, float]
    deterministic_reasons: dict[str, str]
    tool_evidence: tuple[ToolEvidence, ...]
    judge: JudgeResult | None
    usage_costs: tuple[UsageCost, ...]
    status: str


@dataclass(frozen=True)
class EvalRun:
    run_id: str
    agent_id: str
    agent_revision_id: str
    dataset_revision_id: str
    status: RunStatus
    started_at: str
    completed_at: str | None
    evaluator_version: str
    case_results: tuple[CaseResult, ...] = ()


@dataclass(frozen=True)
class ReportSnapshot:
    report_id: str
    run_id: str
    artifact_version: int
    status: str
    summary: dict[str, Any]
    markdown_path: str
    created_at: str
