from src.dataset_generation import (
    DatasetCandidateService,
    build_candidate_prompt,
    build_generation_context,
)
from src.dataset_registry import DatasetRegistry
from src.demo_workspace import seed_demo_workspace
from src.llm_gateway import LlmResponse, LlmUsage
from src.report_service import ReportService
from src.settings import Settings
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.workbench_models import DEFAULT_DATASET_SCHEMA, ToolBinding
from src.workbench_models import TestCase as WorkbenchCase


def _workspace(tmp_path):
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repository.create_agent("Support Agent", "Answers account questions safely")
    tool = ToolBinding(
        "account-lookup",
        "AccountLookupTool",
        "Read account state",
        "http",
        {"endpoint": "https://private.example.test", "api_key": "env:ACCOUNT_KEY"},
        {"type": "object", "required": ["account_id"]},
        {"type": "object"},
        {"required_role": "support", "sensitivity": "high"},
        ("Allow support role", "Deny guest role"),
        False,
        True,
        tags=("account", "role-gated"),
        metadata={
            "dataset_generation": {
                "usage_examples": ("Look up account A-42", "Deny a guest lookup for A-42")
            }
        },
    )
    revision = repository.create_agent_revision(
        agent.agent_id,
        {
            "model": "support-v2",
            "prompt": "Always enforce the support role",
            "tags": ("support", "safe"),
            "metadata": {
                "dataset_generation": {
                    "objectives": ("permission boundary",),
                    "roles": ("support", "guest"),
                }
            },
        },
        (tool,),
    )
    return repository, agent, revision


def test_prompt_uses_current_revision_and_safe_tool_contract_without_adapter_secrets(tmp_path):
    repository, agent, revision = _workspace(tmp_path)
    context = build_generation_context(repository, agent.agent_id, (), DEFAULT_DATASET_SCHEMA)
    prompt = build_candidate_prompt(context)

    assert revision.revision_id in prompt
    assert "AccountLookupTool" in prompt
    assert "Deny guest role" in prompt
    assert "permission boundary" in prompt
    assert "required_role" in prompt
    assert "private.example.test" not in prompt
    assert "ACCOUNT_KEY" not in prompt
    assert "adapter_config" not in prompt


def test_unconfigured_generation_uses_authored_fallback_delay_and_trusted_provenance(tmp_path):
    repository, agent, revision = _workspace(tmp_path)
    delays = []
    service = DatasetCandidateService(
        Settings(),
        repository,
        fallback_delay_seconds=1.25,
        sleeper=delays.append,
    )
    progress = []

    batch = service.generate(
        agent.agent_id, (), DEFAULT_DATASET_SCHEMA, progress.append
    )

    assert delays == [1.25]
    assert batch.mode == "fallback"
    assert batch.source == "demo-fallback"
    assert batch.fallback_reason == "LLM not configured"
    assert len(batch.candidates) == 2
    progress_text = "\n".join(progress)
    assert "Generation basis" in progress_text
    assert "Support Agent" in progress_text
    assert "Agent tags" in progress_text
    assert "Tool 1/1" in progress_text
    assert "AccountLookupTool" in progress_text
    assert "Allow support role" in progress_text
    assert "usage_examples" in progress_text
    assert "Dataset schema" in progress_text
    assert "private.example.test" not in progress_text
    assert "ACCOUNT_KEY" not in progress_text
    for candidate in batch.candidates:
        assert candidate["input"]["query"]
        assert candidate["expected_output"]["expected_action"]
        provenance = candidate["metadata"]["provenance"]
        assert provenance["agent_revision_id"] == revision.revision_id
        assert provenance["tool_id"] == "account-lookup"
        assert provenance["generation_mode"] == "fallback"


