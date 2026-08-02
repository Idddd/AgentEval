"""Contextual immutable-run wizard and Agent-scoped run history."""
from __future__ import annotations

import asyncio
import inspect
from collections.abc import Sequence
from typing import Any

import streamlit as st

from src.dataset_registry import DatasetRegistry
from src.workbench_models import DatasetRevision, EvalRun, RunStatus, TestCase, ToolBinding
from src.workbench_repository import WorkbenchRepository

from .state import request_navigation


_KNOWN_ADAPTERS = {"python", "http", "mock", "langfuse"}


def unavailable_case_tools(
    cases: Sequence[TestCase], tools: Sequence[ToolBinding]
) -> tuple[str, ...]:
    """Return stable IDs/names of required Tools that cannot be executed."""
    available: set[str] = set()
    unavailable: set[str] = set()
    known: set[str] = set()
    for tool in tools:
        aliases = {tool.tool_id.casefold(), tool.name.casefold()}
        known.update(aliases)
        if tool.enabled and tool.connection_type in _KNOWN_ADAPTERS:
            available.update(aliases)
        else:
            unavailable.add(tool.tool_id)
    for case in cases:
        required = case.expected_output.get("expected_tool_called")
        if required in (None, ""):
            continue
        name = str(required)
        folded = name.casefold()
        if folded not in available:
            if folded in known:
                matching = next(
                    (tool.tool_id for tool in tools if folded in {tool.tool_id.casefold(), tool.name.casefold()}),
                    name,
                )
                unavailable.add(matching)
            else:
                unavailable.add(name)
    return tuple(sorted(unavailable))


def _rows(repository: WorkbenchRepository, query: str, values: tuple[Any, ...]) -> list[dict[str, Any]]:
    connect = getattr(repository, "_connect", None)
    if connect is None:
        return []
    with connect() as connection:
        rows = connection.execute(query, values).fetchall()
    return [dict(row) for row in rows]


def _dataset_revisions(repository: WorkbenchRepository, agent_id: str) -> list[DatasetRevision]:
    rows = _rows(
        repository,
        "SELECT revision_id FROM dataset_revisions WHERE agent_id = ? ORDER BY created_at DESC, revision DESC",
        (agent_id,),
    )
    return [repository.get_dataset_revision(row["revision_id"]) for row in rows]


def _draft_options(repository: WorkbenchRepository, agent_id: str) -> list[dict[str, Any]]:
    return _rows(
        repository,
        "SELECT datasets.dataset_id, datasets.name, COUNT(dataset_draft_cases.case_id) AS case_count "
        "FROM datasets LEFT JOIN dataset_draft_cases USING (dataset_id) "
        "WHERE datasets.agent_id = ? GROUP BY datasets.dataset_id, datasets.name "
        "HAVING COUNT(dataset_draft_cases.case_id) > 0 ORDER BY datasets.created_at",
        (agent_id,),
    )


def _run_result(value: Any) -> EvalRun:
    if inspect.isawaitable(value):
        return asyncio.run(value)
    return value


def _quality_and_costs(repository: WorkbenchRepository, agent_id: str) -> dict[str, tuple[str, float]]:
    result: dict[str, tuple[str, float]] = {}
    for report in repository.list_reports(agent_id):
        if report.run_id in result:
            continue
        costs = report.summary.get("costs", {})
        result[report.run_id] = (
            str(report.summary.get("status", report.status)),
            float(costs.get("evaluation_total", 0.0)),
        )
    return result


def _render_run_history(repository: WorkbenchRepository, agent_id: str) -> None:
    rows = _run_history_rows(repository, agent_id)
    st.markdown("### Run history")
    if not rows:
        st.caption("No evaluation runs yet.")
        return
    st.dataframe(
        rows,
        column_config={
            "Started": st.column_config.TextColumn("Started", width="medium"),
            "Target revision": st.column_config.TextColumn("Target revision", width="small"),
            "Dataset revision": st.column_config.TextColumn("Dataset revision", width="small"),
            "Status": st.column_config.TextColumn("Status", width="small"),
            "Quality": st.column_config.TextColumn("Quality", width="small"),
            "Cost": st.column_config.NumberColumn("Cost", format="$%.4f", width="small"),
        },
        hide_index=True,
        width="stretch",
    )


def _run_history_rows(
    repository: WorkbenchRepository, agent_id: str
) -> list[dict[str, Any]]:
    runs = repository.list_runs(agent_id)
    report_data = _quality_and_costs(repository, agent_id)
    rows: list[dict[str, Any]] = []
    for run in runs:
        agent_revision = repository.get_agent_revision(run.agent_revision_id)
        dataset_revision = repository.get_dataset_revision(run.dataset_revision_id)
        quality, cost = report_data.get(run.run_id, ("INCOMPLETE", 0.0))
        rows.append(
            {
                "Started": str(run.started_at),
                "Target revision": f"R{agent_revision.revision}",
                "Dataset revision": f"R{dataset_revision.revision}",
                "Status": run.status.value,
                "Quality": quality,
                "Cost": cost,
            }
        )
    return rows


