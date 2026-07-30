"""Agent-owned Dataset draft, review, import, coverage, and publishing UI."""
from __future__ import annotations

import json
import uuid
from collections.abc import Callable, Mapping, Sequence
from typing import Any

import streamlit as st

from src.dataset_registry import DatasetRegistry
from src.workbench_models import TestCase, ToolBinding
from src.workbench_repository import WorkbenchRepository


CandidateGenerator = Callable[[str, Sequence[TestCase]], Sequence[Mapping[str, Any]]]


def _dataset_rows(repository: WorkbenchRepository, agent_id: str) -> list[dict[str, Any]]:
    """Return durable dataset headers until the repository grows a list API."""
    connect = getattr(repository, "_connect", None)
    if connect is None:
        return []
    with connect() as connection:
        rows = connection.execute(
            "SELECT dataset_id, name, current_revision FROM datasets "
            "WHERE agent_id = ? ORDER BY created_at, dataset_id",
            (agent_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def _current_tools(repository: WorkbenchRepository, agent_id: str) -> tuple[ToolBinding, ...]:
    revision = repository.get_current_agent_revision(agent_id)
    return revision.tools if revision is not None else ()


def _dataset_key(agent_id: str, dataset_id: str, name: str) -> str:
    """Namespace Dataset widgets by their locked Agent and Dataset draft."""
    return f"{name}_{agent_id}_{dataset_id}"


def _case_from_mapping(item: Mapping[str, Any], *, source: str) -> TestCase:
    raw_input = item.get("input")
    if raw_input is None:
        query = str(item.get("query", "")).strip()
        if not query:
            raise ValueError("Each case requires input.query or query")
        raw_input = {"query": query}
        if item.get("user_role"):
            raw_input["user_role"] = str(item["user_role"])
    if not isinstance(raw_input, Mapping):
        raise ValueError("Case input must be a JSON object")
    query = str(raw_input.get("query", "")).strip()
    if not query:
        raise ValueError("Each case requires a non-empty query")

    raw_expected = item.get("expected_output", {})
    if not isinstance(raw_expected, Mapping):
        raise ValueError("Case expected_output must be a JSON object")
    expected = dict(raw_expected)
    if not expected and item.get("tool_name"):
        expected["expected_tool_called"] = str(item["tool_name"])
    raw_metadata = item.get("metadata", {})
    if not isinstance(raw_metadata, Mapping):
        raise ValueError("Case metadata must be a JSON object")
    metadata = dict(raw_metadata)
    if item.get("coverage_reason"):
        metadata["coverage_reason"] = str(item["coverage_reason"])
    if item.get("tool_name"):
        metadata.setdefault("tool_name", str(item["tool_name"]))
    return TestCase(
        case_id=str(item.get("case_id") or uuid.uuid4().hex),
        input=dict(raw_input),
        expected_output=expected,
        reference_answer=(
            str(item["reference_answer"]) if item.get("reference_answer") is not None else None
        ),
        tags=tuple(str(tag) for tag in item.get("tags", ())),
        source=source,
        metadata=metadata,
    )


def parse_imported_cases(raw_json: str, *, source: str = "json") -> list[TestCase]:
    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON: {error.msg}") from error
    if not isinstance(payload, list):
        raise ValueError("Import must be a JSON array of cases")
    return [_case_from_mapping(item, source=source) for item in payload if isinstance(item, Mapping)]


def add_imported_cases(
    registry: DatasetRegistry, dataset_id: str, raw_json: str
) -> list[TestCase]:
    cases = parse_imported_cases(raw_json)
    registry.add_cases(dataset_id, cases)
    return cases


def _coverage_cases(tools: Sequence[ToolBinding], existing: Sequence[TestCase]) -> list[TestCase]:
    existing_queries = {str(case.input.get("query", "")).casefold() for case in existing}
    existing_pairs = {
        (str(case.metadata.get("tool_id", case.metadata.get("tool_name", ""))), str(case.metadata.get("requirement", "")))
        for case in existing
    }
    additions: list[TestCase] = []
    for tool in tools:
        if not tool.enabled:
            continue
        requirements = tool.test_requirements or ("Happy path",)
        for requirement in requirements:
            pair = (tool.tool_id, requirement)
            query = f"Verify {tool.name}: {requirement}"
            if pair in existing_pairs or query.casefold() in existing_queries:
                continue
            additions.append(
                TestCase(
                    uuid.uuid4().hex,
                    {"query": query},
                    {"expected_tool_called": tool.tool_id},
                    tags=("coverage",),
                    source="coverage",
                    metadata={"tool_id": tool.tool_id, "requirement": requirement},
                )
            )
    return additions


def _set_review(
    agent_id: str, dataset_id: str, candidates: Sequence[TestCase], source: str
) -> None:
    st.session_state[_dataset_key(agent_id, dataset_id, "dataset_review")] = list(candidates)
    st.session_state[_dataset_key(agent_id, dataset_id, "dataset_review_source")] = source


def _render_review(registry: DatasetRegistry, agent_id: str, dataset_id: str) -> None:
    review_key = _dataset_key(agent_id, dataset_id, "dataset_review")
    drafts: list[TestCase] = st.session_state.get(review_key, [])
    if not drafts:
        return
    st.markdown("#### Review draft cases")
    st.caption("Edit the generated draft, select only the cases you want, then add them to the current list.")
    selected: list[TestCase] = []
    for index, draft in enumerate(drafts):
        with st.container(border=True):
            keep = st.checkbox(
                "Select case",
                value=True,
                key=_dataset_key(agent_id, dataset_id, f"dataset_review_keep_{index}"),
            )
            query = st.text_input(
                "Query",
                value=str(draft.input.get("query", "")),
                key=_dataset_key(agent_id, dataset_id, f"dataset_review_query_{index}"),
            )
            expected = st.text_area(
                "Expected output (JSON)",
                value=json.dumps(dict(draft.expected_output), indent=2),
                key=_dataset_key(agent_id, dataset_id, f"dataset_review_expected_{index}"),
            )
            if keep:
                try:
                    parsed_expected = json.loads(expected)
                    if not isinstance(parsed_expected, dict):
                        raise ValueError
                except (json.JSONDecodeError, ValueError):
                    st.warning("Expected output must be a JSON object.")
                else:
                    selected.append(
                        TestCase(
                            draft.case_id,
                            {**dict(draft.input), "query": query.strip()},
                            parsed_expected,
                            draft.reference_answer,
                            draft.tags,
                            draft.source,
                            dict(draft.metadata),
                        )
                    )
    accept, cancel = st.columns([1.4, 5])
    if accept.button(
        "Add selected cases",
        key=_dataset_key(agent_id, dataset_id, "dataset_review_accept"),
        type="primary",
    ):
        if not selected:
            st.warning("Select at least one valid case.")
        elif any(not str(case.input.get("query", "")).strip() for case in selected):
            st.warning("Every selected case needs a query.")
        else:
            try:
                registry.add_cases(dataset_id, selected)
            except ValueError as error:
                st.error(str(error))
            else:
                st.session_state.pop(review_key, None)
                st.success(f"Added {len(selected)} case(s).")
                st.rerun()
    if cancel.button(
        "Cancel review", key=_dataset_key(agent_id, dataset_id, "dataset_review_cancel")
    ):
        st.session_state.pop(review_key, None)
        st.rerun()


def _render_case_editor(registry: DatasetRegistry, agent_id: str, dataset_id: str) -> None:
    editor_key = _dataset_key(agent_id, dataset_id, "dataset_editor")
    editor = st.session_state.get(editor_key)
    if editor is None:
        return
    editing = isinstance(editor, str) and editor != "new"
    existing = next((case for case in registry.list_draft(dataset_id) if case.case_id == editor), None)
    if editing and existing is None:
        st.session_state.pop(editor_key, None)
        return
    with st.container(border=True):
        st.subheader("Edit case" if editing else "Add case")
        with st.form(_dataset_key(agent_id, dataset_id, "dataset_case_form")):
            query = st.text_input("Query", value=str(existing.input.get("query", "")) if existing else "")
            expected = st.text_area(
                "Expected output (JSON)",
                value=json.dumps(dict(existing.expected_output), indent=2) if existing else "{}",
            )
            save, cancel = st.columns(2)
            submitted = save.form_submit_button("Save case", type="primary")
            cancelled = cancel.form_submit_button("Cancel")
        if cancelled:
            st.session_state.pop(editor_key, None)
            st.rerun()
        if submitted:
            try:
                parsed = json.loads(expected)
                if not isinstance(parsed, dict):
                    raise ValueError("Expected output must be a JSON object")
                if not query.strip():
                    raise ValueError("Query must not be empty")
                if existing:
                    registry.replace_case(
                        dataset_id,
                        TestCase(
                            existing.case_id,
                            {**dict(existing.input), "query": query.strip()},
                            parsed,
                            existing.reference_answer,
                            existing.tags,
                            existing.source,
                            dict(existing.metadata),
                        ),
                    )
                else:
                    registry.add_cases(
                        dataset_id,
                        [TestCase(uuid.uuid4().hex, {"query": query.strip()}, parsed)],
                    )
            except (json.JSONDecodeError, ValueError) as error:
                st.error(str(error))
            else:
                st.session_state.pop(editor_key, None)
                st.rerun()


def render_datasets_module(
    repository: WorkbenchRepository,
    agent_id: str,
    llm_generate: CandidateGenerator | None = None,
) -> None:
    """Render the durable draft for one Agent; every case begins user-added."""
    registry = DatasetRegistry(repository)
    rows = _dataset_rows(repository, agent_id)
    if not rows:
        registry.create(agent_id, "Evaluation Dataset")
        rows = _dataset_rows(repository, agent_id)
    if not rows:
        st.error("Datasets could not be loaded. Try reopening the Agent workspace.")
        return

    options = {f"{row['name']} · draft · revision {row['current_revision']}": row for row in rows}
    label = st.selectbox("Dataset", list(options), key=f"dataset_select_{agent_id}")
    dataset_id = str(options[label]["dataset_id"])
    cases = registry.list_draft(dataset_id)

    heading, count = st.columns([5, 1])
    heading.subheader("Dataset draft")
    count.metric("Cases", len(cases))
    st.caption("Cases remain editable until you publish an immutable Dataset Revision.")

    action_columns = st.columns(5)
    if action_columns[0].button(
        "Add case",
        key=_dataset_key(agent_id, dataset_id, "dataset_add_case"),
        type="primary",
        width="stretch",
    ):
        st.session_state[_dataset_key(agent_id, dataset_id, "dataset_editor")] = "new"
        st.rerun()
    if action_columns[1].button(
        "Generate with LLM",
        key=_dataset_key(agent_id, dataset_id, "dataset_generate_llm"),
        width="stretch",
    ):
        generator = llm_generate or st.session_state.get("dataset_llm_generator")
        if generator is None:
            st.session_state[_dataset_key(agent_id, dataset_id, "dataset_llm_notice")] = True
            st.rerun()
        else:
            try:
                raw = generator(agent_id, tuple(cases))
                drafts = [_case_from_mapping(item, source="llm") for item in raw]
            except Exception as error:  # boundary: provider failures belong in the UI
                st.error(f"LLM generation failed: {error}")
            else:
                _set_review(agent_id, dataset_id, drafts, "llm")
                st.rerun()
    if action_columns[2].button(
        "Import JSON",
        key=_dataset_key(agent_id, dataset_id, "dataset_import_json"),
        width="stretch",
    ):
        st.session_state[_dataset_key(agent_id, dataset_id, "dataset_import_open")] = True
        st.rerun()
    if action_columns[3].button(
        "Complete coverage",
        key=_dataset_key(agent_id, dataset_id, "dataset_complete_coverage"),
        width="stretch",
    ):
        additions = _coverage_cases(_current_tools(repository, agent_id), cases)
        if additions:
            registry.add_cases(dataset_id, additions)
            st.success(f"Added {len(additions)} coverage case(s).")
            st.rerun()
        else:
            st.info("Coverage is complete for enabled Tool requirements.")
    if action_columns[4].button(
        "Publish revision",
        key=_dataset_key(agent_id, dataset_id, "dataset_publish"),
        type="primary",
        disabled=not cases,
        width="stretch",
    ):
        revision = registry.publish(dataset_id)
        st.success(f"Published Dataset Revision {revision.revision} with {len(revision.cases)} case(s).")
        st.rerun()

    notice_key = _dataset_key(agent_id, dataset_id, "dataset_llm_notice")
    if st.session_state.get(notice_key):
        st.markdown(
            "<div style='background:#FBF4E4;border:1px solid #EADCB8;border-radius:12px;padding:14px 16px;'>"
            "<strong>LLM draft service is not configured</strong><br>Connect a candidate generator to review, edit, and select generated cases here."
            "</div>",
            unsafe_allow_html=True,
        )
    if st.session_state.get(_dataset_key(agent_id, dataset_id, "dataset_import_open")):
        with st.container(border=True):
            st.subheader("Import JSON")
            raw = st.text_area(
                "Cases (JSON array)",
                placeholder='[{"input":{"query":"Hello"},"expected_output":{}}]',
                key=_dataset_key(agent_id, dataset_id, "dataset_import_payload"),
            )
            preview, cancel = st.columns([1, 4])
            if preview.button(
                "Review import",
                key=_dataset_key(agent_id, dataset_id, "dataset_import_preview"),
                type="primary",
            ):
                try:
                    drafts = parse_imported_cases(raw)
                except ValueError as error:
                    st.error(str(error))
                else:
                    _set_review(agent_id, dataset_id, drafts, "json")
                    st.session_state[_dataset_key(agent_id, dataset_id, "dataset_import_open")] = False
                    st.rerun()
            if cancel.button(
                "Cancel", key=_dataset_key(agent_id, dataset_id, "dataset_import_cancel")
            ):
                st.session_state[_dataset_key(agent_id, dataset_id, "dataset_import_open")] = False
                st.rerun()

    _render_case_editor(registry, agent_id, dataset_id)
    _render_review(registry, agent_id, dataset_id)

    cases = registry.list_draft(dataset_id)
    if not cases:
        with st.container(border=True):
            st.markdown("**No cases in the current draft**")
            st.caption("Add a case, generate an LLM draft, import JSON, or complete Tool coverage.")
        return

    st.markdown("#### Current ordered cases")
    for position, case in enumerate(cases, 1):
        with st.container(border=True):
            detail, actions = st.columns([5, 2])
            with detail:
                st.markdown(f"**{position}. {case.input.get('query', 'Untitled case')}**")
                required_tool = case.expected_output.get("expected_tool_called") or "No Tool required"
                st.caption(f"{case.source.upper()} · {required_tool} · {case.case_id}")
            edit, duplicate, delete = actions.columns(3)
            if edit.button(
                "Edit", key=_dataset_key(agent_id, dataset_id, f"dataset_edit_{case.case_id}")
            ):
                st.session_state[_dataset_key(agent_id, dataset_id, "dataset_editor")] = case.case_id
                st.rerun()
            if duplicate.button(
                "Duplicate", key=_dataset_key(agent_id, dataset_id, f"dataset_duplicate_{case.case_id}")
            ):
                clone = TestCase(
                    uuid.uuid4().hex,
                    {**dict(case.input), "query": f"{case.input.get('query', '')} (copy)"},
                    dict(case.expected_output),
                    case.reference_answer,
                    case.tags,
                    case.source,
                    dict(case.metadata),
                )
                registry.add_cases(dataset_id, [clone])
                st.rerun()
            if delete.button(
                "Delete", key=_dataset_key(agent_id, dataset_id, f"dataset_delete_{case.case_id}")
            ):
                registry.delete_case(dataset_id, case.case_id)
                st.rerun()
