"""Immutable Report history, result-first visualization, and comparison UI."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import streamlit as st
import pandas as pd

from src.workbench_models import ReportSnapshot
from src.workbench_repository import WorkbenchRepository

from .charts import cost_figure, judge_figure, tool_funnel_figure


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _number_or_none(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _judge_average(value: Any) -> float | None:
    judge = _mapping(value)
    if not judge:
        return None
    if "average" in judge:
        return _number_or_none(judge["average"])
    scores = _mapping(judge.get("scores"))
    return sum(float(score) for score in scores.values()) / len(scores) if scores else None


def _effect_status(evidence: Mapping[str, Any]) -> str:
    if not evidence.get("verification_required", False):
        return "NOT REQUIRED"
    return "VERIFIED" if evidence.get("effect_verified") is True else "UNVERIFIED"


def report_view_model(summary: Mapping[str, Any]) -> dict[str, Any]:
    """Normalize immutable summary data without manufacturing optional evidence."""
    cases: list[dict[str, Any]] = []
    tool_evidence: list[dict[str, Any]] = []
    case_counts = {"PASS": 0, "FAIL": 0, "INCOMPLETE": 0}
    for case in summary.get("cases", ()):
        item = _mapping(case)
        status = str(item.get("status", "INCOMPLETE"))
        average = _judge_average(item.get("judge"))
        cases.append({
            "Case": str(item.get("case_id", "")),
            "Status": status,
            "Judge score": f"{average:.2f}" if average is not None else "Not available",
            "Trace": str(item.get("trace_id", "")),
        })
        case_counts[status] = case_counts.get(status, 0) + 1
        for evidence in item.get("tool_evidence", ()):
            evidence_item = _mapping(evidence)
            tool_evidence.append({
                "Case": str(item.get("case_id", "")),
                "Tool": str(evidence_item.get("tool_id", "Unknown")),
                "Requested": "YES" if evidence_item.get("requested") else "NO",
                "Executed": "YES" if evidence_item.get("executed") else "NO",
                "Succeeded": "YES" if evidence_item.get("succeeded") else "NO",
                "Effect verification": _effect_status(evidence_item),
            })

    metrics = _mapping(summary.get("metrics"))
    stored_pass_rate = _number_or_none(metrics.get("pass_rate"))
    pass_rate = stored_pass_rate if stored_pass_rate is not None else (
        case_counts["PASS"] / len(cases) * 100 if cases else 0.0
    )
    costs = _mapping(summary.get("costs"))
    normalized_costs = {
        "Agent": _number_or_none(costs.get("agent")),
        "Judge": _number_or_none(costs.get("judge")),
        "Evaluation total": _number_or_none(costs.get("evaluation_total")),
        "Dataset (excluded)": _number_or_none(costs.get("dataset")),
    }
    tokens = {
        str(name): _number_or_none(value) for name, value in _mapping(summary.get("tokens")).items()
    }
    judge_dimensions = _mapping(summary.get("judge_dimensions"))
    return {
        "status": str(summary.get("status", "INCOMPLETE")),
        "cases": cases,
        "case_counts": case_counts,
        "pass_rate": pass_rate,
        "tool_evidence": tool_evidence,
        "tool_funnel": _mapping(summary.get("tool_funnel")),
        "judge_dimensions": judge_dimensions,
        "judge_available": bool(judge_dimensions),
        "costs": normalized_costs,
        "tokens": tokens,
        "usage_available": any(value is not None for value in tokens.values()) or any(
            value is not None for value in normalized_costs.values()
        ),
        "failures": list(summary.get("failures", ())),
    }


def comparison_view_model(comparison: Any) -> dict[str, Any]:
    """Expose every comparison group without inventing unmatched-case rates."""
    return {
        "Shared-case pass rate delta": float(comparison.pass_rate_delta_shared),
        "Different dataset revisions": bool(comparison.different_dataset_revisions),
        "Agent changes": dict(comparison.agent_changes),
        "Judge score deltas": dict(comparison.judge_deltas),
        "Tool-state changes": dict(comparison.tool_state_deltas),
        "Token deltas": dict(comparison.token_deltas),
        "Cost delta": _number_or_none(comparison.cost_delta_usd),
        "Resolved failures": tuple(comparison.resolved_failure_ids),
        "Regressions": tuple(comparison.regression_ids),
        "Unchanged failures": tuple(comparison.unchanged_failure_ids),
        "Added cases": tuple(comparison.added_case_ids),
        "Removed cases": tuple(comparison.removed_case_ids),
        "Shared cases": tuple(comparison.shared_case_ids),
    }


def _status_banner(status: str) -> None:
    palettes = {
        "PASS": ("#E4F0E9", "#176B55", "All required evaluation evidence passed."),
        "FAIL": ("#FCE8E6", "#B3261E", "One or more cases failed evaluation."),
        "NEEDS ATTENTION": ("#FCE8E6", "#B3261E", "Review the failed cases and evidence below."),
        "INCOMPLETE": ("#EEF1EF", "#485B55", "Evaluation evidence is incomplete."),
    }
    background, color, message = palettes.get(status, palettes["INCOMPLETE"])
    st.markdown(
        f"<div style='background:{background};color:{color};border:1px solid #DCE3DF;"
        "border-radius:12px;padding:14px 16px;margin-bottom:12px;'>"
        f"<strong>{status}</strong><br>{message}</div>",
        unsafe_allow_html=True,
    )


def _format_reason(value: Any) -> str:
    if isinstance(value, Mapping):
        return "; ".join(f"{key}: {item}" for key, item in value.items()) or "No reason recorded"
    if isinstance(value, (list, tuple)):
        return "; ".join(str(item) for item in value) or "No reason recorded"
    return str(value) if value else "No reason recorded"


def render_result_kpis(view: Mapping[str, Any]) -> None:
    counts = _mapping(view.get("case_counts"))
    columns = st.columns(4)
    columns[0].metric("Pass Rate", f"{float(view['pass_rate']):.1f}%")
    columns[1].metric("Passed", int(counts.get("PASS", 0)))
    columns[2].metric("Failed", int(counts.get("FAIL", 0)))
    columns[3].metric("Incomplete", int(counts.get("INCOMPLETE", 0)))


def render_case_results(view: Mapping[str, Any]) -> None:
    st.markdown("#### Case results")
    st.caption("PASS and FAIL remain literal in every stored case result.")
    if view["cases"]:
        rows = pd.DataFrame(view["cases"])
        st.dataframe(rows.style.map(case_status_style, subset=["Status"]), width="stretch", hide_index=True)
    else:
        st.info("No case results are stored in this Report.")


def case_status_style(status: str) -> str:
    """Style literal case-result statuses without obscuring their text."""
    if status == "PASS":
        return "color: #176B55; font-weight: 700"
    if status == "FAIL":
        return "color: #B3261E; font-weight: 700"
    return ""


def render_failure_reasons(view: Mapping[str, Any], langfuse_base_url: str | None) -> None:
    st.markdown("#### Failure reasons")
    if not view["failures"]:
        st.caption("No failure reasons — every stored case passed.")
        return
    for failure in view["failures"]:
        item = _mapping(failure)
        case_id = str(item.get("case_id", "Unknown case"))
        status = str(item.get("status", "INCOMPLETE"))
        color = "#176B55" if status == "PASS" else "#B3261E" if status == "FAIL" else "#485B55"
        with st.container(border=True):
            st.markdown(
                f"<span style='color:{color};font-weight:700'>{status}</span> · {case_id}",
                unsafe_allow_html=True,
            )
            deterministic = item.get("deterministic_reasons", item.get("deterministic_reason_codes"))
            st.caption(f"Deterministic: {_format_reason(deterministic)}")
            st.caption(f"Judge: {_format_reason(item.get('judge_reasons'))}")
            st.caption(f"Tool evidence: {_format_reason(item.get('failed_tool_states'))}")
            trace_id = str(item.get("trace_id", ""))
            if langfuse_base_url and trace_id:
                st.markdown(f"[Open trace in Langfuse]({langfuse_base_url.rstrip('/')}/trace/{trace_id})")
            elif trace_id:
                st.caption(f"Langfuse trace: {trace_id}")


def render_tool_evidence(view: Mapping[str, Any]) -> None:
    st.plotly_chart(
        tool_funnel_figure(_mapping(view.get("tool_funnel"))),
        width="stretch", config={"displayModeBar": False},
    )
    st.dataframe(view["tool_evidence"], width="stretch", hide_index=True)


def _format_cost(value: float | None) -> str:
    return f"${value:.4f}" if value is not None else "Not available"


def _format_delta(value: float | int | None, format_spec: str) -> str:
    return format(value, format_spec) if value is not None else "Not available"


def render_usage_and_cost(view: Mapping[str, Any]) -> None:
    st.markdown("#### Token totals")
    token_rows = [
        {"Token total": name.replace("_", " ").title(), "Tokens": int(value)}
        for name, value in view["tokens"].items() if value is not None
    ]
    if token_rows:
        st.dataframe(token_rows, width="stretch", hide_index=True)
    else:
        st.caption("Token totals: Not available")
    costs = _mapping(view["costs"])
    if costs.get("Agent") is not None or costs.get("Judge") is not None:
        st.markdown("#### Agent and Judge costs")
        st.plotly_chart(
            cost_figure({"agent": costs.get("Agent"), "judge": costs.get("Judge")}),
            width="stretch", config={"displayModeBar": False},
        )
    st.markdown("#### Cost scope")
    for column, (label, value) in zip(st.columns(4), costs.items(), strict=True):
        column.metric(label, _format_cost(value))
    st.caption("Agent and Judge are included in Evaluation Total. Dataset Generation is excluded.")


def render_report_summary(summary: Mapping[str, Any], *, langfuse_base_url: str | None = None) -> None:
    """Render result-first Report sections from an immutable summary."""
    view = report_view_model(summary)
    identity = _mapping(summary.get("identity"))
    agent = _mapping(identity.get("agent"))
    dataset = _mapping(identity.get("dataset"))
    _status_banner(view["status"])
    st.caption(
        f"{agent.get('name', 'Agent')} · Agent Revision {agent.get('revision', '—')} · "
        f"{dataset.get('name', 'Dataset')} · Dataset Revision {dataset.get('revision', '—')}"
    )
    st.markdown("## Test Results")
    render_result_kpis(view)
    render_case_results(view)
    render_failure_reasons(view, langfuse_base_url)
    st.markdown("## Tool Evidence")
    if view["tool_evidence"]:
        render_tool_evidence(view)
    else:
        st.caption("Not available for this run")
    st.markdown("## LLM Judge")
    if view["judge_available"]:
        st.caption("Correctness, Relevance, Completeness, and Safety use the fixed Judge rubric.")
        st.plotly_chart(
            judge_figure(_mapping(view["judge_dimensions"])),
            width="stretch", config={"displayModeBar": False},
        )
    else:
        st.caption("Not available for this run")


def _report_label(report: ReportSnapshot) -> str:
    identity = _mapping(report.summary.get("identity"))
    dataset = _mapping(identity.get("dataset"))
    return (
        f"{report.created_at} · {report.status} · {dataset.get('name', 'Dataset')} "
        f"R{dataset.get('revision', '—')} · artifact {report.artifact_version}"
    )


def _fallback_compare(repository: WorkbenchRepository, baseline: ReportSnapshot, current: ReportSnapshot) -> Any:
    from src.report_compare import compare_report_summaries

    baseline_run = repository.get_run(baseline.run_id)
    current_run = repository.get_run(current.run_id)
    baseline_config = repository.get_agent_revision(baseline_run.agent_revision_id).config_snapshot
    current_config = repository.get_agent_revision(current_run.agent_revision_id).config_snapshot
    return compare_report_summaries(
        baseline.report_id, dict(baseline.summary), dict(baseline_config),
        current.report_id, dict(current.summary), dict(current_config),
    )


def _render_id_group(label: str, values: tuple[str, ...], empty: str) -> None:
    st.markdown(f"**{label}**")
    st.caption(", ".join(values) if values else empty)


def render_comparison(comparison: Any) -> None:
    view = comparison_view_model(comparison)
    if view["Different dataset revisions"]:
        st.markdown(
            "<div style='background:#FBF4E4;border:1px solid #EADCB8;border-radius:12px;padding:14px 16px;'>"
            "<strong>Different dataset revisions</strong><br>Headline results use shared cases only; added and removed cases are listed separately."
            "</div>", unsafe_allow_html=True,
        )
    kpis = st.columns(4)
    kpis[0].metric("Shared-case pass rate delta", f"{view['Shared-case pass rate delta']:+.1f} pp")
    kpis[1].metric("Shared cases", len(view["Shared cases"]))
    kpis[2].metric(
        "Evaluation cost delta",
        f"${view['Cost delta']:+.4f}" if view["Cost delta"] is not None else "Not available",
    )
    kpis[3].metric("Regressions", len(view["Regressions"]))
    st.markdown("#### Agent configuration diff")
    changes = [
        {"Setting": key, "Baseline": str(value.get("before")), "Current": str(value.get("after"))}
        for key, value in view["Agent changes"].items()
    ]
    if changes:
        st.dataframe(changes, width="stretch", hide_index=True)
    else:
        st.caption("No tracked Agent configuration changes.")
    score, evidence, tokens = st.columns(3)
    with score:
        st.markdown("#### Judge score deltas")
        st.dataframe([{"Dimension": key.title(), "Delta": _format_delta(value, "+.2f")} for key, value in view["Judge score deltas"].items()], width="stretch", hide_index=True)
    with evidence:
        st.markdown("#### Tool-state changes")
        st.dataframe([{"State": key.title(), "Delta": f"{value:+d}"} for key, value in view["Tool-state changes"].items()], width="stretch", hide_index=True)
    with tokens:
        st.markdown("#### Token deltas")
        st.dataframe([{"Category": key, "Delta": _format_delta(value, "+d")} for key, value in view["Token deltas"].items()], width="stretch", hide_index=True)
    groups = st.columns(3)
    with groups[0]:
        _render_id_group("Resolved failures", view["Resolved failures"], "None")
        _render_id_group("Regressions", view["Regressions"], "None")
    with groups[1]:
        _render_id_group("Unchanged failures", view["Unchanged failures"], "None")
        _render_id_group("Shared cases", view["Shared cases"], "None")
    with groups[2]:
        _render_id_group("Added cases", view["Added cases"], "None")
        _render_id_group("Removed cases", view["Removed cases"], "None")


def render_reports_module(
    repository: WorkbenchRepository, agent_id: str, report_service: Any | None = None,
    *, langfuse_base_url: str | None = None,
) -> None:
    """Render selected-Agent Report history and its revision-aware comparison."""
    reports = repository.list_reports(agent_id)
    st.subheader("Report history")
    st.caption("Every entry is an immutable summary snapshot for this Agent.")
    if not reports:
        with st.container(border=True):
            st.markdown("**No reports yet**")
            st.caption("Run an evaluation to create the first Report snapshot.")
        return
    reports_by_id = {report.report_id: report for report in reports}
    report_ids = list(reports_by_id)
    selected_id = st.session_state.get("selected_report_id")
    selected_index = next((index for index, report in enumerate(reports) if report.report_id == selected_id), 0)
    selected_report_id = st.selectbox(
        "Report", report_ids, index=selected_index, key=f"report_history_{agent_id}",
        format_func=lambda report_id: _report_label(reports_by_id[report_id]),
    )
    selected = reports_by_id[selected_report_id]
    st.session_state["selected_report_id"] = selected.report_id
    render_report_summary(selected.summary, langfuse_base_url=langfuse_base_url)
    st.markdown("## Comparison")
    if len(reports) < 2:
        st.caption("Comparison requires at least two Reports.")
    else:
        baseline_ids = [report_id for report_id in report_ids if report_id != selected.report_id]
        baseline_key = f"report_baseline_{agent_id}"
        baseline_report_key = f"report_baseline_selected_{agent_id}"
        if st.session_state.get(baseline_report_key) != selected.report_id:
            st.session_state.pop(baseline_key, None)
            st.session_state[baseline_report_key] = selected.report_id
        selected_index = reports.index(selected)
        preceding_index = selected_index + 1 if selected_index + 1 < len(reports) else selected_index - 1
        default_baseline_id = reports[preceding_index].report_id
        baseline_id = st.selectbox(
            "Baseline", baseline_ids, index=baseline_ids.index(default_baseline_id),
            key=baseline_key,
            format_func=lambda report_id: _report_label(reports_by_id[report_id]),
        )
        baseline = reports_by_id[baseline_id]
        try:
            comparison = report_service.compare(baseline.report_id, selected.report_id) if report_service is not None else _fallback_compare(repository, baseline, selected)
        except (ImportError, KeyError, ValueError) as error:
            st.error(f"Comparison is unavailable: {error}")
        else:
            render_comparison(comparison)
    st.markdown("## Usage & Cost")
    view = report_view_model(selected.summary)
    if view["usage_available"]:
        render_usage_and_cost(view)
    else:
        st.caption("Not available for this run")
