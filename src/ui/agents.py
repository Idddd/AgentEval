"""Selected-Agent home overview for the modular workbench."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import streamlit as st

from src.agent_registry import AgentRegistry
from src.workbench_models import AgentProfile, ReportSnapshot
from src.workbench_repository import WorkbenchRepository

from .charts import cost_trend_figure, quality_trend_figure
from .state import navigate, select_agent


def valid_agents(repository: WorkbenchRepository) -> list[AgentProfile]:
    """Return only persisted Agents with an immutable revision to evaluate."""
    return [agent for agent in repository.list_agents() if agent.current_revision > 0]


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _evaluation_cost(costs: Mapping[str, Any]) -> float | None:
    value = costs.get("evaluation_total")
    return float(value) if value is not None else None


def report_history_rows(reports: Sequence[ReportSnapshot]) -> list[dict[str, Any]]:
    """Normalize immutable Report snapshots into newest-first Agent history rows."""
    ordered = sorted(
        reports,
        key=lambda report: (report.created_at, report.report_id),
        reverse=True,
    )
    rows: list[dict[str, Any]] = []
    for report in ordered:
        summary = _mapping(report.summary)
        identity = _mapping(summary.get("identity"))
        agent = _mapping(identity.get("agent"))
        dataset = _mapping(identity.get("dataset"))
        metrics = _mapping(summary.get("metrics"))
        costs = _mapping(summary.get("costs"))
        current_rate = float(metrics.get("pass_rate", 0.0))
        rows.append(
            {
                "Report ID": report.report_id,
                "Time": report.created_at,
                "Agent revision": agent.get("revision"),
                "Dataset revision": dataset.get("revision"),
                "Status": summary.get("status", report.status),
                "Pass rate": current_rate,
                "Pass rate delta": None,
                "Cost": _evaluation_cost(costs),
            }
        )
    for index, row in enumerate(rows[:-1]):
        row["Pass rate delta"] = row["Pass rate"] - rows[index + 1]["Pass rate"]
    return rows


def _tool_rows(agent_id: str, repository: WorkbenchRepository) -> list[dict[str, Any]]:
    revision = repository.get_current_agent_revision(agent_id)
    if revision is None:
        return []
    return [
        {
            "Name": tool.name,
            "Tool ID": tool.tool_id,
            "Connection": tool.connection_type.upper(),
            "Enabled": "Yes" if tool.enabled else "No",
            "Effect verification": "Required" if tool.verification_required else "Not required",
        }
        for tool in revision.tools
    ]


def _render_latest_report(report: ReportSnapshot | None) -> None:
    st.subheader("Latest Report")
    if report is None:
        st.caption("No immutable Reports have been created for this Agent yet.")
        return
    summary = _mapping(report.summary)
    identity = _mapping(summary.get("identity"))
    agent = _mapping(identity.get("agent"))
    metrics = _mapping(summary.get("metrics"))
    costs = _mapping(summary.get("costs"))
    with st.container(border=True):
        status, pass_rate, cost, action = st.columns([1.3, 1.2, 1.2, 1.1])
        status.markdown(f"**{summary.get('status', report.status)}**")
        pass_rate.metric("Pass rate", f"{float(metrics.get('pass_rate', 0.0)):.1f}%")
        evaluation_cost = _evaluation_cost(costs)
        cost.metric(
            "Evaluation cost",
            f"${evaluation_cost:.4f}" if evaluation_cost is not None else "Not available",
        )
        if action.button("View report", key=f"view_report_{report.report_id}", width="stretch"):
            st.session_state.selected_report_id = report.report_id
            navigate("Report")
            st.rerun()
        st.caption(f"Created {report.created_at} · Agent revision {agent.get('revision', '—')}")


def _render_trends(rows: Sequence[Mapping[str, Any]]) -> None:
    quality, cost = st.columns(2)
    with quality:
        st.subheader("Quality trend")
        if len(rows) < 2:
            st.caption("At least two Reports are required to show a quality trend.")
        else:
            st.plotly_chart(
                quality_trend_figure(rows),
                width="stretch",
                config={"displayModeBar": False},
                key="agent_quality_trend",
            )
    with cost:
        st.subheader("Cost trend")
        cost_rows = [row for row in rows if row.get("Cost") is not None]
        if len(cost_rows) < 2:
            st.caption("At least two Reports with evaluation cost are required to show a cost trend.")
        else:
            st.plotly_chart(
                cost_trend_figure(cost_rows),
                width="stretch",
                config={"displayModeBar": False},
                key="agent_cost_trend",
            )


def _selected_agent(agents: Sequence[AgentProfile], default_agent_id: str) -> AgentProfile:
    agent_ids = {agent.agent_id for agent in agents}
    selected_id = st.session_state.get("selected_agent_id")
    if selected_id not in agent_ids:
        select_agent(default_agent_id if default_agent_id in agent_ids else agents[0].agent_id)
        selected_id = st.session_state.selected_agent_id
    return next(agent for agent in agents if agent.agent_id == selected_id)


def render_agent_home(
    registry: AgentRegistry | None,
    repository: WorkbenchRepository,
    *,
    default_agent_id: str,
) -> None:
    """Render one persisted Agent and the immutable evidence attached to it."""
    del registry  # Agent Home selects existing immutable Agents; it does not create them.
    agents = valid_agents(repository)
    st.caption("EVALUATION WORKBENCH")
    if not agents:
        st.title("Agent")
        st.info("No evaluation-ready Agents are available.")
        return

    selected = _selected_agent(agents, default_agent_id)
    agent_ids = [agent.agent_id for agent in agents]
    names = {agent.agent_id: agent.name for agent in agents}
    if st.session_state.get("agent_selector") != selected.agent_id:
        st.session_state.pop("agent_selector", None)
    selected_id = st.selectbox(
        "Agent",
        agent_ids,
        index=agent_ids.index(selected.agent_id),
        format_func=names.__getitem__,
        key="agent_selector",
    )
    if selected_id != selected.agent_id:
        select_agent(selected_id)
        st.rerun()

    selected = repository.get_agent(st.session_state.selected_agent_id)
    revision = repository.get_current_agent_revision(selected.agent_id)
    reports = repository.list_reports(selected.agent_id)
    rows = report_history_rows(reports)

    st.title(selected.name)
    st.caption(selected.description or "No description recorded.")
    st.caption(
        f"Revision {revision.revision if revision else 0} · Immutable evaluation context"
    )
    st.subheader("Target Tools")
    tools = _tool_rows(selected.agent_id, repository)
    if tools:
        st.dataframe(tools, width="stretch", hide_index=True)
    else:
        st.caption("This immutable revision has no Target Tool bindings.")

    _render_latest_report(reports[0] if reports else None)
    _render_trends(rows)
    st.subheader("Report history")
    if rows:
        st.dataframe(rows, width="stretch", hide_index=True)
    else:
        st.caption("No Reports yet.")


def render_agents_page(
    registry: AgentRegistry,
    repository: WorkbenchRepository,
    *,
    demo_trace_path: Path,
    runner: object | None = None,
    report_service: object | None = None,
    llm_generate: object | None = None,
    langfuse_base_url: str | None = None,
) -> None:
    """Compatibility wrapper retained until the global shell moves to Agent Home."""
    del demo_trace_path, runner, report_service, llm_generate, langfuse_base_url
    render_agent_home(registry, repository, default_agent_id=st.session_state.selected_agent_id)
