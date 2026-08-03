"""Observation overview and persisted trace explorer."""
from __future__ import annotations

from dataclasses import asdict
from collections.abc import Callable
from typing import Any

import streamlit as st

from src.models import SpanRecord, TraceRecord
from src.workbench_repository import WorkbenchRepository


def render_observation_overview(repository: WorkbenchRepository, agent_id: str) -> None:
    traces = repository.list_traces(agent_id)
    st.title("Observation Overview")
    st.caption("Operational visibility across persisted evaluation traces.")
    total_cost = sum(trace.cost_usd for trace in traces)
    failures = sum(trace.status.upper() not in {"PASS", "PASSED", "COMPLETED"} for trace in traces)
    cols = st.columns(4)
    cols[0].metric("Traces", len(traces))
    cols[1].metric("Observations", sum(trace.observation_count for trace in traces))
    cols[2].metric("Non-passing", failures)
    cols[3].metric("Total cost", f"${total_cost:.4f}")
    if not traces:
        st.info("No traces yet. Run an evaluation to create observation data.")


def render_trace_module(
    repository: WorkbenchRepository,
    agent_id: str,
    *,
    trace_provider: Callable[[str], object | None] | None = None,
) -> None:
    selected = st.session_state.get("selected_trace_id")
    if selected:
        _render_trace_detail(repository, agent_id, selected, trace_provider)
        return

    st.markdown("### Traces")
    st.caption("Case-level traces captured by evaluation runs.")
    traces = repository.list_traces(agent_id)
    if not traces:
        st.info("No traces yet. Run an evaluation to create one.")
        return
    rows = [
        {
            "Trace": trace.trace_id,
            "Case": trace.case_id,
            "Status": trace.status,
            "Started": trace.started_at,
            "Spans": trace.observation_count,
            "Latency (ms)": trace.latency_ms,
            "Cost": trace.cost_usd,
            "View": "View",
        }
        for trace in traces
    ]
    st.dataframe(
        rows,
        column_config={
            "Trace": st.column_config.TextColumn("Trace", width="large"),
            "Case": st.column_config.TextColumn("Case", width="medium"),
            "Status": st.column_config.TextColumn("Status", width="small"),
            "Started": st.column_config.TextColumn("Started", width="medium"),
            "Spans": st.column_config.NumberColumn("Spans", width="small"),
            "Latency (ms)": st.column_config.NumberColumn("Latency", format="%.1f ms", width="small"),
            "Cost": st.column_config.NumberColumn("Cost", format="$%.4f", width="small"),
            "View": st.column_config.ButtonColumn(
                "",
                type="tertiary",
                width="small",
                key="trace_list_actions",
                on_click=_open_trace,
                args=(tuple(trace.trace_id for trace in traces),),
            ),
        },
        hide_index=True,
        width="stretch",
    )


def _open_trace(trace_ids: tuple[str, ...]) -> None:
    click = st.session_state.get("trace_list_actions")
    if not click:
        return
    row = int(click["row"])
    if 0 <= row < len(trace_ids):
        st.session_state.selected_trace_id = trace_ids[row]


