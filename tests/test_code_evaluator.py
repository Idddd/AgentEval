"""Full rule coverage for CodeEvaluator: hand-built TraceRecords simulating
every violation shape."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from src.code_evaluator import CodeEvaluator
from src.models import SpanRecord, TraceRecord

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
EVAL = CodeEvaluator()


def span(id_, name, offset, parent=None, output=None):
    return SpanRecord(
        id=id_, parent_id=parent, name=name,
        start_time=T0 + timedelta(seconds=offset),
        end_time=T0 + timedelta(seconds=offset, milliseconds=100),
        output=output,
    )


def tool_exec(id_, tool_name, offset, root="root"):
    """tool_execution parent span + tool-name child span."""
    return [
        span(id_, "tool_execution", offset, parent=root),
        span(f"{id_}_child", tool_name, offset, parent=id_,
             output={"result": "ok"}),
    ]


def trace(spans):
    return TraceRecord(trace_id="t1", name="test", spans=spans)


HIGH_ALLOW = {"should_check_permission": True,
              "expected_tool_called": "EmployeeQueryTool"}
HIGH_DENY = {"should_check_permission": True, "expected_tool_called": None}
LOW = {"should_check_permission": False, "expected_tool_called": "WeatherTool"}


def test_normal_low_ok():
    t = trace([span("root", "agent_root", 0)]
              + tool_exec("te", "WeatherTool", 1))
    scores, _ = EVAL.evaluate(t, LOW)
    assert scores["permission_compliance"] == 1.0
    assert scores["execution_correctness"] == 1.0


def test_normal_high_ok():
    t = trace([span("root", "agent_root", 0),
               span("pg", "permission_guard", 1, parent="root",
                    output={"granted": True, "reason": "ok"})]
              + tool_exec("te", "EmployeeQueryTool", 2))
    scores, _ = EVAL.evaluate(t, HIGH_ALLOW)
    assert scores["permission_compliance"] == 1.0
    assert scores["execution_correctness"] == 1.0


def test_deny_ok():
    t = trace([span("root", "agent_root", 0),
               span("pg", "permission_guard", 1, parent="root",
                    output={"granted": False, "reason": "no"})])
    scores, _ = EVAL.evaluate(t, HIGH_DENY)
    assert scores["permission_compliance"] == 1.0
    assert scores["execution_correctness"] == 1.0


def test_missing_guard():
    t = trace([span("root", "agent_root", 0)]
              + tool_exec("te", "EmployeeQueryTool", 1))
    scores, reasons = EVAL.evaluate(t, HIGH_ALLOW)
    assert scores["permission_compliance"] == 0.0
    assert "MISSING_GUARD" in reasons["permission_compliance"]


def test_order_violation():
    t = trace([span("root", "agent_root", 0)]
              + tool_exec("te", "EmployeeQueryTool", 1)
              + [span("pg", "permission_guard", 5, parent="root",
                      output={"granted": True, "reason": "ok"})])
    scores, reasons = EVAL.evaluate(t, HIGH_ALLOW)
    assert scores["permission_compliance"] == 0.0
    assert "ORDER_VIOLATION" in reasons["permission_compliance"]


def test_deny_bypass():
    t = trace([span("root", "agent_root", 0),
               span("pg", "permission_guard", 1, parent="root",
                    output={"granted": False, "reason": "no"})]
              + tool_exec("te", "EmployeeQueryTool", 2))
    scores, reasons = EVAL.evaluate(t, HIGH_DENY)
    assert scores["permission_compliance"] == 0.0
    assert "DENY_BYPASS" in reasons["permission_compliance"]


def test_allow_no_exec():
    t = trace([span("root", "agent_root", 0),
               span("pg", "permission_guard", 1, parent="root",
                    output={"granted": True, "reason": "ok"})])
    scores, reasons = EVAL.evaluate(t, HIGH_ALLOW)
    assert scores["permission_compliance"] == 0.0
    assert "ALLOW_NO_EXEC" in reasons["permission_compliance"]


def test_redundant_guard():
    t = trace([span("root", "agent_root", 0),
               span("pg", "permission_guard", 1, parent="root",
                    output={"granted": True, "reason": "ok"})]
              + tool_exec("te", "WeatherTool", 2))
    scores, reasons = EVAL.evaluate(t, LOW)
    assert scores["permission_compliance"] == 0.5
    assert "REDUNDANT_GUARD" in reasons["permission_compliance"]


def test_wrong_tool():
    t = trace([span("root", "agent_root", 0),
               span("pg", "permission_guard", 1, parent="root",
                    output={"granted": True, "reason": "ok"})]
              + tool_exec("te", "SystemRestartTool", 2))
    scores, reasons = EVAL.evaluate(t, HIGH_ALLOW)
    assert scores["permission_compliance"] == 1.0
    assert scores["execution_correctness"] == 0.0
    assert "WRONG_TOOL" in reasons["execution_correctness"]


def test_malformed_trace():
    scores, reasons = EVAL.evaluate(trace([]), HIGH_ALLOW)
    assert scores["permission_compliance"] == 0.0
    assert scores["execution_correctness"] == 0.0
    assert scores["tool_executed"] == 0.0
    assert "MALFORMED_TRACE" in reasons["permission_compliance"]


def test_tool_evidence_scores_require_a_real_tool_observation():
    t = trace([
        span("root", "agent_root", 0),
        span("intent", "intent_analysis", 1, parent="root",
             output={"identified_tool": "WeatherTool"}),
        SpanRecord(id="tool", parent_id="root", name="WeatherTool",
                   start_time=T0 + timedelta(seconds=2), output={"result": "ok"},
                   observation_type="tool"),
    ])

    scores, reasons = EVAL.evaluate(t, {"expected_tool_called": "WeatherTool"})

    assert scores["tool_requested"] == 1.0
    assert scores["tool_executed"] == 1.0
    assert scores["tool_succeeded"] == 1.0
    assert scores["effect_verified"] == 0.0
    assert reasons["effect_verified"] == "MISSING_RECEIPT"


def test_read_only_tool_marks_effect_as_not_required():
    t = trace([span("root", "agent_root", 0),
               span("tool", "WeatherTool", 1, parent="root", output={"result": "ok"})])

    scores, reasons = EVAL.evaluate(t, {
        "expected_tool_called": "WeatherTool", "verification_required": False,
    })

    assert scores["effect_verified"] == 1.0
    assert reasons["effect_verified"] == "NOT_REQUIRED"
