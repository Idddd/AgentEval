from streamlit.testing.v1 import AppTest


def test_span_rows_preserve_parent_child_order_and_orphans():
    from datetime import datetime, timedelta, timezone

    from src.models import SpanRecord, TraceRecord
    from src.ui.observations import _span_latency, _span_rows

    started = datetime(2026, 8, 4, tzinfo=timezone.utc)
    child = SpanRecord("child", "root", "Tool", started + timedelta(milliseconds=2))
    root = SpanRecord(
        "root",
        None,
        "Agent",
        started,
        end_time=started + timedelta(milliseconds=10),
    )
    orphan = SpanRecord("orphan", "missing", "Orphan", started + timedelta(milliseconds=20))
    trace = TraceRecord("trace-1", "Evaluation", spans=[child, orphan, root])

    assert [(span.id, depth, last) for span, depth, last in _span_rows(trace)] == [
        ("root", 0, False),
        ("child", 1, True),
        ("orphan", 0, True),
    ]
    assert _span_latency(root) == 10.0
    assert _span_latency(child) is None


def test_trace_analysis_turns_failed_evidence_into_concrete_changes():
    from datetime import datetime, timezone

    from src.models import SpanRecord, TraceRecord
    from src.ui.observations import _trace_improvement_suggestions
    from src.workbench_models import CaseResult, ToolEvidence

    evidence = ToolEvidence(
        "call-1", "employee_lookup", True, True, False, None, False,
        {"employee": "1"}, {"employee": "1"}, None, "timeout",
        "trace-1", "span-tool", None, None, None, None,
    )
    result = CaseResult(
        "case-1", "trace-1", "answer", {"execution": 0.0},
        {"execution": "Required tool execution failed"}, (evidence,), None, (), "FAIL",
    )
    trace = TraceRecord(
        "trace-1", "Evaluation", spans=[
            SpanRecord(
                "span-tool", None, "employee_lookup", datetime.now(timezone.utc),
                level="ERROR", status_message="provider timeout",
            )
        ],
    )

    suggestions = _trace_improvement_suggestions(result, trace)

    assert any(item["target"] == "Target tool policy" for item in suggestions)
    assert any("arguments against its schema" in item["change"] for item in suggestions)
    assert any(item["target"] == "Runtime error handling" for item in suggestions)


def test_trace_analysis_does_not_invent_changes_for_clean_trace():
    from src.ui.observations import _trace_improvement_suggestions
    from src.workbench_models import CaseResult

    result = CaseResult("case-1", "trace-1", "answer", {"execution": 1.0}, {}, (), None, (), "PASS")

    assert _trace_improvement_suggestions(result, None) == ()


def _visible(app: AppTest, kind: str) -> str:
    return "\n".join(str(node.value) for node in app.get(kind))


def test_overview_renders_target_scoped_metrics():
    script = '''
from src.ui.observations import render_observation_overview
from src.workbench_models import TraceSummary

class Repository:
    def list_traces(self, agent_id):
        assert agent_id == "agent-1"
        return [
            TraceSummary("t1", "r1", "c1", agent_id, "PASS", "2026-08-04", 12.0, 3, 0.01),
            TraceSummary("t2", "r2", "c2", agent_id, "FAIL", "2026-08-04", 8.0, 2, 0.02),
        ]

render_observation_overview(Repository(), "agent-1")
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert [metric.value for metric in app.metric] == ["2", "5", "1", "$0.0300"]


def test_overview_and_trace_list_render_empty_states():
    script = '''
from src.ui.observations import render_observation_overview, render_trace_module

class Repository:
    def list_traces(self, agent_id):
        return []

render_observation_overview(Repository(), "agent-1")
render_trace_module(Repository(), "agent-1")
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert len(app.info) == 2
    assert "Run an evaluation" in _visible(app, "info")


def test_trace_list_renders_persisted_summary_columns():
    script = '''
from src.ui.observations import render_trace_module
from src.workbench_models import TraceSummary

class Repository:
    def list_traces(self, agent_id):
        assert agent_id == "agent-1"
        return [
            TraceSummary(
                "trace-1", "run-1", "case-1", agent_id, "PASS",
                "2026-08-04T01:00:00+00:00", 15.5, 4, 0.0123,
            )
        ]

render_trace_module(Repository(), "agent-1")
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    table = app.dataframe[0].value
    assert list(table.columns) == [
        "Trace",
        "Case",
        "Status",
        "Started",
        "Observations",
        "Latency (ms)",
        "Cost",
        "View",
    ]
    assert table.iloc[0].to_dict() == {
        "Trace": "trace-1",
        "Case": "case-1",
        "Status": "PASS",
        "Started": "2026-08-04T01:00:00+00:00",
        "Observations": 4,
        "Latency (ms)": 15.5,
        "Cost": 0.0123,
        "View": "View",
    }


def test_trace_detail_renders_raw_span_tree_and_session_fail_marker():
    script = '''
from datetime import datetime, timedelta, timezone
import streamlit as st

from src.models import SpanRecord, TraceRecord
from src.ui.observations import render_trace_module
from src.workbench_models import CaseResult, TraceDetail, TraceSummary

summary = TraceSummary(
    "trace-1", "run-1", "case-1", "agent-1", "PASS",
    "2026-08-04T01:00:00+00:00", 15.5, 2, 0.0123,
)
result = CaseResult(
    "case-1", "trace-1", "final answer", {}, {}, (), None, (), "PASS",
)

class Repository:
    def get_trace(self, trace_id):
        assert trace_id == "trace-1"
        return TraceDetail(summary, result)

started = datetime(2026, 8, 4, tzinfo=timezone.utc)
raw = TraceRecord(
    "trace-1",
    "Evaluation",
    spans=[
        SpanRecord(
            "span-1", None, "Agent response", started,
            end_time=started + timedelta(milliseconds=15.5),
            observation_type="agent",
        ),
        SpanRecord(
            "span-2", "span-1", "Tool call", started + timedelta(milliseconds=2),
            end_time=started + timedelta(milliseconds=8),
            observation_type="tool",
        ),
    ],
)

st.session_state.selected_trace_id = "trace-1"
st.session_state["trace_marked_fail_trace-1"] = True
render_trace_module(Repository(), "agent-1", trace_provider=lambda trace_id: raw)
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert [metric.value for metric in app.metric[:4]] == [
        "PASS",
        "2",
        "15.5 ms",
        "$0.0123",
    ]
    assert any(button.label == "Unmark fail" for button in app.button)
    assert "Marked as failed for this review session" in _visible(app, "caption")
    assert "Agent response" in "\n".join(button.label for button in app.button)
    assert "final answer" in _visible(app, "code")
