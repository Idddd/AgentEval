"""Global Report reflection inbox and handoff to Report Analysis."""
from __future__ import annotations

from typing import Any

import streamlit as st

from src.report_reflection import RuleBasedReportReflector
from src.workbench_models import ReportSnapshot
from src.workbench_repository import WorkbenchRepository


def _reflection_records(
    repository: WorkbenchRepository,
) -> list[tuple[ReportSnapshot, str, str, int, str]]:
    reflector = RuleBasedReportReflector()
    records: list[tuple[ReportSnapshot, str, str, int, str]] = []
    for target in repository.list_agents():
        for report in repository.list_reports(target.agent_id):
            identity = report.summary.get("identity", {})
            target_identity = identity.get("agent", {}) if isinstance(identity, dict) else {}
            revision_number = int(target_identity.get("revision", 0) or 0)
            try:
                run = repository.get_run(report.run_id)
                revision = repository.get_agent_revision(run.agent_revision_id)
                revision_number = revision.revision
                suggestions = reflector.reflect(report, revision)
            except KeyError:
                suggestions = ()
            summary = (
                f"{len(suggestions)} · "
                + ", ".join(suggestion.area for suggestion in suggestions)
                if suggestions
                else "No suggestions"
            )
            records.append((report, target.agent_id, target.name, revision_number, summary))
    return sorted(records, key=lambda record: record[0].created_at, reverse=True)


def _open_reflection(
    repository: WorkbenchRepository, report_ids: tuple[str, ...]
) -> None:
    click = st.session_state.get("reflect_list_actions")
    if not click:
        return
    row = int(click["row"])
    if not 0 <= row < len(report_ids):
        st.session_state.reflect_navigation_error = "The selected Report is no longer available."
        return
    try:
        report = repository.get_report(report_ids[row])
        run = repository.get_run(report.run_id)
        revision = repository.get_agent_revision(run.agent_revision_id)
    except KeyError:
        st.session_state.reflect_navigation_error = "The selected Report is no longer available."
        return
    st.session_state.selected_agent_id = revision.agent_id
    st.session_state.selected_report_id = report.report_id
    st.session_state.report_view = "analysis"
    st.session_state.report_navigation_intent = True
    st.session_state.pending_page = "Report"


def render_reflect_module(repository: WorkbenchRepository) -> None:
    """Render all persisted Reports as a compact reflection inbox."""
    st.markdown("### Reflect")
    st.caption("Review Target suggestions generated from immutable Evaluation reports.")
    error = st.session_state.pop("reflect_navigation_error", None)
    if error:
        st.error(error)
    records = _reflection_records(repository)
    if not records:
        st.caption("No Reports yet. Run an Evaluation to generate reflection suggestions.")
        return
    rows: list[dict[str, Any]] = [
        {
            "Report": report.report_id,
            "Target": target_name,
            "Target revision": f"R{revision}",
            "Status": report.status,
            "Suggestions": summary,
            "Created": report.created_at,
            "Action": "Reflect",
        }
        for report, _target_id, target_name, revision, summary in records
    ]
    st.dataframe(
        rows,
        column_config={
            "Action": st.column_config.ButtonColumn(
                "",
                type="tertiary",
                width="small",
                key="reflect_list_actions",
                on_click=_open_reflection,
                args=(repository, tuple(record[0].report_id for record in records)),
            )
        },
        hide_index=True,
        width="stretch",
    )