def render_runs_module(
    repository: WorkbenchRepository,
    agent_id: str,
    runner: Any | None = None,
    report_service: Any | None = None,
) -> None:
    """Render compact evaluation configuration and durable run history."""
    agent_revision = repository.get_current_agent_revision(agent_id)
    datasets = _dataset_revisions(repository, agent_id)
    drafts = _draft_options(repository, agent_id)
    st.markdown("### Evaluation")
    st.caption("Select immutable inputs, review the evaluation context, and start a run.")

    if agent_revision is None:
        st.warning(
            "Save a Target configuration before starting an evaluation.",
            icon=":material/info:",
        )
        _render_run_history(repository, agent_id)
        return

    selected_dataset: DatasetRevision | None = None
    with st.container(border=False, width=660, gap="small"):
        st.markdown("**Configuration**")
        model = agent_revision.config_snapshot.get("model", "Not specified")
        st.caption(
            f"Target R{agent_revision.revision} · {model} · "
            f"{len(agent_revision.tools)} tool bindings"
        )

        dataset_options: dict[str, tuple[str, Any]] = {
            f"{dataset.name} · R{dataset.revision} · {len(dataset.cases)} cases": (
                "revision",
                dataset,
            )
            for dataset in datasets
        }
        dataset_options.update(
            {
                f"Publish current draft · {draft['name']} · {draft['case_count']} cases": (
                    "draft",
                    draft,
                )
                for draft in drafts
            }
        )
        if dataset_options:
            selector_key = f"run_dataset_revision_{agent_id}"
            requested_revision_id = st.session_state.pop(
                "requested_dataset_revision_id", None
            )
            if requested_revision_id:
                requested_label = next(
                    (
                        label
                        for label, (source, value) in dataset_options.items()
                        if source == "revision"
                        and value.revision_id == requested_revision_id
                    ),
                    None,
                )
                if requested_label is not None:
                    st.session_state[selector_key] = requested_label
            dataset_label = st.selectbox(
                "Dataset source", list(dataset_options), key=selector_key
            )
            source, value = dataset_options[dataset_label]
            if source == "revision":
                selected_dataset = value
            elif st.button(
                "Publish selected draft",
                key="run_publish_dataset",
                type="secondary",
            ):
                try:
                    selected_dataset = DatasetRegistry(repository).publish(value["dataset_id"])
                except ValueError as error:
                    st.error(str(error))
                else:
                    st.session_state[f"run_published_dataset_{agent_id}"] = {
                        "dataset_id": value["dataset_id"],
                        "revision_id": selected_dataset.revision_id,
                    }
                    st.rerun()
            persisted = st.session_state.get(f"run_published_dataset_{agent_id}")
            persisted_revision_id = (
                persisted.get("revision_id")
                if source == "draft"
                and isinstance(persisted, dict)
                and persisted.get("dataset_id") == value["dataset_id"]
                else None
            )
            if selected_dataset is None and persisted_revision_id:
                try:
                    selected_dataset = repository.get_dataset_revision(persisted_revision_id)
                except KeyError:
                    st.session_state.pop(f"run_published_dataset_{agent_id}", None)
        else:
            st.warning("Add cases to a Dataset draft before starting an evaluation.")

        evaluator_version = "v1"
        judge_model = agent_revision.config_snapshot.get("judge_model", "Not configured")
        st.caption(f"Evaluator {evaluator_version} · Judge {judge_model}")
        st.caption(
            "Deterministic assertions remain authoritative · Cost includes agent and judge usage"
        )

        cases = selected_dataset.cases if selected_dataset else ()
        unavailable = unavailable_case_tools(cases, agent_revision.tools)
        if unavailable:
            st.warning(
                f"Tool evidence unavailable: {', '.join(unavailable)}. "
                "This does not block the run.",
                icon=":material/info:",
            )

        if runner is None:
            st.caption("The evaluation runner is not connected to this UI session.")
        start_disabled = selected_dataset is None or runner is None
        if st.button(
            "Start evaluation",
            key="run_start",
            type="primary",
            disabled=start_disabled,
            width="content",
        ):
            progress_bar = st.progress(0.0, text="Preparing run")
            progress_lines: list[str] = []

            def on_progress(done: int, total: int, label: str) -> None:
                progress_bar.progress(done / max(total, 1), text=f"{done}/{total} cases persisted")
                progress_lines.append(label)

            try:
                with st.spinner("Running immutable evaluation…"):
                    run = _run_result(
                        runner.run_revision(
                            agent_revision.revision_id,
                            selected_dataset.revision_id,
                            progress=on_progress,
                        )
                    )
                    report = report_service.create(run.run_id) if report_service is not None else None
            except Exception as error:  # service boundary: preserve error state in the wizard
                st.error(f"Evaluation failed: {error}")
            else:
                st.session_state["selected_run_id"] = run.run_id
                can_rerun = True
                if report is not None:
                    try:
                        persisted_report = repository.get_report(report.report_id)
                        persisted_run = repository.get_run(persisted_report.run_id)
                    except KeyError:
                        st.error("Report was not persisted for this completed run.")
                        can_rerun = False
                    else:
                        persisted_run_matches_context = (
                            persisted_run.status is RunStatus.COMPLETED
                            and persisted_run.run_id == run.run_id
                            and persisted_run.agent_id == agent_id
                            and persisted_run.agent_revision_id == agent_revision.revision_id
                            and persisted_run.dataset_revision_id == selected_dataset.revision_id
                        )
                        if not persisted_run_matches_context:
                            st.error("Report was not persisted for this completed run.")
                            can_rerun = False
                        else:
                            st.session_state["selected_report_id"] = persisted_report.report_id
                            request_navigation("Report")
                st.success(f"Run {run.run_id} finished with status {run.status.value}.")
                if progress_lines:
                    st.code("\n".join(progress_lines), language="text")
                if can_rerun:
                    st.rerun()

    _render_run_history(repository, agent_id)