def test_llm_candidates_are_schema_checked_and_cannot_spoof_provenance(tmp_path, monkeypatch):
    repository, agent, revision = _workspace(tmp_path)
    settings = Settings(
        llm_provider="openai",
        openai_api_key="secret",
        openai_enabled=True,
        openai_model="test-model",
    )

    def generated(_settings, prompt):
        assert "AccountLookupTool" in prompt
        return (
            [
                {
                    "case_id": "allowed",
                    "input": {"query": "Look up A-99", "invented": "discard me"},
                    "expected_output": {"expected_action": "Return the account state"},
                    "tool_id": "AccountLookupTool",
                    "requirement": "Allow support role",
                    "scenario": "authorized",
                    "tags": ["happy-path"],
                    "metadata": {
                        "provenance": {"agent_revision_id": "spoofed", "provider": "spoofed"}
                    },
                },
                {
                    "input": {"query": "Invent a tool"},
                    "expected_output": {"expected_action": "bad"},
                    "tool_id": "UnknownTool",
                },
            ],
            LlmResponse("{}", "served-model", "stop", LlmUsage()),
        )

    monkeypatch.setattr("src.dataset_generation.generate_case_candidates_response", generated)
    batch = DatasetCandidateService(settings, repository).generate(
        agent.agent_id, (), DEFAULT_DATASET_SCHEMA
    )

    assert batch.mode == "llm"
    assert len(batch.candidates) == 1
    assert len(batch.rejected) == 1
    candidate = batch.candidates[0]
    assert "invented" not in candidate["input"]
    provenance = candidate["metadata"]["provenance"]
    assert provenance["agent_revision_id"] == revision.revision_id
    assert provenance["provider"] == "openai"
    assert provenance["generation_model"] == "served-model"


def test_provider_failure_degrades_without_leaking_error_details(tmp_path, monkeypatch):
    repository, agent, _revision = _workspace(tmp_path)
    settings = Settings(
        llm_provider="openai",
        openai_api_key="secret",
        openai_enabled=True,
    )

    def fail(_settings, _prompt):
        raise RuntimeError("https://provider.invalid?token=super-secret")

    monkeypatch.setattr("src.dataset_generation.generate_case_candidates_response", fail)
    batch = DatasetCandidateService(settings, repository).generate(
        agent.agent_id, (), DEFAULT_DATASET_SCHEMA
    )

    assert batch.mode == "fallback"
    assert batch.fallback_reason == "RuntimeError; provider details are hidden"
    assert "super-secret" not in batch.fallback_reason


def test_repeated_fallback_generation_creates_new_metadata_variants(tmp_path):
    repository, agent, _revision = _workspace(tmp_path)
    service = DatasetCandidateService(Settings(), repository)
    first = service.generate(agent.agent_id, (), DEFAULT_DATASET_SCHEMA)
    existing = tuple(
        WorkbenchCase(
            item["case_id"],
            item["input"],
            item["expected_output"],
            tags=tuple(item["tags"]),
            source=first.source,
            metadata=item["metadata"],
        )
        for item in first.candidates
    )

    second = service.generate(agent.agent_id, existing, DEFAULT_DATASET_SCHEMA)

    first_queries = {item["input"]["query"].casefold() for item in first.candidates}
    second_queries = {item["input"]["query"].casefold() for item in second.candidates}
    assert second.candidates
    assert first_queries.isdisjoint(second_queries)


def test_generated_candidates_append_to_demo_cases_with_repeated_queries(tmp_path):
    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    reports = ReportService(repository, tmp_path / "reports")
    seed = seed_demo_workspace(repository, reports, tmp_path / "traces.jsonl")
    registry = DatasetRegistry(repository)
    existing = registry.list_draft(seed.dataset_id)
    batch = DatasetCandidateService(Settings(), repository).generate(
        seed.agent_id, existing, DEFAULT_DATASET_SCHEMA
    )
    candidates = [
        WorkbenchCase(
            item["case_id"],
            item["input"],
            item["expected_output"],
            tags=tuple(item["tags"]),
            source=batch.source,
            metadata=item["metadata"],
        )
        for item in batch.candidates
    ]

    registry.add_cases(seed.dataset_id, candidates)

    assert len(registry.list_draft(seed.dataset_id)) == len(existing) + len(candidates)
