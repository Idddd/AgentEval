"""Report Generator: pull all traces + scores of an experiment and render a
Markdown report (spec 3.5)."""
from __future__ import annotations

from pathlib import Path

from .backends.base import TraceStore
from .models import TraceRecord
from .settings import PROJECT_ROOT

COMPLIANCE = "permission_compliance"
EXECUTION = "execution_correctness"


def report_status(traces: list[TraceRecord]) -> tuple[str, str]:
    """Return the human-readable overall permission-evaluation result."""
    failures = sum(t.get_score(COMPLIANCE) != 1.0 for t in traces)
    if failures:
        noun = "case" if failures == 1 else "cases"
        return "ACTION REQUIRED", f"{failures} failing {noun} requires investigation."
    return "COMPLIANT", "No permission failures were detected."


def aggregate(traces: list[TraceRecord]) -> dict:
    total = len(traces)
    passed = sum(1 for t in traces if t.get_score(COMPLIANCE) == 1.0)
    avg_c = sum(t.get_score(COMPLIANCE) or 0.0 for t in traces) / total if total else 0.0
    avg_e = sum(t.get_score(EXECUTION) or 0.0 for t in traces) / total if total else 0.0

    scenario_stats: dict[str, dict] = {}
    for t in traces:
        scenario = t.metadata.get("scenario", "unknown")
        stat = scenario_stats.setdefault(
            scenario, {"total": 0, "passed": 0, "failed": []})
        stat["total"] += 1
        if t.get_score(COMPLIANCE) == 1.0:
            stat["passed"] += 1
        else:
            stat["failed"].append(t)
    return {"total": total, "passed": passed, "avg_compliance": avg_c,
            "avg_execution": avg_e, "scenario_stats": scenario_stats}


class ReportGenerator:
    def __init__(self, experiment_name: str, store: TraceStore):
        self.experiment_name = experiment_name
        self.store = store

    def generate(self, output_path: str | None = None) -> str:
        traces = self.store.list_traces(tag=self.experiment_name)
        stats = aggregate(traces)
        md = self._render_md(traces, stats)

        out = Path(output_path) if output_path else (
            PROJECT_ROOT / "reports" / f"report_{self.experiment_name}.md")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(md, encoding="utf-8")
        return md

    def _render_md(self, traces: list[TraceRecord], stats: dict) -> str:
        total, passed = stats["total"], stats["passed"]
        pct = f"{passed / total * 100:.0f}" if total else "0"
        status, status_summary = report_status(traces)
        lines = [
            "# Agent Permission Compliance Report",
            "",
            f"## Status: {status}",
            status_summary,
            "",
            "## Overview",
            "| Metric | Value |",
            "|---|---|",
            f"| Experiment | {self.experiment_name} |",
            f"| Total cases | {total} |",
            f"| Compliance passed | {passed}/{total} ({pct}%) |",
            f"| Avg compliance score | {stats['avg_compliance']:.2f} |",
            f"| Avg execution score | {stats['avg_execution']:.2f} |",
            "",
            "## By Scenario",
            "| Scenario | Cases | Passed | Failed | Avg compliance |",
            "|---|---|---|---|---|",
        ]
        for scenario, stat in stats["scenario_stats"].items():
            failed = stat["total"] - stat["passed"]
            scores = [t.get_score(COMPLIANCE) or 0.0
                      for t in traces if t.metadata.get("scenario") == scenario]
            avg = sum(scores) / len(scores) if scores else 0.0
            lines.append(f"| {scenario} | {stat['total']} | {stat['passed']} "
                         f"| {failed} | {avg:.2f} |")

        lines += ["", "## Failure Analysis"]
        failures = [t for t in traces if t.get_score(COMPLIANCE) != 1.0]
        if not failures:
            lines.append("No failing cases 🎉")
        for i, t in enumerate(failures, 1):
            reason = self._failure_reason(t)
            lines += [
                f"### Case {i}: {t.metadata.get('scenario', 'unknown')}",
                f"- **Trace**: {t.name} (`{t.trace_id}`)",
                f"- **User Role**: {t.metadata.get('user_role', '-')}",
                f"- **Expected Tool**: {t.metadata.get('tool_name', '-')}",
                f"- **Score**: compliance={t.get_score(COMPLIANCE)}, "
                f"execution={t.get_score(EXECUTION)}",
                f"- **Failure Reason**: {reason}",
                "",
            ]

        lines += ["## Raw Data",
                  f"- Experiment tag: `{self.experiment_name}`",
                  f"- Trace count: {total}"]
        return "\n".join(lines) + "\n"

    @staticmethod
    def _failure_reason(t: TraceRecord) -> str:
        for s in t.scores:
            if s.comment and "|" in s.comment:
                return s.comment.split("|", 1)[1].strip()
        return "no reason recorded"
