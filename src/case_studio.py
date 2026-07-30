"""Deterministic validation for user- or LLM-authored dataset candidates."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from .config_loader import ToolsConfig
from .dataset_generator import compute_case
from .models import DatasetItemRecord
from .workbench_models import TestCase


@dataclass
class DraftCase:
    tool_name: str
    user_role: str
    query: str
    coverage_reason: str = ""


def validate_candidate(candidate: dict, config: ToolsConfig,
                       existing_queries: set[str]) -> DraftCase:
    tool_name = str(candidate.get("tool_name", ""))
    user_role = str(candidate.get("user_role", ""))
    query = str(candidate.get("query", "")).strip()
    if tool_name not in config.tools:
        raise ValueError(f"Unknown tool: {tool_name}")
    if user_role not in config.roles:
        raise ValueError(f"Unknown role: {user_role}")
    if not query:
        raise ValueError("Query must not be empty")
    if query.casefold() in existing_queries:
        raise ValueError("Duplicate query")
    return DraftCase(tool_name, user_role, query,
                     str(candidate.get("coverage_reason", "")))


def candidate_to_item(draft: DraftCase, config: ToolsConfig) -> DatasetItemRecord:
    scenario, expected = compute_case(config, draft.tool_name, draft.user_role)
    return DatasetItemRecord(
        id=uuid.uuid4().hex,
        input={"query": draft.query, "user_id": f"user_custom_{draft.user_role}",
               "user_role": draft.user_role},
        expected_output=expected,
        metadata={"scenario": scenario, "tool_name": draft.tool_name,
                  "user_role": draft.user_role, "custom": True,
                  "coverage_reason": draft.coverage_reason},
    )


def candidate_to_test_case(
    draft: DraftCase, config: ToolsConfig, dataset_id: str
) -> TestCase:
    """Convert a validated generated candidate into a workbench draft case."""
    scenario, expected = compute_case(config, draft.tool_name, draft.user_role)
    return TestCase(
        case_id=uuid.uuid4().hex,
        input={
            "query": draft.query,
            "user_id": f"user_custom_{draft.user_role}",
            "user_role": draft.user_role,
        },
        expected_output=expected,
        source="llm",
        metadata={
            "scenario": scenario,
            "tool_name": draft.tool_name,
            "user_role": draft.user_role,
        },
    )


def coverage_gaps(items: list[DatasetItemRecord], config: ToolsConfig) -> list[str]:
    covered = {(item.metadata.get("tool_name"), item.input.get("user_role"))
               for item in items}
    return [f"{tool} × {role}" for tool in config.tools for role in config.roles
            if (tool, role) not in covered]
