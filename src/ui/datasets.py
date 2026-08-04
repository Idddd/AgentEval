"""Agent-owned Dataset draft, review, import, coverage, and publishing UI."""
from __future__ import annotations

import json
import inspect
import re
import uuid
from collections.abc import Callable, Mapping, Sequence
from typing import Any

import streamlit as st

from src.dataset_registry import DatasetRegistry
from src.dataset_generation import GeneratedBatch
from src.workbench_models import CREATE_FORM_TEMPLATE, DatasetColumn, DatasetSchema, TestCase, ToolBinding
from src.workbench_repository import WorkbenchRepository

from .state import request_navigation


CandidateGenerator = Callable[..., GeneratedBatch | Sequence[Mapping[str, Any]]]


_COLUMN_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
_DATA_TYPES = ("string", "number", "boolean", "json")
_COLUMN_KINDS = ("input", "output")
_REQUIRED_CHOICES = ("yes", "no")
_DATASET_VIEWS = ("list", "draft", "schema", "history", "create")


def _create_key(agent_id: str, suffix: str) -> str:
    return f"dataset_create_{suffix}_{agent_id}"


def _initial_create_columns() -> list[dict[str, str]]:
    return [_new_column_dict(column) for column in CREATE_FORM_TEMPLATE.columns]


def _new_column_dict(
    template: DatasetColumn | None = None, *, locked: bool = True
) -> dict[str, str]:
    base = {
        "_id": uuid.uuid4().hex,
        "_locked": "no",
        "kind": "input",
        "name": "",
        "data_type": "string",
        "required": "yes",
        "description": "",
    }
    if template is not None:
        base.update(
            {
                "_locked": "yes" if locked else "no",
                "kind": template.kind,
                "name": template.name,
                "data_type": template.data_type,
                "required": "yes" if template.required else "no",
                "description": template.description,
            }
        )
    return base


def _dataset_view_key(agent_id: str) -> str:
    return f"dataset_view_{agent_id}"


def _set_dataset_view(agent_id: str, view: str) -> None:
    if view not in _DATASET_VIEWS:
        raise ValueError(f"Unknown Dataset view: {view}")
    st.session_state[_dataset_view_key(agent_id)] = view


