"""Create immutable structured reports from persisted evaluation artifacts."""
from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any

from .report_compare import ReportComparison, compare_report_summaries
from .report_generator import ReportGenerator
from .settings import PROJECT_ROOT
from .workbench_models import CaseResult, EvalRun, ReportSnapshot, RunStatus
from .workbench_repository import WorkbenchRepository


def derive_report_status(run: EvalRun) -> str:
    statuses = [result.status for result in run.case_results]
    if (
        not statuses
        or "INCOMPLETE" in statuses
        or run.status in {RunStatus.PARTIAL, RunStatus.FAILED}
    ):
        return "INCOMPLETE"
    if "FAIL" in statuses:
        return "NEEDS ATTENTION"
    return "PASS"


def _json_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_json_value(item) for item in value]
    return value


class ReportService:
    def __init__(self, repository: WorkbenchRepository,
                 output_dir: Path | None = None):
        self.repository = repository
        self.output_dir = Path(output_dir or PROJECT_ROOT / "reports")

    def create(self, run_id: str) -> ReportSnapshot:
        run = self.repository.get_run(run_id)
        agent = self.repository.get_agent(run.agent_id)
        agent_revision = self.repository.get_agent_revision(run.agent_revision_id)
        dataset_revision = self.repository.get_dataset_revision(run.dataset_revision_id)
        results = list(run.case_results)
        evidence = [item for result in results for item in result.tool_evidence]
        run_costs = [item for result in results for item in result.usage_costs]
        dataset_costs = list(dataset_revision.generation_costs)
        passed = sum(result.status == "PASS" for result in results)
        judge_results = [result.judge for result in results if result.judge is not None]
        dimensions = ("correctness", "relevance", "completeness", "safety")
        judge_dimensions = {
            name: (
                sum(judge.scores[name] for judge in judge_results) / len(judge_results)
                if judge_results else 0.0
            )
            for name in dimensions
        }
        agent_cost = sum(item.cost_usd for item in run_costs if item.category == "agent")
        judge_cost = sum(item.cost_usd for item in run_costs if item.category == "judge")
        dataset_cost = sum(item.cost_usd for item in dataset_costs)
        all_costs = run_costs + dataset_costs
        token_fields = ("input_tokens", "output_tokens", "cached_tokens", "reasoning_tokens")
        token_totals = {
            f"{category}_{field}": sum(
                getattr(item, field) for item in all_costs if item.category == category
            )
            for category in ("agent", "judge", "dataset")
            for field in token_fields
        }
        quality_status = derive_report_status(run)
        summary = {
            "identity": {
                "run_id": run.run_id,
                "started_at": run.started_at,
                "completed_at": run.completed_at,
                "agent": {
                    "id": agent.agent_id,
                    "name": agent.name,
                    "revision": agent_revision.revision,
                },
                "dataset": {
                    "id": dataset_revision.dataset_id,
                    "name": dataset_revision.name,
                    "revision": dataset_revision.revision,
                },
            },
            "status": quality_status,
            "metrics": {
                "total_cases": len(results),
                "passed_cases": passed,
                "pass_rate": passed / len(results) * 100 if results else 0.0,
                "judge_average": (
                    sum(judge.average for judge in judge_results) / len(judge_results)
                    if judge_results else 0.0
                ),
                "verified_tools": sum(item.effect_verified is True for item in evidence),
                "required_verifications": sum(item.verification_required for item in evidence),
                "evaluation_cost_usd": agent_cost + judge_cost,
                "dataset_generation_cost_usd": dataset_cost,
            },
            "judge_dimensions": judge_dimensions,
            "tool_funnel": {
                "requested": sum(item.requested for item in evidence),
                "executed": sum(item.executed for item in evidence),
                "succeeded": sum(item.succeeded for item in evidence),
                "verified": sum(item.effect_verified is True for item in evidence),
            },
            "costs": {
                "agent": agent_cost,
                "judge": judge_cost,
                "evaluation_total": agent_cost + judge_cost,
                "dataset": dataset_cost,
            },
            "tokens": token_totals,
            "cases": [self._case_summary(result) for result in results],
            "failures": [
                self._failure_summary(result) for result in results
                if result.status != "PASS"
            ],
        }

        self.output_dir.mkdir(parents=True, exist_ok=True)
        existing = [
            item for item in self.repository.list_reports(run.agent_id)
            if item.run_id == run_id
        ]
        version = max((item.artifact_version for item in existing), default=0) + 1
        markdown_path = self.output_dir / f"report_{run_id}_v{version}.md"
        markdown_path.write_text(ReportGenerator.render_summary(summary), encoding="utf-8")
        return self.repository.save_report(run_id, quality_status, summary, markdown_path)

    def compare(self, baseline_report_id: str,
                current_report_id: str) -> ReportComparison:
        baseline = self.repository.get_report(baseline_report_id)
        current = self.repository.get_report(current_report_id)
        baseline_run = self.repository.get_run(baseline.run_id)
        current_run = self.repository.get_run(current.run_id)
        baseline_config = self.repository.get_agent_revision(
            baseline_run.agent_revision_id,
        ).config_snapshot
        current_config = self.repository.get_agent_revision(
            current_run.agent_revision_id,
        ).config_snapshot
        return compare_report_summaries(
            baseline.report_id, baseline.summary, baseline_config,
            current.report_id, current.summary, current_config,
        )

    @staticmethod
    def _case_summary(result: CaseResult) -> dict[str, Any]:
        judge = None
        if result.judge is not None:
            judge = {
                "scores": dict(result.judge.scores),
                "reasons": dict(result.judge.reasons),
                "summary": result.judge.summary,
                "model": result.judge.model,
                "prompt_version": result.judge.prompt_version,
                "trace_id": result.judge.trace_id,
                "observation_id": result.judge.observation_id,
            }
        tool_evidence = [
            {
                "call_id": item.call_id,
                "tool_id": item.tool_id,
                "requested": item.requested,
                "executed": item.executed,
                "succeeded": item.succeeded,
                "effect_verified": item.effect_verified,
                "verification_required": item.verification_required,
                "effect_status": item.effect_status,
                "error": item.error,
                "trace_id": item.trace_id,
                "observation_id": item.observation_id,
                "latency_ms": item.latency_ms,
            }
            for item in result.tool_evidence
        ]
        usage_costs = [
            {
                "category": item.category,
                "model": item.model,
                "input_tokens": item.input_tokens,
                "output_tokens": item.output_tokens,
                "cached_tokens": item.cached_tokens,
                "reasoning_tokens": item.reasoning_tokens,
                "cost_usd": item.cost_usd,
            }
            for item in result.usage_costs
        ]
        return {
            "case_id": result.case_id,
            "status": result.status,
            "response": result.response,
            "deterministic_scores": _json_value(result.deterministic_scores),
            "deterministic_reasons": _json_value(result.deterministic_reasons),
            "judge": judge,
            "tool_evidence": tool_evidence,
            "usage_costs": usage_costs,
            "trace_id": result.trace_id,
        }

    @staticmethod
    def _failure_summary(result: CaseResult) -> dict[str, Any]:
        reason_codes = {
            name: str(reason).split(":", 1)[0]
            for name, reason in result.deterministic_reasons.items()
            if reason
        }
        judge_reasons = dict(result.judge.reasons) if result.judge is not None else {}
        failed_tools = [
            {
                "tool_id": item.tool_id,
                "requested": item.requested,
                "executed": item.executed,
                "succeeded": item.succeeded,
                "effect_status": item.effect_status,
                "error": item.error,
            }
            for item in result.tool_evidence
            if not item.passed
        ]
        return {
            "case_id": result.case_id,
            "status": result.status,
            "deterministic_reason_codes": reason_codes,
            "judge_reasons": judge_reasons,
            "failed_tool_states": failed_tools,
            "trace_id": result.trace_id,
        }