def _render_trace_detail(
    repository: WorkbenchRepository,
    agent_id: str,
    trace_id: str,
    trace_provider: Callable[[str], object | None] | None,
) -> None:
    try:
        detail = repository.get_trace(trace_id)
    except KeyError:
        st.session_state.selected_trace_id = None
        st.warning("The selected trace no longer exists.")
        return
    if detail.summary.agent_id != agent_id:
        st.session_state.selected_trace_id = None
        st.error("This trace does not belong to the selected Target.")
        return
    if st.button("← Back to traces", key="trace_back"):
        st.session_state.selected_trace_id = None
        st.rerun()
    marked_key = f"trace_marked_fail_{trace_id}"
    analysis_key = f"trace_analysis_open_{trace_id}"
    with st.container(horizontal=True, vertical_alignment="center", key="trace_detail_actions"):
        st.markdown("### Trace Detail")
        if st.button(
            "Unmark fail" if st.session_state.get(marked_key) else "Mark fail",
            key="trace_mark_fail",
            type="tertiary",
        ):
            st.session_state[marked_key] = not st.session_state.get(marked_key, False)
            st.rerun()
        if st.button("Analysis", key="trace_analysis", type="tertiary"):
            st.session_state[analysis_key] = not st.session_state.get(analysis_key, False)
            st.rerun()
    st.caption(detail.summary.trace_id)
    if st.session_state.get(marked_key):
        st.caption("🔴 Marked as failed for this review session")
    cols = st.columns(4)
    cols[0].metric("Status", detail.summary.status)
    cols[1].metric("Observations", detail.summary.observation_count)
    cols[2].metric("Latency", f"{detail.summary.latency_ms:.1f} ms" if detail.summary.latency_ms is not None else "—")
    cols[3].metric("Cost", f"${detail.summary.cost_usd:.4f}")

    raw_trace = trace_provider(trace_id) if trace_provider else None
    if st.session_state.get(analysis_key):
        _render_trace_analysis(detail.result, raw_trace)
    st.subheader("Span tree")
    if isinstance(raw_trace, TraceRecord) and raw_trace.spans:
        _render_span_tree(raw_trace)
    else:
        st.caption("Raw span data is not available for this trace.")

    st.subheader("Response")
    st.code(detail.result.response or "(empty)")
    st.subheader("Tool observations")
    if not detail.result.tool_evidence:
        st.caption("No tool observations recorded.")
    for item in detail.result.tool_evidence:
        with st.expander(f"{item.tool_id} · {item.effect_status}"):
            st.json(asdict(item))
    st.subheader("Judge observation")
    if detail.result.judge is None:
        st.caption("No judge observation recorded.")
    else:
        st.json(asdict(detail.result.judge))
    st.subheader("Deterministic scores")
    st.json(dict(detail.result.deterministic_scores))


_SPAN_ICONS = {
    "agent": "🧠",
    "generation": "✦",
    "tool": "🔧",
    "evaluator": "✓",
    "span": "◇",
}


def _span_latency(span: SpanRecord) -> float | None:
    if span.end_time is None:
        return None
    return (span.end_time - span.start_time).total_seconds() * 1000


def _span_rows(trace: TraceRecord) -> list[tuple[SpanRecord, int, bool]]:
    """Flatten the parent/child graph while retaining tree presentation data."""
    result: list[tuple[SpanRecord, int, bool]] = []
    visited: set[str] = set()

    def visit(span: SpanRecord, depth: int, is_last: bool) -> None:
        if span.id in visited:
            return
        visited.add(span.id)
        result.append((span, depth, is_last))
        children = trace.children_of(span.id)
        for index, child in enumerate(children):
            visit(child, depth + 1, index == len(children) - 1)

    roots = trace.roots()
    for index, root in enumerate(roots):
        visit(root, 0, index == len(roots) - 1)
    for span in trace.spans:
        if span.id not in visited:
            visit(span, 0, True)
    return result


