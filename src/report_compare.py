"""Revision-aware comparisons over durable structured report summaries."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ReportComparison:
    baseline_report_id: str
    current_report_id: str
    shared_case_ids: tuple[str, ...]
    added_case_ids: tuple[str, ...]
    removed_case_ids: tuple[str, ...]
    pass_rate_delta_shared: float
    judge_deltas: dict[str, float]
    tool_state_deltas: dict[str, int]
    cost_delta_usd: float
    token_deltas: dict[str, int]
    resolved_failure_ids: tuple[str, ...]
    regression_ids: tuple[str, ...]
    unchanged_failure_ids: tuple[str, ...]
    agent_changes: dict[str, dict[str, object]]
    different_dataset_revisions: bool


def compare_report_summaries(
    baseline_report_id: str,
    baseline: dict,
    baseline_config: dict,
    current_report_id: str,
    current: dict,
    current_config: dict,
) -> ReportComparison:
    baseline_cases = {item["case_id"]: item for item in baseline.get("cases", ())}
    current_cases = {item["case_id"]: item for item in current.get("cases", ())}
    shared = tuple(sorted(baseline_cases.keys() & current_cases.keys()))
    added = tuple(sorted(current_cases.keys() - baseline_cases.keys()))
    removed = tuple(sorted(baseline_cases.keys() - current_cases.keys()))

    def shared_rate(cases: dict[str, dict]) -> float:
        if not shared:
            return 0.0
        return sum(cases[case_id].get("status") == "PASS" for case_id in shared) / len(shared) * 100

    baseline_failures = {
        case_id for case_id in shared if baseline_cases[case_id].get("status") != "PASS"
    }
    current_failures = {
        case_id for case_id in shared if current_cases[case_id].get("status") != "PASS"
    }
    baseline_judges = baseline.get("judge_dimensions", {})
    current_judges = current.get("judge_dimensions", {})
    baseline_tools = baseline.get("tool_funnel", {})
    current_tools = current.get("tool_funnel", {})
    baseline_tokens = baseline.get("tokens", {})
    current_tokens = current.get("tokens", {})
    judge_names = sorted(baseline_judges.keys() | current_judges.keys())
    tool_names = sorted(baseline_tools.keys() | current_tools.keys())
    token_names = sorted(baseline_tokens.keys() | current_tokens.keys())
    config_keys = ("model", "system_prompt", "model_parameters", "tools", "policy")
    changes = {
        key: {"before": baseline_config.get(key), "after": current_config.get(key)}
        for key in config_keys
        if baseline_config.get(key) != current_config.get(key)
    }
    baseline_dataset = baseline.get("identity", {}).get("dataset", {})
    current_dataset = current.get("identity", {}).get("dataset", {})
    return ReportComparison(
        baseline_report_id=baseline_report_id,
        current_report_id=current_report_id,
        shared_case_ids=shared,
        added_case_ids=added,
        removed_case_ids=removed,
        pass_rate_delta_shared=shared_rate(current_cases) - shared_rate(baseline_cases),
        judge_deltas={
            name: float(current_judges.get(name, 0.0)) - float(baseline_judges.get(name, 0.0))
            for name in judge_names
        },
        tool_state_deltas={
            name: int(current_tools.get(name, 0)) - int(baseline_tools.get(name, 0))
            for name in tool_names
        },
        cost_delta_usd=(
            float(current.get("costs", {}).get("evaluation_total", 0.0))
            - float(baseline.get("costs", {}).get("evaluation_total", 0.0))
        ),
        token_deltas={
            name: int(current_tokens.get(name, 0)) - int(baseline_tokens.get(name, 0))
            for name in token_names
        },
        resolved_failure_ids=tuple(sorted(baseline_failures - current_failures)),
        regression_ids=tuple(sorted(current_failures - baseline_failures)),
        unchanged_failure_ids=tuple(sorted(baseline_failures & current_failures)),
        agent_changes=changes,
        different_dataset_revisions=(
            baseline_dataset.get("revision") != current_dataset.get("revision")
        ),
    )
