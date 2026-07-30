"""Small, transient UI state helpers.

Product records always remain in SQLite; session state only remembers navigation
and in-progress editor choices.
"""
from __future__ import annotations

import streamlit as st


def init_ui_state() -> None:
    defaults = {
        "selected_agent_id": None,
        "active_page": "Agents",
        "active_agent_module": "Tools",
        "agent_dialog": None,
        "tool_editor": None,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


def select_agent(agent_id: str) -> None:
    st.session_state.selected_agent_id = agent_id
    st.session_state.active_agent_module = "Tools"
