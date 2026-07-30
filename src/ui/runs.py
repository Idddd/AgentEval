"""Contextual immutable-run wizard and Agent-scoped run history."""
from __future__ import annotations

import asyncio
import inspect
from collections.abc import Sequence
from typing import Any

import streamlit as st

from src.dataset_registry import DatasetRegistry
from src.workbench_models import DatasetRevision, EvalRun, TestCase, ToolBinding
from src.workbench_repository import WorkbenchRepository

from .state import navigate


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
    runs = repository.list_runs(agent_id)
    st.markdown("#### Run history")
    if not runs:
        with st.container(border=True):
            st.markdown("**No evaluation runs yet**")
            st.caption("Complete the four-stage wizard to create the first immutable run.")
        return
    report_data = _quality_and_costs(repository, agent_id)
    for run in runs:
        agent_revision = repository.get_agent_revision(run.agent_revision_id)
        dataset_revision = repository.get_dataset_revision(run.dataset_revision_id)
        quality, cost = report_data.get(run.run_id, ("INCOMPLETE", 0.0))
        with st.container(border=True):
            identity, states, amount = st.columns([3.2, 2, 1.2])
            identity.markdown(f"**{run.started_at}**")
            identity.caption(
                f"Agent Revision {agent_revision.revision} · Dataset Revision {dataset_revision.revision}"
            )
            states.markdown(f"Run: **{run.status.value}**")
            states.caption(f"Quality: {quality}")
            amount.metric("Evaluation cost", f"${cost:.4f}")


def render_runs_module(
    repository: WorkbenchRepository,
    agent_id: str,
    runner: Any | None = None,
    report_service: Any | None = None,
) -> None:
    """Render a four-stage New Evaluation flow and durable run history."""
    agent_revision = repository.get_current_agent_revision(agent_id)
    datasets = _dataset_revisions(repository, agent_id)
    drafts = _draft_options(repository, agent_id)
    st.subheader("New evaluation")
    st.caption("Confirm immutable inputs, review evaluation settings, then start the run.")

    if agent_revision is None:
        st.markdown(
            "<div style='background:#FBF4E4;border:1px solid #EADCB8;border-radius:12px;padding:14px 16px;'>"
            "<strong>Agent Revision required</strong><br>Save an Agent configuration before starting an evaluation."
            "</div>",
            unsafe_allow_html=True,
        )
        _render_run_history(repository, agent_id)
        return

    with st.container(border=True):
        st.markdown("**1 · Confirm Agent Revision**")
        model = agent_revision.config_snapshot.get("model", "Not specified")
        st.markdown(f"Locked Agent Revision **{agent_revision.revision}**")
        st.caption(f"Model: {model} · {len(agent_revision.tools)} Tool bindings")

    selected_dataset: DatasetRevision | None = None
    with st.container(border=True):
        st.markdown("**2 · Select Dataset Revision**")
        dataset_options: dict[str, tuple[str, Any]] = {
            f"{dataset.name} · Revision {dataset.revision} · {len(dataset.cases)} cases": (
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
            dataset_label = st.selectbox(
                "Dataset source", list(dataset_options), key=f"run_dataset_revision_{agent_id}"
            )
            source, value = dataset_options[dataset_label]
            if source == "revision":
                selected_dataset = value
            elif st.button("Publish selected draft", key="run_publish_dataset", type="primary"):
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

    with st.container(border=True):
        st.markdown("**3 · Review evaluators and cost scope**")
        evaluator_version = "v1"
        judge_model = agent_revision.config_snapshot.get("judge_model", "Not configured")
        left, right = st.columns(2)
        left.markdown(f"Evaluator version: **{evaluator_version}**")
        left.caption("Required deterministic assertions and execution failures are authoritative.")
        right.markdown(f"Judge model (optional): **{judge_model}**")
        right.caption("Optional supporting assessment: Correctness · Relevance · Completeness · Safety")
        st.caption("Cost categories: Agent + Judge = Evaluation Total. Dataset Generation is reported separately.")

    cases = selected_dataset.cases if selected_dataset else ()
    unavailable = unavailable_case_tools(cases, agent_revision.tools)
    unavailable_text = ", ".join(unavailable)
    if unavailable:
        st.markdown(
            "<div style='background:#FBF4E4;border:1px solid #EADCB8;border-radius:12px;padding:14px 16px;'>"
            f"<strong>Tool evidence not currently available</strong><br>{unavailable_text}. "
            "This is non-blocking; execution and deterministic assertion failures remain authoritative."
            "</div>",
            unsafe_allow_html=True,
        )

    with st.container(border=True):
        st.markdown("**4 · Start evaluation**")
        if runner is None:
            st.caption("The evaluation runner is not connected to this UI session.")
        start_disabled = selected_dataset is None or runner is None
        if st.button(
            "Start evaluation",
            key="run_start",
            type="primary",
            disabled=start_disabled,
            width="stretch",
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
                    except KeyError:
                        st.error("Report was not persisted for this completed run.")
                        can_rerun = False
                    else:
                        report_matches_run = persisted_report.run_id == run.run_id
                        run_matches_context = (
                            run.agent_id == agent_id
                            and run.agent_revision_id == agent_revision.revision_id
                            and run.dataset_revision_id == selected_dataset.revision_id
                        )
                        if not report_matches_run or not run_matches_context:
                            st.error("Report was not persisted for this completed run.")
                            can_rerun = False
                        else:
                            st.session_state["selected_report_id"] = persisted_report.report_id
                            navigate("Report")
                st.success(f"Run {run.run_id} finished with status {run.status.value}.")
                if progress_lines:
                    st.code("\n".join(progress_lines), language="text")
                if can_rerun:
                    st.rerun()

    _render_run_history(repository, agent_id)
