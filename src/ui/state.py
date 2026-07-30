"""Small, transient UI state helpers.

Product records always remain in SQLite; session state only remembers navigation
and in-progress editor choices.
"""
from __future__ import annotations

import streamlit as st

from src.demo_workspace import DEMO_AGENT_ID


def init_ui_state() -> None:
    defaults = {
        "selected_agent_id": DEMO_AGENT_ID,
        "active_page": "Agents",
        "active_agent_module": "Tools",
        "agent_dialog": None,
        "tool_editor": None,
        "demo_module": "Tools",
        "demo_next_module": None,
        "demo_report_summary": None,
        "demo_preview_notice": None,
        "demo_reset_confirm": False,
        "demo_reset_pending": False,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)
    if st.session_state.demo_reset_pending:
        reset_demo_state()


def reset_demo_state() -> None:
    """Restore only transient Demo presentation state."""
    st.session_state.selected_agent_id = DEMO_AGENT_ID
    st.session_state.active_page = "Agents"
    st.session_state.active_agent_module = "Tools"
    st.session_state.demo_module = "Tools"
    st.session_state.demo_next_module = None
    st.session_state.demo_report_summary = None
    st.session_state.demo_preview_notice = None
    st.session_state.demo_reset_confirm = False
    st.session_state.demo_reset_pending = False


def select_agent(agent_id: str) -> None:
    st.session_state.selected_agent_id = agent_id
    st.session_state.active_agent_module = "Tools"
