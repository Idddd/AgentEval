from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class _FrozenDict(dict):
    def _immutable(self, *args: Any, **kwargs: Any) -> None:
        raise TypeError("mapping is immutable")

    __setitem__ = _immutable
    __delitem__ = _immutable
    __ior__ = _immutable
    clear = _immutable
    pop = _immutable
    popitem = _immutable
    setdefault = _immutable
    update = _immutable


class _FrozenList(tuple):
    """Immutable sequence that preserves list equality for JSON summaries."""

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, list):
            return list(self) == other
        return super().__eq__(other)

    def __ne__(self, other: Any) -> bool:
        return not self == other


def _freeze(value: Any) -> Any:
    if isinstance(value, _FrozenDict):
        return value
    if isinstance(value, dict):
        return _FrozenDict({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, list):
        return _FrozenList(_freeze(item) for item in value)
    if isinstance(value, tuple):
        return tuple(_freeze(item) for item in value)
    if isinstance(value, frozenset):
        return frozenset(_freeze(item) for item in value)
    if isinstance(value, set):
        return frozenset(_freeze(item) for item in value)
    return value


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
    tags: tuple[str, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "adapter_config", _freeze(self.adapter_config))
        object.__setattr__(self, "input_schema", _freeze(self.input_schema))
        object.__setattr__(self, "output_schema", _freeze(self.output_schema))
        object.__setattr__(self, "permission", _freeze(self.permission))
        object.__setattr__(self, "test_requirements", _freeze(self.test_requirements))
        object.__setattr__(self, "tags", _freeze(self.tags))
        object.__setattr__(self, "metadata", _freeze(self.metadata))


@dataclass(frozen=True)
class AgentRevision:
    revision_id: str
    agent_id: str
    revision: int
    config_snapshot: dict[str, Any]
    tools: tuple[ToolBinding, ...]
    created_at: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "config_snapshot", _freeze(self.config_snapshot))
        object.__setattr__(self, "tools", tuple(self.tools))


@dataclass(frozen=True)
class TestCase:
    case_id: str
    input: dict[str, Any]
    expected_output: dict[str, Any]
    reference_answer: str | None = None
    tags: tuple[str, ...] = ()
    source: str = "manual"
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "input", _freeze(self.input))
        object.__setattr__(self, "expected_output", _freeze(self.expected_output))
        object.__setattr__(self, "tags", _freeze(self.tags))
        object.__setattr__(self, "metadata", _freeze(self.metadata))


@dataclass(frozen=True)
class DatasetColumn:
    name: str
    kind: str  # "input" | "output"
    data_type: str  # "string" | "number" | "boolean" | "json"
    required: bool
    description: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "name", str(self.name))
        object.__setattr__(self, "kind", str(self.kind))
        object.__setattr__(self, "data_type", str(self.data_type))
        object.__setattr__(self, "description", str(self.description))


@dataclass(frozen=True)
class DatasetSchema:
    columns: tuple[DatasetColumn, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "columns", tuple(self.columns))

    @property
    def input_columns(self) -> tuple[DatasetColumn, ...]:
        return tuple(c for c in self.columns if c.kind == "input")

    @property
    def output_columns(self) -> tuple[DatasetColumn, ...]:
        return tuple(c for c in self.columns if c.kind == "output")

    def validate_case(self, case: "TestCase") -> list[str]:
        """Return error messages for fields that violate the schema; empty = valid."""
        errors: list[str] = []
        for column in self.columns:
            namespace = case.input if column.kind == "input" else case.expected_output
            if column.name not in namespace:
                if column.required:
                    errors.append(f"{column.kind} field '{column.name}' is required")
                continue
            value = namespace[column.name]
            if isinstance(value, str) and value.strip() == "":
                if column.required:
                    errors.append(f"{column.kind} field '{column.name}' must not be empty")
                    continue
                if column.data_type == "string":
                    continue
            type_error = _check_column_type(column, value)
            if type_error:
                errors.append(f"{column.kind} field '{column.name}': {type_error}")
        return errors


def _check_column_type(column: DatasetColumn, value: Any) -> str | None:
    if column.data_type == "string":
        if not isinstance(value, str):
            return f"expected string, got {type(value).__name__}"
    elif column.data_type == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return f"expected number, got {type(value).__name__}"
    elif column.data_type == "boolean":
        if not isinstance(value, bool):
            return f"expected boolean, got {type(value).__name__}"
    elif column.data_type == "json":
        if not isinstance(value, (dict, list, tuple)):
            return f"expected json object or array, got {type(value).__name__}"
    return None


CREATE_FORM_TEMPLATE = DatasetSchema(
    columns=(
        DatasetColumn(
            "query",
            "input",
            "string",
            required=True,
            description="User query to the agent",
        ),
        DatasetColumn(
            "expected_action",
            "output",
            "string",
            required=True,
            description="Expected action or outcome from the target",
        ),
        DatasetColumn(
            "header",
            "input",
            "json",
            required=False,
            description="Request header metadata",
        ),
    )
)

# Every creation path shares the same built-in schema. Existing persisted
# datasets keep their stored schema and are not migrated by this default.
DEFAULT_DATASET_SCHEMA = CREATE_FORM_TEMPLATE


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

    def __post_init__(self) -> None:
        object.__setattr__(self, "cases", tuple(self.cases))
        object.__setattr__(self, "generation_costs", tuple(self.generation_costs))


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

    def __post_init__(self) -> None:
        object.__setattr__(self, "requested_arguments", _freeze(self.requested_arguments))
        object.__setattr__(self, "executed_arguments", _freeze(self.executed_arguments))
        object.__setattr__(self, "output", _freeze(self.output))
        object.__setattr__(self, "receipt", _freeze(self.receipt))

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

    def __post_init__(self) -> None:
        rubric_categories = {"correctness", "relevance", "completeness", "safety"}
        if set(self.scores) != rubric_categories:
            raise ValueError("scores must contain exactly the required rubric categories")
        if any(
            not isinstance(score, int) or isinstance(score, bool) or not 1 <= score <= 5
            for score in self.scores.values()
        ):
            raise ValueError("rubric scores must be integers from 1 to 5")
        object.__setattr__(self, "scores", _freeze(self.scores))
        object.__setattr__(self, "reasons", _freeze(self.reasons))

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

    def __post_init__(self) -> None:
        object.__setattr__(self, "deterministic_scores", _freeze(self.deterministic_scores))
        object.__setattr__(self, "deterministic_reasons", _freeze(self.deterministic_reasons))
        object.__setattr__(self, "tool_evidence", tuple(self.tool_evidence))
        object.__setattr__(self, "usage_costs", tuple(self.usage_costs))


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

    def __post_init__(self) -> None:
        object.__setattr__(self, "summary", _freeze(self.summary))
