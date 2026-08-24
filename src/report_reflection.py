"""Structured, replaceable Target-change analysis for immutable Reports."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from .workbench_models import AgentRevision, ReportSnapshot
from .workbench_repository import WorkbenchRepository


@dataclass(frozen=True)
class ReflectionSuggestion:
    suggestion_id: str
    area: str
    evidence: str
    current: str
    suggested: str
    patch_key: str
    patch_value: Any


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _mutable(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _mutable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_mutable(item) for item in value]
    if isinstance(value, (set, frozenset)):
        return {_mutable(item) for item in value}
    return value


class RuleBasedReportReflector:
    """Emit conservative allowlisted patches from persisted evaluation evidence."""

    def reflect(
        self, report: ReportSnapshot, revision: AgentRevision
    ) -> tuple[ReflectionSuggestion, ...]:
        summary = report.summary
        failures = tuple(summary.get("failures", ()))
        metrics = _mapping(summary.get("metrics"))
        funnel = _mapping(summary.get("tool_funnel"))
        suggestions: list[ReflectionSuggestion] = []

        if failures:
            prompt_key = (
                "prompt"
                if "prompt" in revision.config_snapshot
                else "system_prompt"
                if "system_prompt" in revision.config_snapshot
                else "prompt"
            )
            current_prompt = str(
                revision.config_snapshot.get(prompt_key, "")
            ).strip()
            addition = "Review failed evaluation cases and verify the requested action before responding."
            suggested_prompt = f"{current_prompt}\n\n{addition}".strip()
            suggestions.append(
                ReflectionSuggestion(
                    "prompt-failures",
                    "Prompt",
                    f"{len(failures)} failed case(s) require clearer execution guidance.",
                    current_prompt or "None",
                    suggested_prompt,
                    prompt_key,
                    suggested_prompt,
                )
            )

        pass_rate = metrics.get("pass_rate")
        if isinstance(pass_rate, (int, float)) and not isinstance(pass_rate, bool) and pass_rate < 80:
            current_parameters = _mutable(
                _mapping(revision.config_snapshot.get("model_parameters"))
            )
            suggestions.append(
                ReflectionSuggestion(
                    "model-determinism",
                    "Model",
                    f"Pass rate is {float(pass_rate):.1f}%; reduce output variance.",
                    str(current_parameters or "Default"),
                    "Temperature 0",
                    "model_parameters",
                    {"temperature": 0},
                )
            )

        requested = int(funnel.get("requested", 0) or 0)
        succeeded = int(funnel.get("succeeded", 0) or 0)
        if requested > succeeded:
            suggestions.append(
                ReflectionSuggestion(
                    "tool-evidence-policy",
                    "Policy",
                    f"{requested - succeeded} requested Tool call(s) did not succeed.",
                    str(_mapping(revision.config_snapshot.get("policy")) or "None"),
                    "Require Tool evidence",
                    "policy",
                    {"require_tool_evidence": True},
                )
            )
        return tuple(suggestions)


def apply_suggestions(
    config: Mapping[str, Any],
    suggestions: tuple[ReflectionSuggestion, ...],
) -> dict[str, Any]:
    """Return a mutable snapshot with only accepted allowlisted patches applied."""
    allowed = {"prompt", "system_prompt", "model_parameters", "policy"}
    updated = _mutable(config)
    for suggestion in suggestions:
        if suggestion.patch_key not in allowed:
            raise ValueError(f"Unsupported Target patch: {suggestion.patch_key}")
        value = _mutable(suggestion.patch_value)
        if suggestion.patch_key in {"model_parameters", "policy"}:
            merged = _mutable(_mapping(updated.get(suggestion.patch_key)))
            merged.update(value)
            value = merged
        updated[suggestion.patch_key] = value
    return updated


def create_reflected_revision(
    repository: WorkbenchRepository,
    agent_id: str,
    report_id: str,
    accepted_ids: tuple[str, ...],
    reflector: RuleBasedReportReflector | None = None,
) -> AgentRevision:
    """Validate Report ownership and create a new Revision from accepted patches."""
    from .agent_registry import AgentRegistry

    if not accepted_ids:
        raise ValueError("Select at least one Target suggestion")
    report = repository.get_report(report_id)
    run = repository.get_run(report.run_id)
    if run.agent_id != agent_id:
        raise ValueError("Report does not belong to the selected Target")
    base = repository.get_agent_revision(run.agent_revision_id)
    current = repository.get_current_agent_revision(agent_id)
    if current is None or current.revision_id != base.revision_id:
        raise ValueError("Target Revision changed after this Report was created")

    suggestions = (reflector or RuleBasedReportReflector()).reflect(report, base)
    indexed = {suggestion.suggestion_id: suggestion for suggestion in suggestions}
    missing = [suggestion_id for suggestion_id in accepted_ids if suggestion_id not in indexed]
    if missing:
        raise ValueError(f"Suggestions are no longer available: {', '.join(missing)}")
    updated = apply_suggestions(
        base.config_snapshot,
        tuple(indexed[suggestion_id] for suggestion_id in accepted_ids),
    )
    return AgentRegistry(repository).revise(agent_id, updated, base.tools)
