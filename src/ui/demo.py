"""Guided, fixed-content UI for the primary permission demo."""
from __future__ import annotations

from pathlib import Path

import streamlit as st

from src.demo_workspace import (
    DEMO_AGENT_DESCRIPTION,
    DEMO_AGENT_NAME,
    DEMO_CASES,
    DEMO_DATASET_NAME,
    DEMO_TOOLS,
    run_demo_evaluation,
)

from .reports import render_report_summary


_PREVIEW_NOTICE = (
    "Configuration UI preview. Saving custom Agents and Tools is not enabled "
    "in this demo build."
)


def _init_legacy_demo_state() -> None:
    """Keep the nested demo usable until its modules gain global routes."""
    for key, value in {
        "demo_module": "Tools",
        "demo_next_module": None,
        "demo_report_summary": None,
    }.items():
        st.session_state.setdefault(key, value)


def _open_preview() -> None:
    st.session_state.demo_preview_notice = _PREVIEW_NOTICE
    st.rerun()


def _render_demo_tools() -> None:
    heading, action = st.columns([5, 1])
    with heading:
        st.subheader("Target tools")
        st.caption(
            "Each Tool belongs to this Agent and defines a different test environment."
        )
    with action:
        if st.button("Add tool", key="demo_add_tool", type="primary", width="stretch"):
            _open_preview()

    connection_labels = {
        "agent": "AGENT",
        "http": "HTTP API",
        "python": "LOCAL SERVICE",
    }
    for tool in DEMO_TOOLS:
        with st.container(border=True):
            identity, connection, requirement, status, edit = st.columns(
                [2.0, 1.15, 2.5, 1.0, 0.8]
            )
            identity.markdown(f"**{tool.name}**")
            identity.caption(tool.description)
            connection.markdown(connection_labels[tool.connection_type])
            required_role = tool.permission.get("required_role") or "Any role"
            requirement.markdown("  \n".join(tool.test_requirements))
            requirement.caption(f"Required role: {required_role}")
            status.markdown("<span class='status-pill'>AVAILABLE</span>", unsafe_allow_html=True)
            if edit.button("Edit", key=f"demo_edit_tool_{tool.tool_id}", width="stretch"):
                _open_preview()


def _render_demo_dataset() -> None:
    st.subheader(DEMO_DATASET_NAME)
    st.caption(
        "6 test cases · Allowed calls, denied calls, guard ordering, and one bypass regression."
    )
    for case in DEMO_CASES:
        expected = case.expected_output
        blocked = expected["tool_execution"] == "BLOCK"
        with st.container(border=True):
            identity, expectation, state = st.columns([3.2, 2.2, 1.5])
            identity.markdown(f"**{case.case_id}**")
            identity.caption(str(case.input["query"]))
            expectation.markdown(f"Role: **{case.input['user_role']}**")
            expectation.caption(f"Expected Tool: {expected['expected_tool_called']}")
            state.markdown(f"**{expected['permission_decision']}**")
            state.caption(
                "Blocked before Tool execution"
                if blocked
                else "Expected Tool execution"
            )


def _render_demo_evaluation(trace_path: Path) -> None:
    st.subheader("Demo evaluation")
    st.caption("Review the fixed evaluation scope, then run it without external credentials.")
    with st.container(border=True):
        left, right = st.columns(2)
        left.markdown("**Target**")
        left.caption(f"{DEMO_AGENT_NAME} · Revision 1 · 3 Tools")
        left.markdown("**Dataset**")
        left.caption(f"{DEMO_DATASET_NAME} · Revision 1 · 6 cases")
        right.markdown("**Deterministic checks**")
        right.caption("Tool selection · permission decision · guard ordering · execution evidence")
        right.markdown("**LLM-as-a-Judge**")
        right.caption("Correctness · Relevance · Completeness · Safety")
    st.caption("Includes Tool evidence capture plus Agent and Judge token/cost accounting.")
    if st.button("Run demo evaluation", key="demo_run", type="primary"):
        st.session_state.demo_report_summary = run_demo_evaluation(trace_path)
        st.session_state.demo_next_module = "Report"
        st.rerun()


def _render_demo_report(trace_path: Path) -> None:
    summary = st.session_state.demo_report_summary
    if summary is None:
        st.subheader("Demo report")
        st.caption("Run the prepared evaluation to load the complete Report.")
        if st.button(
            "Run demo evaluation",
            key="demo_run_from_report",
            type="primary",
        ):
            st.session_state.demo_report_summary = run_demo_evaluation(trace_path)
            st.rerun()
        return

    st.subheader("Demo evaluation report")
    st.caption("Local demo evidence · No external provider or Langfuse connection required")
    status = summary["status"]
    st.markdown(
        "<div class='demo-result-line'>"
        f"<strong>Result: {status}</strong> "
        "<span class='demo-safe'>5 PASS</span> "
        "<span class='demo-blocked'>1 FAIL</span> "
        "<span>Correctly blocked unsafe actions remain PASS.</span>"
        "</div>",
        unsafe_allow_html=True,
    )
    tokens = summary["tokens"]
    token_columns = st.columns(4)
    token_columns[0].metric("Agent input", f"{tokens['agent_input_tokens']:,}")
    token_columns[1].metric("Agent output", f"{tokens['agent_output_tokens']:,}")
    token_columns[2].metric("Judge input", f"{tokens['judge_input_tokens']:,}")
    token_columns[3].metric("Judge output", f"{tokens['judge_output_tokens']:,}")
    st.markdown("#### Tool execution evidence")
    render_report_summary(summary)


def render_demo_workspace(trace_path: Path) -> None:
    """Render the fixed Demo Agent and its guided modules."""
    _init_legacy_demo_state()
    if st.session_state.demo_next_module:
        st.session_state.demo_module = st.session_state.demo_next_module
        st.session_state.demo_next_module = None
    identity, controls = st.columns([3.5, 2.1])
    with identity:
        st.markdown("<span class='demo-badge'>Demo</span>", unsafe_allow_html=True)
        st.header(DEMO_AGENT_NAME)
        st.caption(DEMO_AGENT_DESCRIPTION)
        st.caption("Revision 1  ·  AVAILABLE  ·  3 Tools")
    with controls:
        new_agent, edit_agent = st.columns(2)
        if new_agent.button("New agent", key="demo_new_agent", width="stretch"):
            _open_preview()
        if edit_agent.button("Edit agent", key="demo_edit_agent", width="stretch"):
            _open_preview()

    module = st.radio(
        "Demo module",
        ["Tools", "Dataset", "Evaluation", "Report"],
        horizontal=True,
        key="demo_module",
        label_visibility="collapsed",
    )
    if st.session_state.demo_preview_notice:
        st.info(st.session_state.demo_preview_notice)

    if module == "Tools":
        _render_demo_tools()
    elif module == "Dataset":
        _render_demo_dataset()
    elif module == "Evaluation":
        _render_demo_evaluation(trace_path)
    else:
        _render_demo_report(trace_path)
