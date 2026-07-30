"""Global navigation shell for the modular workbench."""
from __future__ import annotations

import streamlit as st

from src.agent_registry import AgentRegistry
from src.workbench_repository import WorkbenchRepository

from .agents import render_agents_page
from .state import init_ui_state


def _render_placeholder(page: str) -> None:
    st.caption("EVALUATION WORKBENCH")
    st.title(page)
    with st.container(border=True):
        st.subheader(f"{page} workspace")
        st.caption("Choose an Agent to continue in its workspace.")


def render_shell(registry: AgentRegistry, repository: WorkbenchRepository) -> None:
    """Render the fixed global shell and dispatch to the active page."""
    init_ui_state()
    with st.sidebar:
        st.markdown("<div class='brand-mark'>EVAL STUDIO</div>", unsafe_allow_html=True)
        st.caption("MODULAR EVALUATION")
        page = st.radio(
            "Global navigation",
            ["Agents", "Datasets", "Reports", "Settings"],
            key="active_page",
            label_visibility="collapsed",
        )
        st.markdown("<div class='sidebar-foot'>Local workbench<br>Immutable revisions</div>", unsafe_allow_html=True)

    st.markdown("<div class='workspace-bar'><span>WORKSPACE</span><strong>Local evaluation environment</strong></div>", unsafe_allow_html=True)
    if page == "Agents":
        render_agents_page(registry, repository)
    else:
        _render_placeholder(page)