def _dataset_rows(repository: WorkbenchRepository, agent_id: str) -> list[dict[str, Any]]:
    """Return durable dataset headers until the repository grows a list API."""
    connect = getattr(repository, "_connect", None)
    if connect is None:
        return []
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT
                datasets.dataset_id,
                datasets.name,
                datasets.description,
                datasets.current_revision,
                datasets.created_at,
                (SELECT revision_id FROM dataset_revisions
                 WHERE dataset_revisions.dataset_id = datasets.dataset_id
                   AND dataset_revisions.revision = datasets.current_revision) AS current_revision_id,
                (SELECT COUNT(*) FROM dataset_draft_cases
                 WHERE dataset_draft_cases.dataset_id = datasets.dataset_id) AS draft_cases,
                (SELECT COUNT(*) FROM eval_runs
                 JOIN dataset_revisions
                   ON dataset_revisions.revision_id = eval_runs.dataset_revision_id
                 WHERE dataset_revisions.dataset_id = datasets.dataset_id) AS evaluation_count,
                (SELECT MAX(eval_runs.started_at) FROM eval_runs
                 JOIN dataset_revisions
                   ON dataset_revisions.revision_id = eval_runs.dataset_revision_id
                 WHERE dataset_revisions.dataset_id = datasets.dataset_id) AS last_evaluated
            FROM datasets
            WHERE datasets.agent_id = ?
            ORDER BY datasets.created_at DESC, datasets.dataset_id
            """,
            (agent_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def _current_tools(repository: WorkbenchRepository, agent_id: str) -> tuple[ToolBinding, ...]:
    revision = repository.get_current_agent_revision(agent_id)
    return revision.tools if revision is not None else ()


def _dataset_key(agent_id: str, dataset_id: str, name: str) -> str:
    """Namespace Dataset widgets by their locked Agent and Dataset draft."""
    return f"{name}_{agent_id}_{dataset_id}"


def _case_from_mapping(
    item: Mapping[str, Any],
    *,
    schema: DatasetSchema,
    source: str,
) -> TestCase:
    raw_input = item.get("input", {})
    if not isinstance(raw_input, Mapping):
        raise ValueError("Case input must be a JSON object")
    raw_expected = item.get("expected_output", {})
    if not isinstance(raw_expected, Mapping):
        raise ValueError("Case expected_output must be a JSON object")

    input_data = {
        column.name: raw_input[column.name]
        for column in schema.input_columns
        if column.name in raw_input
    }
    expected_data = {
        column.name: raw_expected[column.name]
        for column in schema.output_columns
        if column.name in raw_expected
    }
    raw_metadata = item.get("metadata", {})
    if not isinstance(raw_metadata, Mapping):
        raise ValueError("Case metadata must be a JSON object")

    case = TestCase(
        case_id=str(item.get("case_id") or uuid.uuid4().hex),
        input=input_data,
        expected_output=expected_data,
        reference_answer=(
            str(item["reference_answer"]) if item.get("reference_answer") is not None else None
        ),
        tags=tuple(str(tag) for tag in item.get("tags", ())),
        source=source,
        metadata=dict(raw_metadata),
    )

    errors = schema.validate_case(case)
    if errors:
        raise ValueError("; ".join(errors))
    return case


def parse_imported_cases(
    raw_json: str,
    *,
    schema: DatasetSchema,
    source: str = "json",
) -> list[TestCase]:
    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON: {error.msg}") from error
    if not isinstance(payload, list):
        raise ValueError("Import must be a JSON array of cases")
    return [
        _case_from_mapping(item, schema=schema, source=source)
        for item in payload
        if isinstance(item, Mapping)
    ]


def add_imported_cases(
    registry: DatasetRegistry, dataset_id: str, raw_json: str
) -> list[TestCase]:
    schema = registry.schema_for(dataset_id)
    cases = parse_imported_cases(raw_json, schema=schema)
    registry.add_cases(dataset_id, cases)
    return cases


def _required_coverage_value(column: DatasetColumn, tool: ToolBinding, requirement: str) -> Any:
    if column.name == "query":
        return f"Verify {tool.name}: {requirement}"
    if column.name == "expected_action":
        return f"Call {tool.name} for {requirement}"
    if column.name == "expected_tool_called":
        return tool.tool_id
    return {
        "string": requirement,
        "number": 0,
        "boolean": False,
        "json": {},
    }[column.data_type]


def _coverage_cases(
    tools: Sequence[ToolBinding],
    existing: Sequence[TestCase],
    schema: DatasetSchema,
) -> list[TestCase]:
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
            input_values = {
                column.name: _required_coverage_value(column, tool, requirement)
                for column in schema.input_columns
                if column.required or column.name == "query"
            }
            expected_values = {
                column.name: _required_coverage_value(column, tool, requirement)
                for column in schema.output_columns
                if column.required or column.name == "expected_tool_called"
            }
            additions.append(
                TestCase(
                    uuid.uuid4().hex,
                    input_values,
                    expected_values,
                    tags=("coverage",),
                    source="coverage",
                    metadata={"tool_id": tool.tool_id, "requirement": requirement},
                )
            )
    return additions


def _set_review(
    agent_id: str,
    dataset_id: str,
    candidates: Sequence[TestCase],
    source: str,
    batch: GeneratedBatch | None = None,
) -> None:
    st.session_state[_dataset_key(agent_id, dataset_id, "dataset_review")] = list(candidates)
    st.session_state[_dataset_key(agent_id, dataset_id, "dataset_review_source")] = source
    summary_key = _dataset_key(agent_id, dataset_id, "dataset_review_generation")
    if batch is None:
        st.session_state.pop(summary_key, None)
    else:
        st.session_state[summary_key] = batch


def _invoke_candidate_generator(
    generator: CandidateGenerator,
    agent_id: str,
    cases: Sequence[TestCase],
    schema: DatasetSchema,
    progress: Callable[[str], None],
) -> GeneratedBatch | Sequence[Mapping[str, Any]]:
    """Keep compatibility with existing three-argument generators."""
    try:
        inspect.signature(generator).bind(agent_id, tuple(cases), schema, progress)
    except (TypeError, ValueError):
        return generator(agent_id, tuple(cases), schema)
    return generator(agent_id, tuple(cases), schema, progress)


def _case_subtitle(schema: DatasetSchema, case: TestCase) -> str:
    """Pick a concise assertion label for the case list."""
    for col in schema.output_columns:
        value = case.expected_output.get(col.name)
        if value not in (None, "", [], {}):
            if isinstance(value, (dict, list)):
                return f"{col.name}: {json.dumps(value)}"
            return f"{col.name}: {value}"
    return "No assertions"


def _render_field_widget(
    column: DatasetColumn,
    current_value: Any,
    key: str,
) -> tuple[Any, str | None]:
    """Render one schema-driven widget. Returns (raw_value, parse_error)."""
    label = f"{column.name} *" if column.required else column.name
    if column.data_type == "string":
        return st.text_input(label, value=str(current_value or ""), key=key, max_chars=2000), None
    if column.data_type == "number":
        try:
            numeric_default = float(current_value) if current_value not in (None, "") else 0.0
        except (TypeError, ValueError):
            numeric_default = 0.0
        return st.number_input(label, value=numeric_default, key=key), None
    if column.data_type == "boolean":
        return st.checkbox(label, value=bool(current_value), key=key), None
    if column.data_type == "json":
        initial = (
            json.dumps(current_value, indent=2)
            if current_value not in (None, "")
            else ""
        )
        raw = st.text_area(label, value=initial, key=key, placeholder="{} or []")
        if not raw.strip():
            return "", None
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as error:
            return None, f"{column.name}: invalid JSON ({error.msg})"
        return parsed, None
    return None, f"{column.name}: unknown data type {column.data_type}"


def _render_schema_fields(
    schema: DatasetSchema,
    agent_id: str,
    dataset_id: str,
    prefix: str,
    existing_input: Mapping[str, Any] | None,
    existing_expected: Mapping[str, Any] | None,
) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    """Render input + output widgets for a schema. Returns (input, expected, errors)."""
    input_values: dict[str, Any] = {}
    expected_values: dict[str, Any] = {}
    errors: list[str] = []

    if schema.input_columns:
        st.markdown("**Input**")
        for col in schema.input_columns:
            current = (existing_input or {}).get(col.name, "")
            value, error = _render_field_widget(
                col, current, _dataset_key(agent_id, dataset_id, f"{prefix}_in_{col.name}")
            )
            if col.required or value != "":
                input_values[col.name] = value
            if error:
                errors.append(error)
    if schema.output_columns:
        st.markdown("**Output**")
        for col in schema.output_columns:
            current = (existing_expected or {}).get(col.name, "")
            value, error = _render_field_widget(
                col, current, _dataset_key(agent_id, dataset_id, f"{prefix}_out_{col.name}")
            )
            if col.required or value != "":
                expected_values[col.name] = value
            if error:
                errors.append(error)

    return input_values, expected_values, errors


def _render_review(registry: DatasetRegistry, agent_id: str, dataset_id: str) -> None:
    review_key = _dataset_key(agent_id, dataset_id, "dataset_review")
    drafts: list[TestCase] = st.session_state.get(review_key, [])
    if not drafts:
        return
    schema = registry.schema_for(dataset_id)
    batch = st.session_state.get(
        _dataset_key(agent_id, dataset_id, "dataset_review_generation")
    )
    st.markdown("#### Review draft cases")
    st.caption("Edit the generated draft, select only the cases you want, then add them to the current list.")
    if isinstance(batch, GeneratedBatch):
        st.caption(
            "AI generated · Grounded in the current Agent Revision, enabled Tools, "
            f"tags and metadata · Prompt: {batch.prompt_version}"
        )
        if batch.rejected:
            st.caption(
                f"{len(batch.rejected)} candidate(s) were automatically refined "
                "against the current draft and Dataset schema."
            )
    table_rows = [
        _review_table_row(index, schema, draft)
        for index, draft in enumerate(drafts)
    ]
    editor_key = _dataset_key(
        agent_id,
        dataset_id,
        f"dataset_review_editor_{drafts[0].case_id}_{len(drafts)}",
    )
    edited = st.data_editor(
        table_rows,
        column_config=_review_column_config(schema),
        disabled=["Source", "Agent Revision", "Tool", "Requirement", "Tags"],
        hide_index=True,
        width="stretch",
        height=min(460, 40 * (len(drafts) + 1) + 4),
        key=editor_key,
    )
    records = edited.to_dict("records") if hasattr(edited, "to_dict") else list(edited)
    selected: list[TestCase] = []
    review_errors: list[str] = []
    for record in records:
        if not bool(record.get("Select", False)):
            continue
        index = int(record["__case_index"])
        try:
            candidate = _case_from_review_record(record, schema, drafts[index])
        except ValueError as error:
            review_errors.append(f"Row {index + 1}: {error}")
        else:
            selected.append(candidate)
    selected, skipped_duplicates = _filter_new_review_cases(
        registry.list_draft(dataset_id), selected
    )
    if review_errors:
        st.warning("; ".join(review_errors))
    elif skipped_duplicates:
        st.caption(
            f"{skipped_duplicates} already-present candidate(s) will be skipped automatically."
        )
    accept, cancel = st.columns([1.4, 5])
    if accept.button(
        "Add selected cases",
        key=_dataset_key(agent_id, dataset_id, "dataset_review_accept"),
        type="primary",
    ):
        if review_errors:
            st.error("Fix the selected invalid rows before adding cases.")
        elif not selected:
            st.warning("Select at least one valid case.")
        else:
            try:
                registry.add_cases(dataset_id, selected)
            except ValueError as error:
                st.error(str(error))
            else:
                st.session_state.pop(review_key, None)
                st.session_state.pop(
                    _dataset_key(agent_id, dataset_id, "dataset_review_generation"), None
                )
                st.success(f"Added {len(selected)} case(s).")
                st.rerun()
    if cancel.button(
        "Cancel review", key=_dataset_key(agent_id, dataset_id, "dataset_review_cancel")
    ):
        st.session_state.pop(review_key, None)
        st.session_state.pop(
            _dataset_key(agent_id, dataset_id, "dataset_review_generation"), None
        )
        st.rerun()


def _review_table_row(
    index: int,
    schema: DatasetSchema,
    draft: TestCase,
) -> dict[str, Any]:
    row: dict[str, Any] = {"__case_index": index, "Select": True}
    for column in schema.columns:
        namespace = draft.input if column.kind == "input" else draft.expected_output
        value = namespace.get(column.name, "")
        row[column.name] = (
            json.dumps(value, ensure_ascii=False)
            if column.data_type == "json" and value not in (None, "")
            else value
        )
    provenance = draft.metadata.get("provenance", {})
    if not isinstance(provenance, Mapping):
        provenance = {}
    revision = provenance.get("agent_revision")
    row.update(
        {
            "Source": _visible_case_source(draft.source),
            "Agent Revision": f"R{revision}" if revision else "—",
            "Tool": provenance.get("tool_name")
            or provenance.get("tool_id")
            or "Agent only",
            "Requirement": provenance.get("requirement") or "Generated coverage",
            "Tags": ", ".join(draft.tags),
        }
    )
    return row


def _review_column_config(schema: DatasetSchema) -> dict[str, Any]:
    config: dict[str, Any] = {
        "__case_index": None,
        "Select": st.column_config.CheckboxColumn("", width="small", pinned=True),
    }
    for column in schema.columns:
        label = f"{column.name} *" if column.required else column.name
        help_text = column.description or (
            "Required Dataset field" if column.required else "Optional Dataset field"
        )
        if column.data_type == "number":
            config[column.name] = st.column_config.NumberColumn(
                label, help=help_text, width="medium"
            )
        elif column.data_type == "boolean":
            config[column.name] = st.column_config.CheckboxColumn(
                label, help=help_text, width="small"
            )
        else:
            config[column.name] = st.column_config.TextColumn(
                label,
                help=help_text,
                width="large" if column.required else "medium",
            )
    config.update(
        {
            "Source": st.column_config.TextColumn("Source", width="small"),
            "Agent Revision": st.column_config.TextColumn("Agent", width="small"),
            "Tool": st.column_config.TextColumn("Tool", width="medium"),
            "Requirement": st.column_config.TextColumn("Requirement", width="large"),
            "Tags": st.column_config.TextColumn("Tags", width="large"),
        }
    )
    return config


def _case_from_review_record(
    record: Mapping[str, Any],
    schema: DatasetSchema,
    draft: TestCase,
) -> TestCase:
    input_values: dict[str, Any] = {}
    expected_values: dict[str, Any] = {}
    for column in schema.columns:
        value = record.get(column.name, "")
        if column.data_type == "json":
            if value in (None, ""):
                value = None
            else:
                try:
                    value = json.loads(str(value))
                except json.JSONDecodeError as error:
                    raise ValueError(f"{column.name} must be valid JSON") from error
        if not column.required and value in (None, ""):
            continue
        namespace = input_values if column.kind == "input" else expected_values
        namespace[column.name] = value

    case = TestCase(
        draft.case_id,
        input_values,
        expected_values,
        draft.reference_answer,
        draft.tags,
        draft.source,
        dict(draft.metadata),
    )
    errors = schema.validate_case(case)
    if errors:
        raise ValueError("; ".join(errors))
    return case


def _filter_new_review_cases(
    existing: Sequence[TestCase], candidates: Sequence[TestCase]
) -> tuple[list[TestCase], int]:
    existing_ids = {case.case_id for case in existing}
    input_keys = {
        json.dumps(dict(case.input), ensure_ascii=False, sort_keys=True, default=str).casefold()
        for case in existing
    }
    selected: list[TestCase] = []
    skipped = 0
    for case in candidates:
        input_key = json.dumps(
            dict(case.input), ensure_ascii=False, sort_keys=True, default=str
        ).casefold()
        if case.case_id in existing_ids or input_key in input_keys:
            skipped += 1
            continue
        selected.append(case)
        existing_ids.add(case.case_id)
        input_keys.add(input_key)
    return selected, skipped


def _visible_case_source(source: str) -> str:
    if source in {"llm", "demo-fallback"}:
        return "AI generated"
    return {
        "json": "JSON import",
        "coverage": "Coverage",
        "manual": "Manual",
        "demo": "Demo",
    }.get(source, source.replace("-", " ").capitalize())


def _render_case_editor(registry: DatasetRegistry, agent_id: str, dataset_id: str) -> None:
    editor_key = _dataset_key(agent_id, dataset_id, "dataset_editor")
    editor = st.session_state.get(editor_key)
    if editor is None:
        return
    editing = isinstance(editor, str) and editor != "new"
    existing = next(
        (case for case in registry.list_draft(dataset_id) if case.case_id == editor),
        None,
    )
    if editing and existing is None:
        st.session_state.pop(editor_key, None)
        return
    schema = registry.schema_for(dataset_id)
    with st.container(border=False):
        st.subheader("Edit case" if editing else "Add case")
        with st.form(_dataset_key(agent_id, dataset_id, "dataset_case_form")):
            input_values, expected_values, errors = _render_schema_fields(
                schema,
                agent_id,
                dataset_id,
                "case",
                existing.input if existing else None,
                existing.expected_output if existing else None,
            )
            save, cancel = st.columns(2)
            submitted = save.form_submit_button("Save case", type="primary")
            cancelled = cancel.form_submit_button("Cancel")
        if cancelled:
            st.session_state.pop(editor_key, None)
            st.rerun()
        if submitted:
            try:
                if errors:
                    raise ValueError("; ".join(errors))
                metadata = dict(existing.metadata) if existing else {}
                if existing:
                    registry.replace_case(
                        dataset_id,
                        TestCase(
                            existing.case_id,
                            input_values,
                            expected_values,
                            existing.reference_answer,
                            existing.tags,
                            existing.source,
                            metadata,
                        ),
                    )
                else:
                    registry.add_cases(
                        dataset_id,
                        [TestCase(uuid.uuid4().hex, input_values, expected_values)],
                    )
            except ValueError as error:
                st.error(str(error))
            else:
                st.session_state.pop(editor_key, None)
                st.rerun()


def _render_create_form(registry: DatasetRegistry, agent_id: str) -> None:
    """Render the inline create-dataset form and retain draft columns in session state."""
    columns_key = _create_key(agent_id, "columns")
    if columns_key not in st.session_state:
        st.session_state[columns_key] = _initial_create_columns()
    columns: list[dict[str, str]] = st.session_state[columns_key]

    with st.container(border=False, width=660, gap="small"):
        st.markdown("### Create dataset")
        st.caption("Define the Dataset and the fields every evaluation case must contain.")

        st.markdown("**Basic information**")
        name = st.text_input(
            "Name *", max_chars=50, key=_create_key(agent_id, "name"), width="stretch"
        )
        description = st.text_area(
            "Description",
            max_chars=200,
            height=72,
            key=_create_key(agent_id, "description"),
            width="stretch",
        )

        st.markdown("**Columns**")
        st.caption("Built-in fields are locked. Add only fields needed by your evaluator.")
        for column in columns:
            col_id = column["_id"]
            locked = column.get("_locked") == "yes"
            if locked:
                required = "required" if column["required"] == "yes" else "optional"
                st.markdown(
                    f"`{column['name']}` &nbsp; {column['kind']} / "
                    f"{column['data_type']} &nbsp; · &nbsp; {required}"
                )
                continue

            with st.container(
                border=False,
                horizontal=True,
                vertical_alignment="bottom",
                gap="small",
            ):
                st.text_input(
                    "Name *",
                    value=column["name"],
                    max_chars=50,
                    key=_create_key(agent_id, f"col_{col_id}_name"),
                    on_change=_sync_column_field,
                    args=(agent_id, col_id, "name", columns),
                    width=145,
                )
                kind_options = list(_COLUMN_KINDS)
                st.selectbox(
                    "Kind",
                    options=kind_options,
                    index=(
                        kind_options.index(column["kind"])
                        if column["kind"] in kind_options
                        else 0
                    ),
                    key=_create_key(agent_id, f"col_{col_id}_kind"),
                    on_change=_sync_column_field,
                    args=(agent_id, col_id, "kind", columns),
                    width=90,
                )
                type_options = list(_DATA_TYPES)
                st.selectbox(
                    "Type",
                    options=type_options,
                    index=(
                        type_options.index(column["data_type"])
                        if column["data_type"] in type_options
                        else 0
                    ),
                    key=_create_key(agent_id, f"col_{col_id}_type"),
                    on_change=_sync_column_field,
                    args=(agent_id, col_id, "data_type", columns),
                    width=90,
                )
                required_options = list(_REQUIRED_CHOICES)
                st.selectbox(
                    "Required",
                    options=required_options,
                    index=(
                        required_options.index(column["required"])
                        if column["required"] in required_options
                        else 0
                    ),
                    key=_create_key(agent_id, f"col_{col_id}_required"),
                    on_change=_sync_column_field,
                    args=(agent_id, col_id, "required", columns),
                    width=90,
                )
                with st.popover("More", icon=":material/more_horiz:"):
                    st.text_input(
                        "Description",
                        value=column["description"],
                        max_chars=200,
                        key=_create_key(agent_id, f"col_{col_id}_desc"),
                        on_change=_sync_column_field,
                        args=(agent_id, col_id, "description", columns),
                    )
                    with st.container(horizontal=True):
                        if st.button(
                            "Duplicate",
                            key=_create_key(agent_id, f"col_{col_id}_dup"),
                            type="tertiary",
                        ):
                            clone = _new_column_dict(
                                DatasetColumn(
                                    name=column["name"],
                                    kind=column["kind"],
                                    data_type=column["data_type"],
                                    required=column["required"] == "yes",
                                    description=column["description"],
                                ),
                                locked=False,
                            )
                            clone["name"] = _dedupe_column_name(clone["name"], columns)
                            columns.insert(columns.index(column) + 1, clone)
                            st.rerun()
                        if st.button(
                            "Delete",
                            key=_create_key(agent_id, f"col_{col_id}_del"),
                            type="tertiary",
                        ):
                            columns[:] = [c for c in columns if c["_id"] != col_id]
                            st.rerun()

        if st.button(
            "+ Add column", key=_create_key(agent_id, "add_column"), type="tertiary"
        ):
            columns.append(_new_column_dict())
            st.rerun()

        with st.container(horizontal=True):
            submit = st.button(
                "Create dataset",
                key=_create_key(agent_id, "submit"),
                type="primary",
            )
            cancel = st.button(
                "Cancel", key=_create_key(agent_id, "cancel"), type="tertiary"
            )
        if submit:
            error = _validate_create_form(name, columns)
            if error:
                st.error(error)
            else:
                schema = _build_schema_from_columns(columns)
                dataset_id = registry.create(
                    agent_id,
                    name.strip(),
                    description=description.strip(),
                    schema=schema,
                )
                st.session_state[f"dataset_select_{agent_id}"] = (
                    f"{name.strip()} · draft · revision 0"
                )
                st.session_state.selected_dataset_id = dataset_id
                _set_dataset_view(agent_id, "draft")
                st.session_state.pop(columns_key, None)
                st.session_state["dataset_newly_created"] = dataset_id
                st.success("Dataset created.")
                st.rerun()
        if cancel:
            _set_dataset_view(agent_id, "list")
            st.session_state.pop(columns_key, None)
            st.rerun()


def _sync_column_field(
    agent_id: str,
    col_id: str,
    field: str,
    columns: list[dict[str, str]],
) -> None:
    """Pull the latest widget value for one column field into the draft columns."""
    widget_key = _create_key(agent_id, f"col_{col_id}_{_field_to_key_suffix(field)}")
    column = next((c for c in columns if c["_id"] == col_id), None)
    if column is not None and widget_key in st.session_state:
        column[field] = st.session_state[widget_key]


def _field_to_key_suffix(field: str) -> str:
    return {
        "kind": "kind",
        "name": "name",
        "data_type": "type",
        "required": "required",
        "description": "desc",
    }[field]


def _dedupe_column_name(base: str, columns: list[dict[str, str]]) -> str:
    existing = {col["name"] for col in columns}
    candidate = f"{base or 'column'}_copy"
    counter = 1
    while candidate in existing:
        counter += 1
        candidate = f"{base or 'column'}_copy_{counter}"
    return candidate


def _validate_create_form(name: str, columns: list[dict[str, str]]) -> str | None:
    if not name.strip():
        return "Name is required."
    if not any(col.get("name", "").strip() for col in columns):
        return "Each column requires a name."
    seen: set[str] = set()
    for col in columns:
        col_name = col.get("name", "").strip()
        if not col_name:
            return "Each column requires a name."
        if not _COLUMN_NAME_PATTERN.fullmatch(col_name):
            return (
                f"Column '{col_name}' must start with a letter and contain only "
                "letters, digits, or underscores."
            )
        if col_name.casefold() in seen:
            return f"Column names must be unique (duplicate: '{col_name}')."
        seen.add(col_name.casefold())
    if not any(col.get("kind") == "input" for col in columns):
        return "At least one input column is required."
    return None


def _build_schema_from_columns(columns: list[dict[str, str]]) -> DatasetSchema:
    return DatasetSchema(
        columns=tuple(
            DatasetColumn(
                name=col["name"].strip(),
                kind=col["kind"],
                data_type=col["data_type"],
                required=col["required"] == "yes",
                description=col.get("description", "").strip(),
            )
            for col in columns
        )
    )


def _select_dataset(agent_id: str, dataset_id: str) -> None:
    st.session_state.selected_dataset_id = dataset_id
    _set_dataset_view(agent_id, "draft")


def _render_dataset_list(agent_id: str, rows: list[dict[str, Any]]) -> None:
    st.subheader("Datasets")
    st.caption("Select a Dataset to inspect its draft, schema, and evaluation history.")
    with st.container(horizontal=True, horizontal_alignment="right"):
        if st.button(
            "Create",
            key=f"dataset_create_button_{agent_id}",
            type="primary" if not rows else "secondary",
            on_click=_set_dataset_view,
            args=(agent_id, "create"),
            icon=":material/add:",
        ):
            st.session_state[_create_key(agent_id, "columns")] = _initial_create_columns()
    table_rows = []
    for row in rows:
        revision = int(row.get("current_revision") or 0)
        table_rows.append(
            {
                "Name": row["name"],
                "Draft": int(row.get("draft_cases") or 0),
                "Published": f"R{revision}" if revision else "—",
                "Evaluations": int(row.get("evaluation_count") or 0),
                "View": "View",
            }
        )
    st.dataframe(
        table_rows,
        column_config={
            "Name": st.column_config.TextColumn("Name", width="medium", pinned=True),
            "View": st.column_config.ButtonColumn(
                "Action",
                width="small",
                type="primary",
                alignment="center",
                key=f"dataset_list_actions_{agent_id}",
                on_click=_handle_dataset_list_action,
                args=(agent_id, tuple(str(row["dataset_id"]) for row in rows)),
            ),
            "Draft": st.column_config.NumberColumn("Draft", width="small"),
            "Published": st.column_config.TextColumn("Published", width="small"),
            "Evaluations": st.column_config.NumberColumn("Evaluations", width="small"),
        },
        hide_index=True,
        width="stretch",
    )


def _handle_dataset_list_action(agent_id: str, dataset_ids: Sequence[str]) -> None:
    click = st.session_state.get(f"dataset_list_actions_{agent_id}")
    if not click:
        return
    row = int(click["row"])
    if 0 <= row < len(dataset_ids):
        _select_dataset(agent_id, dataset_ids[row])


def _sync_dataset_view_from_tab(agent_id: str) -> None:
    labels = {"draft": "Draft cases", "schema": "Schema", "history": "Evaluation history"}
    selected = st.session_state.get(f"dataset_tabs_{agent_id}")
    view = next((view for view, label in labels.items() if label == selected), "draft")
    _set_dataset_view(agent_id, view)


def _render_dataset_local_navigation(agent_id: str, selected_view: str) -> None:
    labels = {"draft": "Draft cases", "schema": "Schema", "history": "Evaluation history"}
    st.segmented_control(
        "Dataset view",
        options=list(labels.values()),
        default=labels[selected_view],
        key=f"dataset_tabs_{agent_id}",
        on_change=_sync_dataset_view_from_tab,
        args=(agent_id,),
        label_visibility="collapsed",
        width="content",
    )


def _case_table_rows(schema: DatasetSchema, cases: Sequence[TestCase]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for position, case in enumerate(cases, 1):
        row: dict[str, Any] = {"#": position}
        for column in schema.columns:
            namespace = case.input if column.kind == "input" else case.expected_output
            value = namespace.get(column.name)
            row[column.name] = json.dumps(value) if isinstance(value, (dict, list)) else value
        row["Source"] = _visible_case_source(case.source)
        provenance = case.metadata.get("provenance", {})
        if isinstance(provenance, Mapping):
            row["Generated from"] = (
                provenance.get("tool_name")
                or provenance.get("tool_id")
                or provenance.get("source")
                or case.source
            )
            row["Requirement"] = provenance.get("requirement") or case.metadata.get(
                "requirement", ""
            )
        else:
            row["Generated from"] = case.source
            row["Requirement"] = case.metadata.get("requirement", "")
        row["Tags"] = ", ".join(case.tags)
        row["Actions"] = [
            ":material/edit: Edit",
            ":material/content_copy: Duplicate",
            ":material/delete: Delete",
        ]
        rows.append(row)
    return rows


def _handle_case_table_action(
    registry: DatasetRegistry,
    agent_id: str,
    dataset_id: str,
    schema: DatasetSchema,
    cases: Sequence[TestCase],
) -> None:
    click = st.session_state.get(_dataset_key(agent_id, dataset_id, "dataset_case_actions"))
    if not click:
        return
    row = int(click["row"])
    if row < 0 or row >= len(cases):
        return
    case = cases[row]
    label = str(click["label"])
    if "Edit" in label:
        st.session_state[_dataset_key(agent_id, dataset_id, "dataset_editor")] = case.case_id
    elif "Duplicate" in label:
        registry.add_cases(dataset_id, [_duplicate_case(case, schema, cases)])
    elif "Delete" in label:
        registry.delete_case(dataset_id, case.case_id)


def _duplicate_case(
    case: TestCase, schema: DatasetSchema, existing_cases: Sequence[TestCase]
) -> TestCase:
    input_values = {**dict(case.input)}
    first_input = schema.input_columns[0] if schema.input_columns else None
    if first_input is not None and isinstance(input_values.get(first_input.name), str):
        original = str(input_values[first_input.name])
        existing_values = {
            str(item.input.get(first_input.name, "")).casefold() for item in existing_cases
        }
        candidate = f"{original} (copy)"
        counter = 2
        while candidate.casefold() in existing_values:
            candidate = f"{original} (copy {counter})"
            counter += 1
        input_values[first_input.name] = candidate
    return TestCase(
        uuid.uuid4().hex,
        input_values,
        dict(case.expected_output),
        case.reference_answer,
        case.tags,
        case.source,
        dict(case.metadata),
    )


def _render_case_table(
    registry: DatasetRegistry,
    agent_id: str,
    dataset_id: str,
    schema: DatasetSchema,
    cases: Sequence[TestCase],
) -> None:
    st.dataframe(
        _case_table_rows(schema, cases),
        column_config={
            "#": st.column_config.NumberColumn("#", width="small"),
            "Actions": st.column_config.ButtonColumn(
                "",
                width="small",
                type="tertiary",
                alignment="right",
                key=_dataset_key(agent_id, dataset_id, "dataset_case_actions"),
                on_click=_handle_case_table_action,
                args=(registry, agent_id, dataset_id, schema, tuple(cases)),
            ),
        },
        hide_index=True,
        width="stretch",
    )


def _selected_dataset_row(
    rows: list[dict[str, Any]], selected_dataset_id: str | None
) -> dict[str, Any] | None:
    return next(
        (row for row in rows if str(row["dataset_id"]) == selected_dataset_id),
        None,
    )


def _dataset_history(
    repository: WorkbenchRepository, agent_id: str, dataset_id: str
) -> list[dict[str, Any]]:
    reports_by_run: dict[str, Any] = {}
    for report in repository.list_reports(agent_id):
        reports_by_run.setdefault(report.run_id, report)

    history: list[dict[str, Any]] = []
    for run in repository.list_runs(agent_id):
        revision = repository.get_dataset_revision(run.dataset_revision_id)
        if revision.dataset_id != dataset_id:
            continue
        report = reports_by_run.get(run.run_id)
        metrics = report.summary.get("metrics", {}) if report is not None else {}
        history.append(
            {
                "run_id": run.run_id,
                "dataset_revision": revision.revision,
                "started_at": run.started_at,
                "status": run.status.value,
                "pass_rate": metrics.get("pass_rate"),
                "total_cases": metrics.get("total_cases", len(revision.cases)),
                "evaluation_cost": metrics.get("evaluation_cost_usd"),
                "report_id": report.report_id if report is not None else None,
            }
        )
    return history


def _open_report(report_id: str) -> None:
    st.session_state.selected_report_id = report_id
    request_navigation("Report")
    st.rerun(scope="app")


def _evaluate_dataset_revision(revision_id: str) -> None:
    st.session_state.requested_dataset_revision_id = revision_id
    request_navigation("Evaluation")


def render_datasets_module(
    repository: WorkbenchRepository,
    agent_id: str,
    llm_generate: CandidateGenerator | None = None,
    *,
    _dialog_content: bool = False,
) -> None:
    """Render the durable draft for one Agent; every case begins user-added."""
    registry = DatasetRegistry(repository)
    rows = _dataset_rows(repository, agent_id)
    view_key = _dataset_view_key(agent_id)
    st.session_state.setdefault(view_key, "list")
    if st.session_state[view_key] not in _DATASET_VIEWS:
        st.session_state[view_key] = "list"
    view = str(st.session_state[view_key])

    if view != "list" and not _dialog_content:
        _render_dataset_list(agent_id, rows)
        _dataset_dialog(repository, agent_id, llm_generate)
        return

    if view == "create":
        _render_create_form(registry, agent_id)
        return

    if not rows:
        _render_dataset_list(agent_id, rows)
        st.markdown("**No datasets yet**")
        st.caption(
            "Create a dataset to start adding evaluation cases. "
            "A schema defines the fields each case must satisfy."
        )
        return

    if view == "list":
        _render_dataset_list(agent_id, rows)
        return

    selected_row = _selected_dataset_row(
        rows, st.session_state.get("selected_dataset_id")
    )
    if selected_row is None:
        _set_dataset_view(agent_id, "list")
        st.rerun()
        return

    dataset_id = str(selected_row["dataset_id"])
    cases = registry.list_draft(dataset_id)
    add_case = generate = import_json = complete_coverage = False
    revision_number = int(selected_row.get("current_revision") or 0)
    draft_count = int(selected_row.get("draft_cases") or 0)
    published = f"Published R{revision_number}" if revision_number else "Not published"
    revision_id = selected_row.get("current_revision_id")
    with st.container(horizontal=True, horizontal_alignment="distribute", vertical_alignment="center"):
        with st.container(horizontal=True, vertical_alignment="center"):
            st.button(
                "",
                key=f"dataset_back_{agent_id}",
                on_click=_set_dataset_view,
                args=(agent_id, "list"),
                icon=":material/arrow_back:",
                type="tertiary",
                help="Back to datasets",
            )
            st.markdown(f"### {selected_row['name']}")
        with st.container(horizontal=True, vertical_alignment="center"):
            if view == "draft":
                add_case = st.button(
                    "Add case",
                    key=_dataset_key(agent_id, dataset_id, "dataset_add_case"),
                    type="tertiary",
                    icon=":material/add:",
                )
                with st.popover("More", icon=":material/more_horiz:"):
                    generate = st.button(
                        "Generate", key=_dataset_key(agent_id, dataset_id, "dataset_generate_llm"),
                        type="tertiary", icon=":material/auto_awesome:", width="stretch",
                    )
                    import_json = st.button(
                        "Import JSON", key=_dataset_key(agent_id, dataset_id, "dataset_import_json"),
                        type="tertiary", icon=":material/upload_file:", width="stretch",
                    )
                    complete_coverage = st.button(
                        "Complete coverage", key=_dataset_key(agent_id, dataset_id, "dataset_complete_coverage"),
                        type="tertiary", icon=":material/checklist:", width="stretch",
                    )
            if revision_id:
                st.button(
                    "Evaluate", key=f"dataset_evaluate_{agent_id}_{dataset_id}", type="primary",
                    on_click=_evaluate_dataset_revision, args=(str(revision_id),), icon=":material/play_arrow:",
                )
            if st.button(
                "Publish", key=_dataset_key(agent_id, dataset_id, "dataset_publish"),
                disabled=not cases, icon=":material/publish:",
            ):
                revision = registry.publish(dataset_id)
                st.success(f"Published Dataset Revision {revision.revision} with {len(revision.cases)} case(s).")
                st.rerun()
    st.caption(f"{published} · Draft has {draft_count} cases")
    _render_dataset_local_navigation(agent_id, view)

    if view == "schema":
        schema = registry.schema_for(dataset_id)
        st.subheader("Schema")
        for column in schema.columns:
            required = "Required" if column.required else "Optional"
            st.markdown(f"**{column.name}** · {column.kind} · {column.data_type} · {required}")
            if column.description:
                st.caption(column.description)
            st.divider()
        return

    if view == "history":
        st.subheader("Evaluation history")
        st.caption("Runs for every published revision of this Dataset.")
        history = _dataset_history(repository, agent_id, dataset_id)
        if not history:
            st.info("This Dataset has not been evaluated yet.")
            return
        headings = st.columns([1.6, 0.8, 1.5, 1, 0.9, 0.9, 0.8])
        for column, label in zip(
            headings,
            ("Run", "Revision", "Started", "Status", "Pass rate", "Cost", ""),
            strict=True,
        ):
            column.caption(label)
        for row in history:
            columns = st.columns(
                [1.6, 0.8, 1.5, 1, 0.9, 0.9, 0.8], vertical_alignment="center"
            )
            columns[0].code(str(row["run_id"])[:10])
            columns[1].write(f"R{row['dataset_revision']}")
            columns[2].write(str(row["started_at"]))
            columns[3].write(str(row["status"]))
            pass_rate = row.get("pass_rate")
            columns[4].write("—" if pass_rate is None else f"{float(pass_rate):.1f}%")
            cost = row.get("evaluation_cost")
            columns[5].write("—" if cost is None else f"${float(cost):.4f}")
            report_id = row.get("report_id")
            if report_id:
                columns[6].button(
                    "Report",
                    key=f"dataset_history_report_{row['run_id']}",
                    on_click=_open_report,
                    args=(str(report_id),),
                )
            st.divider()
        return

    st.caption(f"{len(cases)} cases · Editable draft; publish to create an immutable revision.")

    if add_case:
        st.session_state[_dataset_key(agent_id, dataset_id, "dataset_editor")] = "new"
        st.rerun()
    if generate:
        generator = llm_generate or st.session_state.get("dataset_llm_generator")
        if generator is None:
            st.session_state[_dataset_key(agent_id, dataset_id, "dataset_llm_notice")] = True
            st.rerun()
        else:
            try:
                schema = registry.schema_for(dataset_id)
                with st.status("Generating Dataset...", expanded=True) as generation_status:
                    generation_status.write("Preparing the current Agent Revision")
                    raw = _invoke_candidate_generator(
                        generator,
                        agent_id,
                        tuple(cases),
                        schema,
                        generation_status.write,
                    )
                    batch = raw if isinstance(raw, GeneratedBatch) else None
                    items = batch.candidates if batch is not None else raw
                    source = batch.source if batch is not None else "llm"
                    generation_status.write("Validating provenance and Dataset fields")
                    drafts = [
                        _case_from_mapping(item, schema=schema, source=source)
                        for item in items
                    ]
                    generation_status.update(
                        label=f"Generated {len(drafts)} Dataset case(s)",
                        state="complete",
                        expanded=False,
                    )
            except Exception as error:  # boundary: provider failures belong in the UI
                st.error(f"LLM generation failed: {error}")
            else:
                _set_review(agent_id, dataset_id, drafts, source, batch)
                st.rerun()
    if import_json:
        st.session_state[_dataset_key(agent_id, dataset_id, "dataset_import_open")] = True
        st.rerun()
    if complete_coverage:
        current_schema = registry.schema_for(dataset_id)
        if not any(col.name == "expected_tool_called" for col in current_schema.output_columns):
            st.info(
                "Coverage generation needs an output column named 'expected_tool_called'. "
                "Add one in the dataset schema to enable tool coverage templating."
            )
        else:
            additions = _coverage_cases(
                _current_tools(repository, agent_id), cases, current_schema
            )
            if additions:
                registry.add_cases(dataset_id, additions)
                st.success(f"Added {len(additions)} coverage case(s).")
                st.rerun()
            else:
                st.info("Coverage is complete for enabled Tool requirements.")
    notice_key = _dataset_key(agent_id, dataset_id, "dataset_llm_notice")
    if st.session_state.get(notice_key):
        st.markdown(
            "<div style='background:#FBF4E4;border:1px solid #EADCB8;border-radius:12px;padding:14px 16px;'>"
            "<strong>LLM draft service is not configured</strong><br>Connect a candidate generator to review, edit, and select generated cases here."
            "</div>",
            unsafe_allow_html=True,
        )
    if st.session_state.get(_dataset_key(agent_id, dataset_id, "dataset_import_open")):
        with st.container(border=False):
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
                    drafts = parse_imported_cases(raw, schema=registry.schema_for(dataset_id))
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
    cases = registry.list_draft(dataset_id)
    if not cases:
        st.markdown("**No cases in the current draft**")
        st.caption("Add a case, generate an LLM draft, import JSON, or complete Tool coverage.")
    else:
        st.markdown("#### Current Dataset draft")
        st.caption("Existing cases remain unchanged while generated candidates are reviewed.")
        current_schema = registry.schema_for(dataset_id)
        _render_case_table(registry, agent_id, dataset_id, current_schema, cases)

    _render_review(registry, agent_id, dataset_id)


@st.dialog("Dataset", width="large")
def _dataset_dialog(
    repository: WorkbenchRepository,
    agent_id: str,
    llm_generate: CandidateGenerator | None,
) -> None:
    render_datasets_module(
        repository,
        agent_id,
        llm_generate,
        _dialog_content=True,
    )
