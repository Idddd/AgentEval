"""Metadata-aware Dataset candidate generation with a transparent local fallback."""
from __future__ import annotations

import hashlib
import json
import re
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .intent import generate_case_candidates_response
from .settings import Settings
from .workbench_models import DatasetColumn, DatasetSchema, TestCase, ToolBinding
from .workbench_repository import WorkbenchRepository


PROMPT_VERSION = "dataset-generation-v2"
ProgressCallback = Callable[[str], None]


@dataclass(frozen=True)
class GenerationContext:
    agent_id: str
    agent_name: str
    agent_description: str
    agent_revision_id: str
    agent_revision: int
    agent_config: dict[str, Any]
    tools: tuple[ToolBinding, ...]
    schema: DatasetSchema
    existing_values: tuple[str, ...]


@dataclass(frozen=True)
class GeneratedBatch:
    candidates: tuple[dict[str, Any], ...]
    source: str
    mode: str
    provider: str
    model: str
    prompt_version: str = PROMPT_VERSION
    fallback_reason: str | None = None
    rejected: tuple[str, ...] = ()


def build_generation_context(
    repository: WorkbenchRepository,
    agent_id: str,
    cases: Sequence[TestCase],
    schema: DatasetSchema,
) -> GenerationContext:
    agent = repository.get_agent(agent_id)
    revision = repository.get_current_agent_revision(agent_id)
    if revision is None:
        raise ValueError("Select a Target with an immutable Revision before generating cases")
    first_input = schema.input_columns[0] if schema.input_columns else None
    existing_values = tuple(
        str(case.input.get(first_input.name, ""))
        for case in cases
        if first_input is not None and case.input.get(first_input.name) not in (None, "")
    )
    config = revision.config_snapshot
    metadata = _mapping(config.get("metadata"))
    safe_metadata = _mapping(metadata.get("dataset_generation"))
    return GenerationContext(
        agent_id=agent.agent_id,
        agent_name=agent.name,
        agent_description=agent.description,
        agent_revision_id=revision.revision_id,
        agent_revision=revision.revision,
        agent_config={
            "model": _plain(config.get("model")),
            "prompt": str(config.get("prompt", config.get("system_prompt", ""))),
            "tags": [str(tag) for tag in config.get("tags", ())],
            "dataset_generation": _plain(safe_metadata),
        },
        tools=tuple(tool for tool in revision.tools if tool.enabled),
        schema=schema,
        existing_values=existing_values,
    )


