"""Observation overview and persisted trace explorer."""
from __future__ import annotations

from collections.abc import Callable

import streamlit as st

from src.workbench_repository import WorkbenchRepository


def render_observation_overview(repository: WorkbenchRepository, agent_id: str) -> None:
    """Render Target-scoped observation totals from persisted traces."""
    traces = repository.list_traces(agent_id)
    st.markdown("### Observation Overview")
    st.caption("Operational visibility across persisted evaluation traces.")

    total_cost = sum(trace.cost_usd for trace in traces)
    non_passing = sum(
        trace.status.upper() not in {"PASS", "PASSED", "COMPLETED"}
        for trace in traces
    )
    metrics = st.columns(4)
    metrics[0].metric("Traces", len(traces))
    metrics[1].metric(
        "Observations", sum(trace.observation_count for trace in traces)
    )
    metrics[2].metric("Non-passing", non_passing)
    metrics[3].metric("Total cost", f"${total_cost:.4f}")

    if not traces:
        st.info("No traces yet. Run an evaluation to create observation data.")


def render_trace_module(
    repository: WorkbenchRepository,
    agent_id: str,
    *,
    trace_provider: Callable[[str], object | None] | None = None,
) -> None:
    """Render the Target-scoped trace index or the selected trace detail."""
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
            "Observations": trace.observation_count,
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
            "Observations": st.column_config.NumberColumn(
                "Observations", width="small"
            ),
            "Latency (ms)": st.column_config.NumberColumn(
                "Latency", format="%.1f ms", width="small"
            ),
            "Cost": st.column_config.NumberColumn(
                "Cost", format="$%.4f", width="small"
            ),
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
    """Trace details are added by the next implementation step."""
    raise NotImplementedError
