"""Immutable Report history, summary visualization, and comparison UI."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import streamlit as st

from src.workbench_models import ReportSnapshot
from src.workbench_repository import WorkbenchRepository

from .charts import cost_figure, judge_figure, tool_funnel_figure


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _judge_average(value: Any) -> float | None:
    judge = _mapping(value)
    if not judge:
        return None
    if "average" in judge:
        return float(judge["average"])
    scores = _mapping(judge.get("scores"))
    return sum(float(score) for score in scores.values()) / len(scores) if scores else None


def _effect_status(evidence: Mapping[str, Any]) -> str:
    if not evidence.get("verification_required", False):
        return "NOT REQUIRED"
    return "VERIFIED" if evidence.get("effect_verified") is True else "UNVERIFIED"


def report_view_model(summary: Mapping[str, Any]) -> dict[str, Any]:
    """Normalize the persisted summary into textual, presentation-only rows."""
    case_rows: list[dict[str, Any]] = []
    evidence_rows: list[dict[str, Any]] = []
    for case in summary.get("cases", ()):
        case_map = _mapping(case)
        average = _judge_average(case_map.get("judge"))
        case_rows.append(
            {
                "Case": str(case_map.get("case_id", "")),
                "Status": str(case_map.get("status", "INCOMPLETE")),
                "Judge score": f"{average:.2f}" if average is not None else "INCOMPLETE",
                "Trace": str(case_map.get("trace_id", "")),
            }
        )
        for evidence in case_map.get("tool_evidence", ()):
            item = _mapping(evidence)
            evidence_rows.append(
                {
                    "Case": str(case_map.get("case_id", "")),
                    "Tool": str(item.get("tool_id", "Unknown")),
                    "Requested": "YES" if item.get("requested") else "NO",
                    "Executed": "YES" if item.get("executed") else "NO",
                    "Succeeded": "YES" if item.get("succeeded") else "NO",
                    "Effect verification": _effect_status(item),
                }
            )
    costs = _mapping(summary.get("costs"))
    return {
        "status": str(summary.get("status", "INCOMPLETE")),
        "cases": case_rows,
        "tool_evidence": evidence_rows,
        "costs": {
            "Agent": float(costs.get("agent", 0.0)),
            "Judge": float(costs.get("judge", 0.0)),
            "Evaluation total": float(costs.get("evaluation_total", 0.0)),
            "Dataset (excluded)": float(costs.get("dataset", 0.0)),
        },
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
        "Cost delta": float(comparison.cost_delta_usd),
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
        "FAIL": ("#FBF4E4", "#765B22", "One or more cases failed evaluation."),
        "NEEDS ATTENTION": ("#FBF4E4", "#765B22", "Review the failed cases and evidence below."),
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


def render_report_summary(
    summary: Mapping[str, Any], *, langfuse_base_url: str | None = None
) -> None:
    """Render one ReportSnapshot strictly from its immutable summary."""
    view = report_view_model(summary)
    identity = _mapping(summary.get("identity"))
    agent = _mapping(identity.get("agent"))
    dataset = _mapping(identity.get("dataset"))
    metrics = _mapping(summary.get("metrics"))
    costs = _mapping(summary.get("costs"))

    _status_banner(view["status"])
    st.caption(
        f"{agent.get('name', 'Agent')} · Agent Revision {agent.get('revision', '—')} · "
        f"{dataset.get('name', 'Dataset')} · Dataset Revision {dataset.get('revision', '—')}"
    )

    kpis = st.columns(4)
    kpis[0].metric("Pass Rate", f"{float(metrics.get('pass_rate', 0.0)):.1f}%")
    kpis[1].metric("Judge Score", f"{float(metrics.get('judge_average', 0.0)):.2f}/5")
    verified = int(metrics.get("verified_tools", 0))
    required = int(metrics.get("required_verifications", 0))
    kpis[2].metric("Verified Tools", f"{verified}/{required}")
    kpis[3].metric("Evaluation Cost", f"${float(metrics.get('evaluation_cost_usd', 0.0)):.4f}")

    judge_column, funnel_column = st.columns(2)
    with judge_column:
        st.markdown("#### Judge dimensions (1–5)")
        st.caption("Correctness, Relevance, Completeness, and Safety use the fixed Judge rubric.")
        st.plotly_chart(
            judge_figure(_mapping(summary.get("judge_dimensions"))),
            width="stretch",
            config={"displayModeBar": False},
            key=f"report_judge_{identity.get('run_id', 'unknown')}",
        )
    with funnel_column:
        st.markdown("#### Tool evidence funnel")
        st.caption("Requested → Executed → Succeeded → Effect verified.")
        st.plotly_chart(
            tool_funnel_figure(_mapping(summary.get("tool_funnel"))),
            width="stretch",
            config={"displayModeBar": False},
            key=f"report_funnel_{identity.get('run_id', 'unknown')}",
        )

    st.markdown("#### Case results")
    st.caption("PASS, FAIL, and INCOMPLETE remain visible as text in every row.")
    if view["cases"]:
        st.dataframe(view["cases"], width="stretch", hide_index=True)
    else:
        st.info("No case results are stored in this Report.")

    st.markdown("#### Tool four-state evidence")
    if view["tool_evidence"]:
        st.dataframe(view["tool_evidence"], width="stretch", hide_index=True)
    else:
        st.caption("No Tool evidence was requested in this run.")

    cost_chart, cost_context = st.columns([2, 1])
    with cost_chart:
        st.markdown("#### Agent and Judge costs")
        st.caption("Only these categories are included in Evaluation Total.")
        st.plotly_chart(
            cost_figure(costs),
            width="stretch",
            config={"displayModeBar": False},
            key=f"report_cost_{identity.get('run_id', 'unknown')}",
        )
    with cost_context:
        st.markdown("#### Cost scope")
        st.metric("Agent", f"${view['costs']['Agent']:.4f}")
        st.metric("Judge", f"${view['costs']['Judge']:.4f}")
        st.metric("Evaluation Total", f"${view['costs']['Evaluation total']:.4f}")
        st.metric("Dataset Generation", f"${view['costs']['Dataset (excluded)']:.4f}")
        st.caption("Dataset Generation is excluded from Evaluation Total.")

    st.markdown("#### Failure reasons")
    if not view["failures"]:
        st.caption("No failure reasons — every stored case passed.")
    for failure in view["failures"]:
        item = _mapping(failure)
        case_id = str(item.get("case_id", "Unknown case"))
        status = str(item.get("status", "INCOMPLETE"))
        with st.container(border=True):
            st.markdown(f"**{status} · {case_id}**")
            deterministic = item.get("deterministic_reasons", item.get("deterministic_reason_codes"))
            judge_reasons = item.get("judge_reasons")
            failed_tools = item.get("failed_tool_states")
            st.caption(f"Deterministic: {_format_reason(deterministic)}")
            st.caption(f"Judge: {_format_reason(judge_reasons)}")
            st.caption(f"Tool evidence: {_format_reason(failed_tools)}")
            trace_id = str(item.get("trace_id", ""))
            if langfuse_base_url and trace_id:
                url = f"{langfuse_base_url.rstrip('/')}/trace/{trace_id}"
                st.markdown(f"[Open trace in Langfuse]({url})")
            elif trace_id:
                st.caption(f"Langfuse trace: {trace_id}")


def _report_label(report: ReportSnapshot) -> str:
    identity = _mapping(report.summary.get("identity"))
    dataset = _mapping(identity.get("dataset"))
    return (
        f"{report.created_at} · {report.status} · {dataset.get('name', 'Dataset')} "
        f"R{dataset.get('revision', '—')} · artifact {report.artifact_version}"
    )


def _fallback_compare(
    repository: WorkbenchRepository, baseline: ReportSnapshot, current: ReportSnapshot
) -> Any:
    from src.report_compare import compare_report_summaries

    baseline_run = repository.get_run(baseline.run_id)
    current_run = repository.get_run(current.run_id)
    baseline_config = repository.get_agent_revision(baseline_run.agent_revision_id).config_snapshot
    current_config = repository.get_agent_revision(current_run.agent_revision_id).config_snapshot
    return compare_report_summaries(
        baseline.report_id,
        dict(baseline.summary),
        dict(baseline_config),
        current.report_id,
        dict(current.summary),
        dict(current_config),
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
            "</div>",
            unsafe_allow_html=True,
        )
    kpis = st.columns(4)
    kpis[0].metric("Shared-case pass rate delta", f"{view['Shared-case pass rate delta']:+.1f} pp")
    kpis[1].metric("Shared cases", len(view["Shared cases"]))
    kpis[2].metric("Evaluation cost delta", f"${view['Cost delta']:+.4f}")
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
        st.dataframe(
            [{"Dimension": key.title(), "Delta": f"{value:+.2f}"} for key, value in view["Judge score deltas"].items()],
            width="stretch",
            hide_index=True,
        )
    with evidence:
        st.markdown("#### Tool-state changes")
        st.dataframe(
            [{"State": key.title(), "Delta": f"{value:+d}"} for key, value in view["Tool-state changes"].items()],
            width="stretch",
            hide_index=True,
        )
    with tokens:
        st.markdown("#### Token deltas")
        st.dataframe(
            [{"Category": key, "Delta": f"{value:+d}"} for key, value in view["Token deltas"].items()],
            width="stretch",
            hide_index=True,
        )

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
    repository: WorkbenchRepository,
    agent_id: str,
    report_service: Any | None = None,
    *,
    langfuse_base_url: str | None = None,
) -> None:
    """Render selected-Agent Report history and revision-aware comparison."""
    reports = repository.list_reports(agent_id)
    st.subheader("Report history")
    st.caption("Every entry is an immutable summary snapshot for this Agent.")
    if not reports:
        with st.container(border=True):
            st.markdown("**No reports yet**")
            st.caption("Run an evaluation to create the first Report snapshot.")
        return

    by_label = {_report_label(report): report for report in reports}
    report_labels = list(by_label)
    selected_id = st.session_state.get("selected_report_id")
    default_index = next(
        (index for index, report in enumerate(reports) if report.report_id == selected_id),
        0,
    )
    selected_label = st.selectbox(
        "Report", report_labels, index=default_index, key=f"report_history_{agent_id}"
    )
    selected = by_label[selected_label]
    st.session_state["selected_report_id"] = selected.report_id

    report_tab, compare_tab = st.tabs(["Report", "Compare"])
    with report_tab:
        render_report_summary(selected.summary, langfuse_base_url=langfuse_base_url)
    with compare_tab:
        if len(reports) < 2:
            st.info("At least two Reports are required for comparison.")
        else:
            baseline_label = st.selectbox(
                "Baseline", report_labels, index=1, key=f"report_baseline_{agent_id}"
            )
            current_label = st.selectbox(
                "Current", report_labels, index=0, key=f"report_current_{agent_id}"
            )
            baseline = by_label[baseline_label]
            current = by_label[current_label]
            if baseline.report_id == current.report_id:
                st.warning("Choose two different Reports.")
            else:
                try:
                    comparison = (
                        report_service.compare(baseline.report_id, current.report_id)
                        if report_service is not None
                        else _fallback_compare(repository, baseline, current)
                    )
                except (ImportError, KeyError, ValueError) as error:
                    st.error(f"Comparison is unavailable: {error}")
                else:
                    render_comparison(comparison)
