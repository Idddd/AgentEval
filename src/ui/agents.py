"""Agent list and selected-Agent workspace."""
from __future__ import annotations

import streamlit as st

from src.agent_registry import AgentRegistry
from src.workbench_models import AgentProfile
from src.workbench_repository import WorkbenchRepository

from .state import select_agent
from .tools import current_agent_revision, render_tools_module


def _agent_counts(repository: WorkbenchRepository, agent_id: str) -> tuple[int, int]:
    """Read Agent-owned summary counts from the durable SQLite workbench."""
    with repository._connect() as connection:  # type: ignore[attr-defined]
        datasets = connection.execute(
            "SELECT COUNT(*) FROM datasets WHERE agent_id = ?", (agent_id,)
        ).fetchone()[0]
        runs = connection.execute(
            "SELECT COUNT(*) FROM eval_runs WHERE agent_id = ?", (agent_id,)
        ).fetchone()[0]
    return datasets, runs


def _new_agent_form(registry: AgentRegistry) -> None:
    if st.session_state.agent_dialog != "new":
        return
    with st.container(border=True):
        st.subheader("New agent")
        with st.form("new_agent_form"):
            name = st.text_input("Agent name")
            description = st.text_area("Description")
            save, cancel = st.columns(2)
            submitted = save.form_submit_button("Create agent", type="primary", width="stretch")
            cancelled = cancel.form_submit_button("Cancel", width="stretch")
        if cancelled:
            st.session_state.agent_dialog = None
            st.rerun()
        if submitted:
            try:
                agent = registry.create(name, description)
            except ValueError as error:
                st.error(str(error))
            else:
                select_agent(agent.agent_id)
                st.session_state.agent_dialog = None
                st.rerun()


def render_agents_page(registry: AgentRegistry, repository: WorkbenchRepository) -> None:
    """Render the Agent inventory and the selected Agent's modular workspace."""
    header, action = st.columns([5, 1.2])
    with header:
        st.caption("EVALUATION WORKBENCH")
        st.title("Agents")
        st.caption("Create an Agent, define its Tools, then evaluate immutable revisions.")
    with action:
        st.write("")
        if st.button("New agent", key="new_agent", type="primary", width="stretch"):
            st.session_state.agent_dialog = "new"
            st.rerun()
    _new_agent_form(registry)
    if st.session_state.agent_dialog == "new":
        return

    agents = repository.list_agents()
    if not agents:
        with st.container(border=True):
            st.subheader("No agents yet")
            st.caption("Start with an Agent to organize its Tools, Datasets, Runs, and Reports.")
            if st.button("New agent", key="empty_new_agent", type="primary"):
                st.session_state.agent_dialog = "new"
                st.rerun()
        return

    if st.session_state.selected_agent_id not in {agent.agent_id for agent in agents}:
        select_agent(agents[0].agent_id)

    st.markdown("#### Agent workspace")
    for agent in agents:
        datasets, runs = _agent_counts(repository, agent.agent_id)
        revision = current_agent_revision(repository, agent)
        selected = agent.agent_id == st.session_state.selected_agent_id
        with st.container(border=True):
            info, metrics, choose = st.columns([2.3, 2.5, 1.1])
            with info:
                st.markdown(f"**{agent.name}**")
                st.caption(agent.description or "No description")
            with metrics:
                st.caption(
                    f"{len(revision.tools) if revision else 0} Tools  ·  {datasets} Datasets  ·  {runs} Runs"
                )
            with choose:
                label = "Selected" if selected else "Open"
                if choose.button(label, key=f"select_agent_{agent.agent_id}", disabled=selected, width="stretch"):
                    select_agent(agent.agent_id)
                    st.rerun()

    selected_agent = next(agent for agent in agents if agent.agent_id == st.session_state.selected_agent_id)
    st.divider()
    render_agent_workspace(registry, repository, selected_agent)


def render_agent_workspace(
    registry: AgentRegistry, repository: WorkbenchRepository, agent: AgentProfile
) -> None:
    revision = current_agent_revision(repository, agent)
    tool_count = len(revision.tools) if revision else 0
    workspace, controls = st.columns([3.4, 2.0])
    with workspace:
        st.header(agent.name)
        st.caption(f"Revision {agent.current_revision}  ·  AVAILABLE  ·  {tool_count} Tools")
    with controls:
        first, second, third = st.columns(3)
        first.button("Revisions", key="agent_revisions", help="Revision history is coming next")
        second.button("Edit agent", key="edit_agent", help="Agent metadata editor is coming next")
        third.button("New evaluation", key="new_evaluation", type="primary", help="Evaluation wizard is coming next")

    module = st.radio(
        "Agent module",
        ["Tools", "Datasets", "Runs", "Reports"],
        horizontal=True,
        key="active_agent_module",
        label_visibility="collapsed",
    )
    if module == "Tools":
        render_tools_module(registry, repository, agent)
    else:
        with st.container(border=True):
            st.subheader(module)
            st.caption(f"{module} for {agent.name} will appear here in the next workspace module.")