def build_candidate_prompt(context: GenerationContext) -> str:
    """Serialize only the approved Agent and Tool fields used for generation."""
    payload = {
        "prompt_version": PROMPT_VERSION,
        "agent": {
            "id": context.agent_id,
            "name": context.agent_name,
            "description": context.agent_description,
            "revision_id": context.agent_revision_id,
            "revision": context.agent_revision,
            **context.agent_config,
        },
        "tools": [_tool_contract(tool) for tool in context.tools],
        "dataset_schema": [
            {
                "name": column.name,
                "kind": column.kind,
                "type": column.data_type,
                "required": column.required,
                "description": column.description,
            }
            for column in context.schema.columns
        ],
        "existing_primary_values": list(context.existing_values),
    }
    return (
        "Generate diverse evaluation cases for the exact Agent Revision and Tool contracts below. "
        "Use only enabled Tools. Respect input/output JSON schemas, permissions, test requirements, "
        "and verification requirements. Include happy-path, denial, boundary, and verification cases "
        "when the metadata requests them. Return a JSON object with a candidates array. Each candidate "
        "must contain input, expected_output, tool_id (when a Tool is expected), requirement, scenario, "
        "tags, and metadata. Do not invent schema fields or credentials.\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )


class DatasetCandidateService:
    def __init__(
        self,
        settings: Settings,
        repository: WorkbenchRepository,
        *,
        fallback_delay_seconds: float = 0.0,
        sleeper: Callable[[float], None] = time.sleep,
    ):
        self.settings = settings
        self.repository = repository
        self.fallback_delay_seconds = max(0.0, fallback_delay_seconds)
        self.sleeper = sleeper

    def generate(
        self,
        agent_id: str,
        cases: Sequence[TestCase],
        schema: DatasetSchema,
        progress: ProgressCallback | None = None,
    ) -> GeneratedBatch:
        notify = progress or (lambda _message: None)
        notify("Reading Agent Revision and Tool metadata")
        context = build_generation_context(self.repository, agent_id, cases, schema)
        _announce_generation_basis(context, notify)
        if self.settings.anthropic_enabled or self.settings.openai_enabled:
            notify("Requesting candidates from the configured LLM")
            try:
                return self._generate_real(context, notify)
            except Exception as error:
                reason = f"{type(error).__name__}; provider details are hidden"
                notify("Completing candidates from the verified Agent and Tool context")
                return self._generate_fallback(context, notify, reason)
        notify("Generating candidates from the verified Agent and Tool context")
        return self._generate_fallback(context, notify, "LLM not configured")

    def _generate_real(
        self, context: GenerationContext, notify: ProgressCallback
    ) -> GeneratedBatch:
        prompt = build_candidate_prompt(context)
        raw, response = generate_case_candidates_response(self.settings, prompt)
        notify("Validating generated cases against the Dataset schema")
        candidates, rejected = _normalize_candidates(
            raw,
            context,
            source="llm",
            mode="llm",
            provider=self.settings.llm_provider,
            model=response.model,
        )
        if not candidates and rejected:
            notify("Repairing invalid candidates once")
            repair = (
                prompt
                + "\n\nThe previous response was invalid for these reasons:\n- "
                + "\n- ".join(rejected[:8])
                + "\nReturn a corrected candidates array only."
            )
            raw, response = generate_case_candidates_response(self.settings, repair)
            candidates, rejected = _normalize_candidates(
                raw,
                context,
                source="llm",
                mode="llm",
                provider=self.settings.llm_provider,
                model=response.model,
            )
        if not candidates:
            raise ValueError("The provider returned no valid Dataset candidates")
        return GeneratedBatch(
            tuple(candidates),
            "llm",
            "llm",
            self.settings.llm_provider,
            response.model,
            rejected=tuple(rejected),
        )


    def _generate_fallback(
        self,
        context: GenerationContext,
        notify: ProgressCallback,
        reason: str,
    ) -> GeneratedBatch:
        if self.fallback_delay_seconds:
            notify("Generating grounded candidate variations")
            self.sleeper(self.fallback_delay_seconds)
        notify("Applying Agent and Tool metadata constraints")
        templates = _fallback_templates(context)
        candidates, rejected = _normalize_candidates(
            templates,
            context,
            source="demo-fallback",
            mode="fallback",
            provider="local",
            model="Authored metadata templates",
        )
        if not candidates:
            details = "; ".join(rejected[:3]) or "no compatible templates"
            raise ValueError(f"Demo fallback could not satisfy the Dataset schema: {details}")
        notify("Validating fallback cases against the Dataset schema")
        return GeneratedBatch(
            tuple(candidates),
            "demo-fallback",
            "fallback",
            "local",
            "Authored metadata templates",
            fallback_reason=reason,
            rejected=tuple(rejected),
        )


def _announce_generation_basis(
    context: GenerationContext,
    notify: ProgressCallback,
) -> None:
    """Expose the same safe, immutable context that grounds the generation prompt."""
    notify(
        "**Generation basis** · This Dataset is grounded in the current immutable "
        "Agent Revision and its enabled Tool metadata—not generated without context."
    )
    notify(
        f"**Agent** · {context.agent_name} · Revision R{context.agent_revision} · "
        f"`{context.agent_revision_id}`"
    )
    agent_tags = tuple(str(tag) for tag in context.agent_config.get("tags", ()))
    notify(f"**Agent tags** · {_tag_summary(agent_tags)}")
    agent_metadata = _mapping(context.agent_config.get("dataset_generation"))
    notify(f"**Agent metadata** · {_metadata_summary(agent_metadata)}")
    input_fields = ", ".join(
        f"{column.name}{'*' if column.required else ''}:{column.data_type}"
        for column in context.schema.input_columns
    ) or "none"
    output_fields = ", ".join(
        f"{column.name}{'*' if column.required else ''}:{column.data_type}"
        for column in context.schema.output_columns
    ) or "none"
    notify(
        f"**Dataset schema** · input [{input_fields}] · output [{output_fields}] · "
        f"existing draft values: {len(context.existing_values)}"
    )
    if not context.tools:
        notify("**Enabled Tools** · none; generation is grounded in Agent metadata only")
        return
    for index, tool in enumerate(context.tools, 1):
        tool_generation = _mapping(_mapping(tool.metadata).get("dataset_generation"))
        requirements = ", ".join(tool.test_requirements) or "Happy path"
        notify(
            f"**Tool {index}/{len(context.tools)}** · {tool.name} (`{tool.tool_id}`) · "
            f"tags: {_tag_summary(tool.tags)}"
        )
        notify(
            f"↳ **requirements** · {requirements} · **metadata** · "
            f"{_metadata_summary(tool_generation)}"
        )


def _tag_summary(tags: Sequence[Any]) -> str:
    return ", ".join(f"`{str(tag)[:60]}`" for tag in tags) or "none"


def _metadata_summary(metadata: Mapping[str, Any]) -> str:
    if not metadata:
        return "none"
    parts: list[str] = []
    for key, value in metadata.items():
        if key == "seed_cases" and isinstance(value, Sequence):
            parts.append(f"seed_cases={len(value)} authored templates")
            continue
        if isinstance(value, Mapping):
            rendered = ", ".join(str(item) for item in value.keys())
        elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
            values = [str(item) for item in value]
            rendered = ", ".join(values[:3])
            if len(values) > 3:
                rendered += f", +{len(values) - 3} more"
        else:
            rendered = str(value)
        parts.append(f"{key}={rendered[:180]}")
    return " · ".join(parts)


def _normalize_candidates(
    raw: Sequence[Mapping[str, Any]],
    context: GenerationContext,
    *,
    source: str,
    mode: str,
    provider: str,
    model: str,
) -> tuple[list[dict[str, Any]], list[str]]:
    tools = {
        alias.casefold(): tool
        for tool in context.tools
        for alias in (tool.tool_id, tool.name)
    }
    first_input = context.schema.input_columns[0] if context.schema.input_columns else None
    seen = {_dedupe_key(value) for value in context.existing_values}
    accepted: list[dict[str, Any]] = []
    rejected: list[str] = []
    for index, item in enumerate(raw, 1):
        if not isinstance(item, Mapping):
            rejected.append(f"Candidate {index}: expected a JSON object")
            continue
        raw_metadata = _mapping(item.get("metadata"))
        tool_ref = str(
            item.get("tool_id")
            or raw_metadata.get("tool_id")
            or _mapping(item.get("expected_output")).get("expected_tool_called")
            or ""
        ).strip()
        tool = tools.get(tool_ref.casefold()) if tool_ref else None
        if tool_ref and tool is None:
            rejected.append(f"Candidate {index}: unknown or disabled Tool '{tool_ref}'")
            continue
        if context.tools and tool is None:
            rejected.append(f"Candidate {index}: tool_id is required")
            continue
        raw_input = _mapping(item.get("input"))
        raw_expected = _mapping(item.get("expected_output"))
        input_values = {
            column.name: raw_input[column.name]
            for column in context.schema.input_columns
            if column.name in raw_input
        }
        expected_values = {
            column.name: raw_expected[column.name]
            for column in context.schema.output_columns
            if column.name in raw_expected
        }
        if tool is not None and any(
            column.name == "expected_tool_called" for column in context.schema.output_columns
        ):
            expected_values["expected_tool_called"] = tool.tool_id
        tags = [str(tag) for tag in item.get("tags", ())]
        tags.extend(("ai-generated" if mode == "llm" else "demo-fallback", f"agent:{context.agent_id}"))
        if tool is not None:
            tags.append(f"tool:{tool.tool_id}")
        scenario = str(item.get("scenario") or raw_metadata.get("scenario") or "generated")
        requirement = str(
            item.get("requirement") or raw_metadata.get("requirement") or "Generated coverage"
        )
        tags.append(f"scenario:{scenario}")
        metadata = {
            key: _plain(value)
            for key, value in raw_metadata.items()
            if key != "provenance"
        }
        metadata.update(
            {
                "tool_id": tool.tool_id if tool is not None else None,
                "tool_name": tool.name if tool is not None else None,
                "requirement": requirement,
                "scenario": scenario,
                "provenance": {
                    "generation_mode": mode,
                    "source": source,
                    "provider": provider,
                    "generation_model": model,
                    "prompt_version": PROMPT_VERSION,
                    "agent_id": context.agent_id,
                    "agent_revision_id": context.agent_revision_id,
                    "agent_revision": context.agent_revision,
                    "tool_id": tool.tool_id if tool is not None else None,
                    "tool_name": tool.name if tool is not None else None,
                    "requirement": requirement,
                },
            }
        )
        case_identity = json.dumps(
            {
                "agent_revision_id": context.agent_revision_id,
                "input": input_values,
                "expected_output": expected_values,
                "tool_id": tool.tool_id if tool is not None else None,
                "requirement": requirement,
            },
            ensure_ascii=False,
            sort_keys=True,
            default=str,
        )
        case = TestCase(
            case_id=f"generated-{hashlib.sha256(case_identity.encode('utf-8')).hexdigest()[:12]}",
            input=input_values,
            expected_output=expected_values,
            reference_answer=(
                str(item["reference_answer"])
                if item.get("reference_answer") is not None
                else None
            ),
            tags=tuple(dict.fromkeys(tags)),
            source=source,
            metadata=metadata,
        )
        errors = context.schema.validate_case(case)
        if errors:
            rejected.append(f"Candidate {index}: {'; '.join(errors)}")
            continue
        if first_input is not None:
            value = _dedupe_key(str(case.input.get(first_input.name, "")))
            if value and value in seen:
                rejected.append(f"Candidate {index}: duplicate {first_input.name}")
                continue
            if value:
                seen.add(value)
        accepted.append(
            {
                "case_id": case.case_id,
                "input": dict(case.input),
                "expected_output": dict(case.expected_output),
                "reference_answer": case.reference_answer,
                "tags": list(case.tags),
                "metadata": _plain(case.metadata),
            }
        )
    return accepted, rejected


def _fallback_templates(context: GenerationContext) -> list[dict[str, Any]]:
    generation = _mapping(context.agent_config.get("dataset_generation"))
    authored = generation.get("seed_cases", ())
    templates: list[dict[str, Any]] = []
    if isinstance(authored, Sequence) and not isinstance(authored, (str, bytes)):
        templates.extend(_plain(item) for item in authored if isinstance(item, Mapping))

    # Authored seed cases are useful on an empty Dataset, but may all already be
    # present on subsequent Generate clicks. Always add metadata-derived variants
    # and make their primary input unique against the current draft.
    used_primary_values = {_dedupe_key(value) for value in context.existing_values}
    for tool in context.tools:
        metadata = _mapping(tool.metadata)
        tool_generation = _mapping(metadata.get("dataset_generation"))
        examples = tuple(str(value) for value in tool_generation.get("usage_examples", ()))
        requirements = tool.test_requirements or ("Happy path",)
        for index, requirement in enumerate(requirements):
            query = examples[index % len(examples)] if examples else f"Verify {tool.name}: {requirement}"
            query = _unique_fallback_value(
                query,
                f"Verify {tool.name}: {requirement}",
                used_primary_values,
            )
            templates.append(
                _generic_template(context.schema, tool, requirement, query)
            )
    if not context.tools:
        query = _unique_fallback_value(
            f"Evaluate {context.agent_name}",
            f"Evaluate {context.agent_name}",
            used_primary_values,
        )
        templates.append(_generic_template(context.schema, None, "Default behavior", query))
    return templates


def _unique_fallback_value(
    preferred: str,
    alternate: str,
    used_values: set[str],
) -> str:
    candidate = preferred.strip() or alternate
    if _dedupe_key(candidate) in used_values:
        candidate = alternate
    base = candidate
    suffix = 2
    while _dedupe_key(candidate) in used_values:
        candidate = f"{base} · variant {suffix}"
        suffix += 1
    used_values.add(_dedupe_key(candidate))
    return candidate


def _dedupe_key(value: str) -> str:
    """Treat punctuation and spacing-only changes as the same primary input."""
    return re.sub(r"\W+", "", value.casefold(), flags=re.UNICODE)


def _generic_template(
    schema: DatasetSchema,
    tool: ToolBinding | None,
    requirement: str,
    query: str,
) -> dict[str, Any]:
    input_values = {
        column.name: _fallback_value(column, tool, requirement, query)
        for column in schema.input_columns
        if column.required or column.name == "query"
    }
    expected_values = {
        column.name: _fallback_value(column, tool, requirement, query)
        for column in schema.output_columns
        if column.required or column.name == "expected_tool_called"
    }
    return {
        "input": input_values,
        "expected_output": expected_values,
        "tool_id": tool.tool_id if tool is not None else None,
        "requirement": requirement,
        "scenario": "authored-fallback",
        "tags": ["authored-template", *(tool.tags if tool is not None else ())],
        "metadata": {"template": "tool-requirement"},
    }


def _fallback_value(
    column: DatasetColumn,
    tool: ToolBinding | None,
    requirement: str,
    query: str,
) -> Any:
    if column.name == "query":
        return query
    if column.name == "expected_action":
        return f"Use {tool.name} for {requirement}" if tool is not None else requirement
    if column.name == "expected_tool_called":
        return tool.tool_id if tool is not None else ""
    if column.name in {"header", "headers"} and column.data_type == "json":
        permission = dict(tool.permission) if tool is not None else {}
        role = permission.get("required_role")
        return {"user_role": role} if role else {}
    if column.kind == "input" and column.data_type == "string":
        return query
    return {"string": requirement, "number": 0, "boolean": False, "json": {}}[
        column.data_type
    ]


def _tool_contract(tool: ToolBinding) -> dict[str, Any]:
    metadata = _mapping(tool.metadata)
    return {
        "id": tool.tool_id,
        "name": tool.name,
        "description": tool.description,
        "connection_type": tool.connection_type,
        "input_schema": _plain(tool.input_schema),
        "output_schema": _plain(tool.output_schema),
        "permission": _plain(tool.permission),
        "test_requirements": list(tool.test_requirements),
        "verification_required": tool.verification_required,
        "tags": list(tool.tags),
        "dataset_generation": _plain(_mapping(metadata.get("dataset_generation"))),
    }


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _plain(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _plain(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_plain(item) for item in value]
    return value