def _render_span_tree(trace: TraceRecord) -> None:
    rows = _span_rows(trace)
    starts = [span.start_time for span, _, _ in rows]
    ends = [span.end_time or span.start_time for span, _, _ in rows]
    trace_start = min(starts)
    trace_end = max(ends)
    total_ms = max((trace_end - trace_start).total_seconds() * 1000, 0.01)

    st.markdown(
        "<div class='trace-waterfall-header'><span>SPAN</span><span>TIMELINE</span><span>DURATION</span></div>",
        unsafe_allow_html=True,
    )
    for span, depth, is_last in rows:
        icon = _SPAN_ICONS.get(span.observation_type, "◇")
        branch = "└─" if is_last else "├─"
        relation = f"{'│  ' * max(depth - 1, 0)}{branch} " if depth else ""
        latency = _span_latency(span)
        offset_ms = (span.start_time - trace_start).total_seconds() * 1000
        left = max(0.0, min(100.0, offset_ms / total_ms * 100))
        width = max(1.2, min(100.0 - left, (latency or 0.0) / total_ms * 100))
        name_col, timeline_col, duration_col = st.columns([4.2, 5.8, 1.2], vertical_alignment="center")
        label = f"{relation}{icon} {span.name}"
        name_col.button(
            label,
            key=f"trace_span_{span.id}",
            width="stretch",
            type="primary" if st.session_state.get("selected_span_id") == span.id else "tertiary",
            on_click=_select_span,
            args=(span.id,),
        )
        color = "#B3261E" if span.level == "ERROR" else _span_color(span.observation_type)
        timeline_col.markdown(
            "<div class='trace-waterfall-track'>"
            f"<span style='left:{left:.2f}%;width:{width:.2f}%;background:{color}'></span>"
            "</div>",
            unsafe_allow_html=True,
        )
        duration_col.caption(f"{latency:.1f} ms" if latency is not None else "Running")

    selected_id = st.session_state.get("selected_span_id")
    selected = next((span for span, _, _ in rows if span.id == selected_id), rows[0][0])
    st.session_state.selected_span_id = selected.id
    _render_span_detail(selected)


def _select_span(span_id: str) -> None:
    st.session_state.selected_span_id = span_id


def _span_color(observation_type: str) -> str:
    return {
        "agent": "#176B55",
        "generation": "#7C5CBF",
        "tool": "#2878B5",
        "evaluator": "#B7791F",
    }.get(observation_type, "#6D8078")


def _render_span_detail(span: SpanRecord) -> None:
    icon = _SPAN_ICONS.get(span.observation_type, "◇")
    with st.container(border=True):
        st.markdown(f"#### {icon} {span.name}")
        st.caption(f"{span.observation_type.upper()} · {span.level}")
        identity, timing_col, model = st.columns(3)
        identity.caption(f"Span ID\n{span.id}")
        timing_col.caption(f"Parent\n{span.parent_id or 'Root'}")
        model.caption(f"Model\n{span.model or '—'}")
        if span.status_message:
            st.error(span.status_message)
        input_tab, output_tab, metadata_tab = st.tabs(["Input", "Output", "Metadata"])
        with input_tab:
            _json_section("Input", span.input)
        with output_tab:
            _json_section("Output", span.output)
        with metadata_tab:
            _json_section("Metadata", span.metadata)
        if span.usage_details or span.cost_details:
            usage, cost = st.columns(2)
            with usage:
                _json_section("Usage", span.usage_details)
            with cost:
                _json_section("Cost", span.cost_details)


def _json_section(label: str, value: Any) -> None:
    st.markdown(f"**{label}**")
    if value in (None, {}, []):
        st.caption("Not recorded")
    else:
        st.json(value)


def _render_trace_analysis(result: Any, raw_trace: object | None) -> None:
    with st.container(border=True):
        st.markdown("#### Analysis")
        span_count = len(raw_trace.spans) if isinstance(raw_trace, TraceRecord) else 0
        error_count = (
            sum(span.level == "ERROR" for span in raw_trace.spans)
            if isinstance(raw_trace, TraceRecord)
            else 0
        )
        tool_count = len(result.tool_evidence)
        judge_score = result.judge.average if result.judge is not None else None
        columns = st.columns(4)
        columns[0].metric("Spans", span_count or "—")
        columns[1].metric("Errors", error_count)
        columns[2].metric("Tool calls", tool_count)
        columns[3].metric("Judge", f"{judge_score:.2f}" if judge_score is not None else "—")
        if result.deterministic_reasons:
            st.markdown("**Deterministic findings**")
            for name, reason in result.deterministic_reasons.items():
                st.caption(f"{name}: {reason}")
