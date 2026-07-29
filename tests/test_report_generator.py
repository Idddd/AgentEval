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
