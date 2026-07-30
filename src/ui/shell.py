"""Global navigation shell for the modular workbench."""
from __future__ import annotations

from pathlib import Path

import streamlit as st

from src.agent_registry import AgentRegistry
from src.workbench_repository import WorkbenchRepository

from .agents import render_agents_page
from .datasets import CandidateGenerator
from .state import init_ui_state


def _show_reset_confirmation() -> None:
    st.session_state.demo_reset_confirm = True


def _request_demo_reset() -> None:
    st.session_state.demo_reset_pending = True


def _cancel_demo_reset() -> None:
    st.session_state.demo_reset_confirm = False


def _render_placeholder(page: str) -> None:
    st.caption("EVALUATION WORKBENCH")
    st.title(page)
    with st.container(border=True):
        st.subheader(f"{page} workspace")
        st.caption("Choose an Agent to continue in its workspace.")


def render_shell(
    registry: AgentRegistry,
    repository: WorkbenchRepository,
    *,
    demo_trace_path: Path,
    runner: object | None = None,
    report_service: object | None = None,
    llm_generate: CandidateGenerator | None = None,
    langfuse_base_url: str | None = None,
) -> None:
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
        st.markdown("<div class='sidebar-spacer'></div>", unsafe_allow_html=True)
        st.caption("DEMO CONTROLS")
        st.button(
            "Reset demo",
            key="reset_demo",
            width="stretch",
            on_click=_show_reset_confirmation,
        )
        if st.session_state.demo_reset_confirm:
            st.caption("Reset the presentation state?")
            confirm, cancel = st.columns(2)
            confirm.button(
                "Reset",
                key="confirm_reset_demo",
                width="stretch",
                on_click=_request_demo_reset,
            )
            cancel.button(
                "Cancel",
                key="cancel_reset_demo",
                width="stretch",
                on_click=_cancel_demo_reset,
            )
        st.caption("Local workbench · Immutable revisions")

    st.markdown("<div class='workspace-bar'><span>WORKSPACE</span><strong>Local evaluation environment</strong></div>", unsafe_allow_html=True)
    if page == "Agents":
        render_agents_page(
            registry,
            repository,
            demo_trace_path=demo_trace_path,
            runner=runner,
            report_service=report_service,
            llm_generate=llm_generate,
            langfuse_base_url=langfuse_base_url,
        )
    else:
        _render_placeholder(page)
