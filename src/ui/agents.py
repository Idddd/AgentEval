"""Selected-Agent home overview for the modular workbench."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import streamlit as st

from src.agent_registry import AgentRegistry
from src.target_catalog import TargetCatalog, TargetCatalogSnapshot
from src.workbench_models import AgentProfile, ReportSnapshot
from src.workbench_repository import WorkbenchRepository

from .charts import cost_trend_figure, quality_trend_figure
from .state import request_navigation, select_agent


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
                "Target revision": agent.get("revision"),
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
        st.caption("No immutable Reports have been created for this Target yet.")
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
            request_navigation("Report")
            st.rerun()
        st.caption(f"Created {report.created_at} · Target revision {agent.get('revision', '—')}")


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


def _select_agent_from_home() -> None:
    """Apply Agent-route cleanup after the selector updates its durable context."""
    select_agent(st.session_state.selected_agent_id)


_TARGET_FILTERS = (
    "All targets",
    "Model only",
    "With Prompt",
    "With Tools",
    "With MCP",
    "With KB",
)


def _target_scope(revision: Any) -> set[str]:
    config = revision.config_snapshot
    scopes = {"Model"}
    if str(config.get("prompt", config.get("system_prompt", ""))).strip():
        scopes.add("Prompt")
    if revision.tools:
        scopes.add("Tools")
    if config.get("mcp_servers"):
        scopes.add("MCP")
    if config.get("knowledge_bases"):
        scopes.add("KB")
    return scopes


def _configuration_summary(revision: Any) -> str:
    scopes = _target_scope(revision)
    if scopes == {"Model"}:
        return "Model only"
    parts = ["Model"]
    if "Prompt" in scopes:
        parts.append("Prompt")
    if revision.tools:
        parts.append(f"{len(revision.tools)} Tools")
    mcp = revision.config_snapshot.get("mcp_servers", ())
    if mcp:
        parts.append(f"{len(mcp)} MCP")
    kb = revision.config_snapshot.get("knowledge_bases", ())
    if kb:
        parts.append(f"{len(kb)} KB")
    return " · ".join(parts)


def _target_rows(
    repository: WorkbenchRepository, scope_filter: str = "All targets"
) -> tuple[list[dict[str, Any]], list[str]]:
    rows: list[dict[str, Any]] = []
    target_ids: list[str] = []
    for agent in valid_agents(repository):
        revision = repository.get_current_agent_revision(agent.agent_id)
        if revision is None:
            continue
        scopes = _target_scope(revision)
        matches = (
            scope_filter == "All targets"
            or (scope_filter == "Model only" and scopes == {"Model"})
            or (scope_filter == "With Prompt" and "Prompt" in scopes)
            or (scope_filter == "With Tools" and "Tools" in scopes)
            or (scope_filter == "With MCP" and "MCP" in scopes)
            or (scope_filter == "With KB" and "KB" in scopes)
        )
        if not matches:
            continue
        target_ids.append(agent.agent_id)
        rows.append(
            {
                "Target": agent.name,
                "Revision": f"R{revision.revision}",
                "Configuration": _configuration_summary(revision),
                "Updated": revision.created_at,
                "View": "View",
            }
        )
    return rows, target_ids


def _open_target(target_ids: Sequence[str]) -> None:
    click = st.session_state.get("target_list_actions")
    if not click:
        return
    row = int(click["row"])
    if 0 <= row < len(target_ids):
        select_agent(target_ids[row])
        st.session_state.target_view = "detail"


def _show_target_list() -> None:
    st.session_state.target_view = "list"


def _show_target_create() -> None:
    st.session_state.target_view = "create"


@st.dialog("Create target", width="large")
def _target_create_dialog(
    registry: AgentRegistry, repository: WorkbenchRepository
) -> None:
    _render_target_create(registry, repository, TargetCatalog())


@st.dialog("Target detail", width="large")
def _target_detail_dialog(repository: WorkbenchRepository, agent_id: str) -> None:
    _render_target_detail(repository, agent_id)


def _render_target_list(repository: WorkbenchRepository) -> None:
    with st.container(horizontal=True, horizontal_alignment="distribute"):
        st.title("Target")
        st.button(
            "Create",
            key="target_create_button",
            type="primary",
            width="content",
            on_click=_show_target_create,
        )
    scope_filter = st.selectbox(
        "Target filter", _TARGET_FILTERS, key="target_filter"
    )
    rows, target_ids = _target_rows(repository, scope_filter)
    if not rows:
        st.caption("No Targets match this filter.")
        return
    st.dataframe(
        rows,
        column_config={
            "View": st.column_config.ButtonColumn(
                "Action",
                type="primary",
                width="small",
                alignment="center",
                key="target_list_actions",
                on_click=_open_target,
                args=(tuple(target_ids),),
            )
        },
        hide_index=True,
        width="stretch",
    )


def _catalog_labels(items: Sequence[Any]) -> dict[str, str]:
    return {item.item_id: item.name for item in items}


def _target_config_snapshot(
    catalog: TargetCatalogSnapshot,
    model_id: str,
    prompt: str,
    mcp_ids: list[str],
    kb_ids: list[str],
) -> dict[str, Any]:
    return {
        "model": catalog.resolve_one("models", model_id).snapshot(),
        "prompt": prompt.strip(),
        "mcp_servers": [item.snapshot() for item in catalog.resolve_many("mcp_servers", mcp_ids)],
        "knowledge_bases": [
            item.snapshot()
            for item in catalog.resolve_many("knowledge_bases", kb_ids)
        ],
    }


def _render_revision_preview(
    name: str,
    model_id: str | None,
    prompt: str,
    tool_ids: Sequence[str],
    mcp_ids: Sequence[str],
    kb_ids: Sequence[str],
) -> None:
    scope = ["Model"]
    if prompt.strip():
        scope.append("Prompt")
    if tool_ids:
        scope.append("Tool use")
    if mcp_ids:
        scope.append("MCP access")
    if kb_ids:
        scope.append("Knowledge grounding")
    with st.container(border=True, key="target_revision_preview"):
        st.caption("Revision preview")
        identity, configuration, resources = st.columns([1.5, 1.2, 1.4])
        identity.markdown(f"**{name.strip() or 'Untitled target'}**")
        identity.caption("Ready to create" if name.strip() and model_id else "Name and model required")
        configuration.caption("EVALUATION SCOPE")
        configuration.markdown(" · ".join(scope))
        resources.caption("RESOURCES")
        resources.markdown(
            f"{len(tool_ids)} Tools · {len(mcp_ids)} MCP · {len(kb_ids)} KB"
        )


def _render_target_create(
    registry: AgentRegistry,
    repository: WorkbenchRepository,
    catalog_service: TargetCatalog,
) -> None:
    with st.container(horizontal=True, vertical_alignment="center"):
        st.button("Targets", icon=":material/arrow_back:", on_click=_show_target_list)
        st.markdown("### Create target")
    try:
        catalog = catalog_service.for_user("local-user")
    except Exception as error:
        st.error(f"Target catalog is unavailable: {error}")
        return

    with st.container(width=920, key="target_create_compact"):
        st.caption("Define the immutable subject used by evaluations.")
        identity, execution = st.columns(2, gap="medium")
        with identity:
            st.markdown("**Target information**")
            name = st.text_input("Name *", key="target_create_name")
            description = st.text_input("Description", key="target_create_description")
        with execution:
            st.markdown("**Model & Prompt**")
            model_labels = _catalog_labels(catalog.models)
            model_id = st.selectbox(
                "Model *",
                [None, *model_labels],
                format_func=lambda value: "Select a Model" if value is None else model_labels[value],
                key="target_create_model",
            )
            prompt = st.text_area(
                "System prompt (optional)", key="target_create_prompt", height=76
            )

        tool_labels = _catalog_labels(catalog.tools)
        mcp_labels = _catalog_labels(catalog.mcp_servers)
        kb_labels = _catalog_labels(catalog.knowledge_bases)
        st.markdown("**Resources**")
        with st.popover(
            "Configure",
            icon=":material/extension:",
            width="stretch",
        ):
            st.caption("Optional capabilities available to this target revision.")
            tool_ids = st.multiselect(
                "Tools", list(tool_labels), format_func=tool_labels.__getitem__, key="target_create_tools"
            )
            mcp_ids = st.multiselect(
                "MCP servers", list(mcp_labels), format_func=mcp_labels.__getitem__, key="target_create_mcp"
            )
            kb_ids = st.multiselect(
                "Knowledge bases", list(kb_labels), format_func=kb_labels.__getitem__, key="target_create_kb"
            )
            st.caption(
                "Authentication is not stored in Target. Supply Tool, MCP, and KB "
                "authorization through the Dataset `header` field."
            )

        _render_revision_preview(name, model_id, prompt, tool_ids, mcp_ids, kb_ids)
        actions = st.container(horizontal=True, horizontal_alignment="right")
        actions.button("Cancel", width="content", on_click=_show_target_list)
        create = actions.button("Create target revision", type="primary", width="content")

    if create:
        if model_id is None:
            st.error("Model is required")
            return
        try:
            selected_tools = catalog.resolve_many("tools", tool_ids)
            tools = tuple(
                item.tool_binding for item in selected_tools if item.tool_binding is not None
            )
            config = _target_config_snapshot(catalog, model_id, prompt, mcp_ids, kb_ids)
            agent, _revision = registry.create_revision(name, description, config, tools)
        except ValueError as error:
            st.error(str(error))
        else:
            select_agent(agent.agent_id)
            st.session_state.target_view = "detail"
            st.rerun()


def _component_rows(revision: Any) -> list[dict[str, str]]:
    config = revision.config_snapshot
    model = config.get("model", "Not configured")
    model_name = model.get("name", model.get("id", "Not configured")) if isinstance(model, Mapping) else str(model)
    prompt = str(config.get("prompt", config.get("system_prompt", ""))).strip()
    def resource_name(item: Any) -> str:
        if isinstance(item, Mapping):
            return str(item.get("name", item.get("id", "")))
        return str(item)

    return [
        {"Component": "Model", "Selection": model_name, "Purpose": "Execution model"},
        {"Component": "Prompt", "Selection": "Configured" if prompt else "None", "Purpose": "System instructions"},
        {"Component": "Tools", "Selection": ", ".join(tool.name for tool in revision.tools) or "None", "Purpose": "Callable capabilities"},
        {"Component": "MCP", "Selection": ", ".join(resource_name(item) for item in config.get("mcp_servers", ())) or "None", "Purpose": "External capability servers"},
        {"Component": "KB", "Selection": ", ".join(resource_name(item) for item in config.get("knowledge_bases", ())) or "None", "Purpose": "Grounding sources"},
    ]


def _evaluate_target(agent_id: str) -> None:
    select_agent(agent_id)
    request_navigation("Evaluation")


def _render_target_detail(repository: WorkbenchRepository, agent_id: str) -> None:
    agent = repository.get_agent(agent_id)
    revision = repository.get_current_agent_revision(agent_id)
    if revision is None:
        _show_target_list()
        st.rerun()
    st.button("Targets", icon=":material/arrow_back:", on_click=_show_target_list)
    with st.container(horizontal=True, horizontal_alignment="distribute"):
        st.markdown(f"### {agent.name}")
        st.button(
            "Evaluate",
            type="primary",
            width="content",
            on_click=_evaluate_target,
            args=(agent_id,),
        )
    st.caption(agent.description or "No description recorded.")
    st.caption(f"Revision {revision.revision} · {_configuration_summary(revision)}")
    st.dataframe(_component_rows(revision), hide_index=True, width="stretch")

    reports = repository.list_reports(agent_id)
    rows = report_history_rows(reports)
    _render_latest_report(reports[0] if reports else None)
    _render_trends(rows)
    st.subheader("Report history")
    if rows:
        st.dataframe(rows, width="stretch", hide_index=True)
    else:
        st.caption("No Reports yet.")


def render_agent_home(
    registry: AgentRegistry | None,
    repository: WorkbenchRepository,
    *,
    default_agent_id: str,
) -> None:
    """Render explicit Target list, create, or detail views."""
    del default_agent_id
    registry = registry or AgentRegistry(repository)
    st.session_state.setdefault("target_view", "list")
    if st.session_state.target_view not in {"list", "create", "detail"}:
        st.session_state.target_view = "list"
    if st.session_state.target_view == "create":
        _render_target_list(repository)
        _target_create_dialog(registry, repository)
        return
    if st.session_state.target_view == "detail":
        selected_id = st.session_state.get("selected_agent_id")
        if selected_id:
            try:
                _render_target_list(repository)
                _target_detail_dialog(repository, selected_id)
                return
            except KeyError:
                st.session_state.target_view = "list"
    _render_target_list(repository)


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
