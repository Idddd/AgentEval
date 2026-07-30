"""Behavioral tests for the human-readable report status."""
from __future__ import annotations

from src.models import ScoreRecord, TraceRecord
from src.report_generator import ReportGenerator, aggregate, report_status


def _trace(compliance: float) -> TraceRecord:
    return TraceRecord(
        trace_id=f"trace-{compliance}",
        name="agent-run-test",
        metadata={"scenario": "normal_high"},
        scores=[
            ScoreRecord("permission_compliance", compliance),
            ScoreRecord("execution_correctness", 1.0),
        ],
    )


def test_report_marks_all_passing_cases_compliant() -> None:
    traces = [_trace(1.0), _trace(1.0)]

    status, summary = report_status(traces)
    markdown = ReportGenerator("demo", store=None)._render_md(traces, aggregate(traces))

    assert status == "COMPLIANT"
    assert summary == "No permission failures were detected."
    assert "## Status: COMPLIANT" in markdown


def test_report_marks_failed_cases_action_required() -> None:
    traces = [_trace(1.0), _trace(0.0)]

    status, summary = report_status(traces)
    markdown = ReportGenerator("demo", store=None)._render_md(traces, aggregate(traces))

    assert status == "ACTION REQUIRED"
    assert summary == "1 failing case requires investigation."
    assert "## Status: ACTION REQUIRED" in markdown
    assert "1 failing case requires investigation." in markdown


def test_structured_renderer_preserves_case_quality_words() -> None:
    summary = {
        "identity": {
            "run_id": "run-1",
            "agent": {"id": "a", "name": "Agent", "revision": 2},
            "dataset": {"id": "d", "name": "Dataset", "revision": 3},
        },
        "status": "NEEDS ATTENTION",
        "metrics": {
            "total_cases": 2, "passed_cases": 0, "pass_rate": 0.0,
            "judge_average": 2.5, "evaluation_cost_usd": 0.03,
            "dataset_generation_cost_usd": 0.01,
        },
        "cases": [
            {"case_id": "case-fail", "status": "FAIL", "trace_id": "t1"},
            {"case_id": "case-incomplete", "status": "INCOMPLETE", "trace_id": "t2"},
        ],
        "failures": [],
        "judge_dimensions": {}, "tool_funnel": {}, "costs": {}, "tokens": {},
    }

    markdown = ReportGenerator.render_summary(summary)

    assert "## Status: NEEDS ATTENTION" in markdown
    assert "| case-fail | FAIL |" in markdown
    assert "| case-incomplete | INCOMPLETE |" in markdown


def test_structured_renderer_marks_missing_judge_average_unavailable() -> None:
    summary = {
        "identity": {"agent": {}, "dataset": {}},
        "metrics": {"judge_average": None},
    }

    markdown = ReportGenerator.render_summary(summary)

    assert "| Judge average | Not available |" in markdown
