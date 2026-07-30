"""Read-only environment status shown by the global Settings route."""
from __future__ import annotations

from dataclasses import dataclass

import streamlit as st


@dataclass(frozen=True)
class SettingsStatus:
    """Safe-to-display service state for the local workbench environment."""

    llm: str
    langfuse: str
    database: str
    demo_fixture: str


_SAFE_STATUS_VALUES = {"Connected", "Not configured", "Available"}


def _safe_status(value: str) -> str:
    """Keep Settings informational without ever exposing configuration values."""
    return value if value in _SAFE_STATUS_VALUES else "Error (details hidden)"


def render_settings_page(status: SettingsStatus) -> None:
    """Render only safe, read-only environment availability information."""
    st.title("Environment status")
    st.caption("Connection availability only. Configuration values are never displayed.")
    for label, value in (
        ("LLM", status.llm),
        ("Langfuse", status.langfuse),
        ("Database", status.database),
        ("Demo fixture", status.demo_fixture),
    ):
        row_label, row_value = st.columns([2, 3])
        row_label.markdown(f"**{label}**")
        row_value.caption(_safe_status(value))
