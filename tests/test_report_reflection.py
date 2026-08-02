from src.workbench_models import AgentRevision, ReportSnapshot


def _report() -> ReportSnapshot:
    return ReportSnapshot(
        "report-1",
        "run-1",
        1,
        "NEEDS ATTENTION",
        {
            "status": "NEEDS ATTENTION",
            "metrics": {"pass_rate": 50.0},
            "failures": [{"case_id": "case-b", "deterministic_reasons": {"execution": "Wrong tool"}}],
            "judge_dimensions": {"correctness": 3.0, "relevance": 4.0},
            "tool_funnel": {"requested": 2, "executed": 2, "succeeded": 1, "verified": 1},
        },
        "report.md",
        "2026-08-03T00:00:00+00:00",
    )


def _revision() -> AgentRevision:
    return AgentRevision(
        "revision-1",
        "agent-1",
        2,
        {"model": "m1", "prompt": "Answer accurately", "model_parameters": {"temperature": 0.7}},
        (),
        "2026-08-03T00:00:00+00:00",
    )


def test_rule_reflector_emits_structured_target_patches_from_report_evidence():
    """Dropping any evidence branch must remove a required actionable suggestion."""
    from src.report_reflection import RuleBasedReportReflector

    suggestions = RuleBasedReportReflector().reflect(_report(), _revision())

    assert [item.suggestion_id for item in suggestions] == [
        "prompt-failures",
        "model-determinism",
        "tool-evidence-policy",
    ]
    assert [item.area for item in suggestions] == ["Prompt", "Model", "Policy"]
    assert suggestions[0].patch_key == "prompt"
    assert suggestions[1].patch_value == {"temperature": 0}
    assert suggestions[2].patch_value == {"require_tool_evidence": True}


def test_apply_suggestions_changes_only_accepted_keys_without_mutating_source():
    """Unaccepted suggestions must never leak into the new Target Revision."""
    from src.report_reflection import RuleBasedReportReflector, apply_suggestions

    source = dict(_revision().config_snapshot)
    suggestions = RuleBasedReportReflector().reflect(_report(), _revision())
    updated = apply_suggestions(source, (suggestions[0], suggestions[2]))

    assert updated["model"] == "m1"
    assert updated["model_parameters"] == {"temperature": 0.7}
    assert updated["policy"] == {"require_tool_evidence": True}
    assert "Review failed evaluation cases" in updated["prompt"]
    assert "policy" not in source


def test_prompt_suggestion_updates_existing_system_prompt_without_duplicate_key():
    """Legacy Target snapshots must keep their canonical prompt field unambiguous."""
    from src.report_reflection import RuleBasedReportReflector, apply_suggestions

    revision = AgentRevision(
        "revision-legacy",
        "agent-1",
        1,
        {"model": "m1", "system_prompt": "Use the tools carefully"},
        (),
        "2026-08-03T00:00:00+00:00",
    )
    suggestion = RuleBasedReportReflector().reflect(_report(), revision)[0]
    updated = apply_suggestions(revision.config_snapshot, (suggestion,))

    assert suggestion.patch_key == "system_prompt"
    assert "Review failed evaluation cases" in updated["system_prompt"]
    assert "prompt" not in updated


def test_passing_report_has_no_target_changes():
    """A clean Report must not invent configuration work merely to fill Analysis."""
    from src.report_reflection import RuleBasedReportReflector

    report = _report()
    clean = ReportSnapshot(
        report.report_id,
        report.run_id,
        report.artifact_version,
        "PASS",
        {"status": "PASS", "metrics": {"pass_rate": 100.0}, "failures": [], "tool_funnel": {}},
        report.markdown_path,
        report.created_at,
    )

    assert RuleBasedReportReflector().reflect(clean, _revision()) == ()


def test_create_reflected_revision_applies_accepted_patch_and_preserves_tools(tmp_path):
    """Submit must create a new immutable Revision without dropping Tool bindings."""
    from src.report_reflection import create_reflected_revision
    from src.sqlite_workbench import SQLiteWorkbenchRepository
    from src.workbench_models import RunStatus, TestCase, ToolBinding

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    agent = repository.create_agent("Target", "")
    tool = ToolBinding("lookup", "Lookup", "", "mock", {}, {}, {}, {}, (), False, True)
    revision = repository.create_agent_revision(
        agent.agent_id,
        {"model": "m1", "prompt": "Answer accurately", "model_parameters": {"temperature": 0.7}},
        (tool,),
    )
    dataset_id = repository.create_dataset(agent.agent_id, "Dataset")
    repository.replace_draft_cases(dataset_id, [TestCase("case", {"query": "Q"}, {"expected_action": "A"})])
    dataset = repository.publish_dataset(dataset_id)
    run = repository.finish_run(
        repository.create_run(revision.revision_id, dataset.revision_id).run_id,
        RunStatus.COMPLETED,
    )
    report = repository.save_report(run.run_id, "NEEDS ATTENTION", dict(_report().summary), tmp_path / "report.md")

    created = create_reflected_revision(
        repository, agent.agent_id, report.report_id, ("prompt-failures",)
    )

    assert created.revision == 2
    assert "Review failed evaluation cases" in created.config_snapshot["prompt"]
    assert created.config_snapshot["model_parameters"] == {"temperature": 0.7}
    assert created.tools == (tool,)
    assert repository.get_agent_revision(revision.revision_id).config_snapshot["prompt"] == "Answer accurately"


def test_create_reflected_revision_rejects_mismatched_target_context(tmp_path):
    """A Report from another Target must never patch the active Target."""
    import pytest
    from src.report_reflection import create_reflected_revision
    from src.sqlite_workbench import SQLiteWorkbenchRepository
    from src.workbench_models import RunStatus, TestCase

    repository = SQLiteWorkbenchRepository(tmp_path / "workbench.db")
    owner = repository.create_agent("Owner", "")
    owner_revision = repository.create_agent_revision(owner.agent_id, {"model": "m1"}, ())
    other = repository.create_agent("Other", "")
    repository.create_agent_revision(other.agent_id, {"model": "m1"}, ())
    dataset_id = repository.create_dataset(owner.agent_id, "Dataset")
    repository.replace_draft_cases(dataset_id, [TestCase("case", {"query": "Q"}, {"expected_action": "A"})])
    dataset = repository.publish_dataset(dataset_id)
    run = repository.finish_run(
        repository.create_run(owner_revision.revision_id, dataset.revision_id).run_id,
        RunStatus.COMPLETED,
    )
    report = repository.save_report(run.run_id, "NEEDS ATTENTION", dict(_report().summary), tmp_path / "report.md")

    with pytest.raises(ValueError, match="does not belong"):
        create_reflected_revision(repository, other.agent_id, report.report_id, ("prompt-failures",))
