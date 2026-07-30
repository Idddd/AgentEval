from src.report_compare import compare_report_summaries


def test_comparison_uses_shared_cases_and_lists_coverage_changes():
    baseline = {
        "identity": {"dataset": {"revision": 1}},
        "cases": [
            {"case_id": "case-a", "status": "PASS"},
            {"case_id": "case-b", "status": "FAIL"},
        ],
        "judge_dimensions": {"correctness": 4.0},
        "tool_funnel": {"executed": 1},
        "costs": {"evaluation_total": 0.03},
        "tokens": {"agent_input_tokens": 20},
    }
    current = {
        "identity": {"dataset": {"revision": 2}},
        "cases": [
            {"case_id": "case-a", "status": "PASS"},
            {"case_id": "case-b", "status": "PASS"},
            {"case_id": "case-c", "status": "FAIL"},
        ],
        "judge_dimensions": {"correctness": 4.5},
        "tool_funnel": {"executed": 2},
        "costs": {"evaluation_total": 0.02},
        "tokens": {"agent_input_tokens": 25, "judge_input_tokens": 8},
    }

    comparison = compare_report_summaries(
        "report-1", baseline, {"model": "m1"},
        "report-2", current, {"model": "m2"},
    )

    assert comparison.shared_case_ids == ("case-a", "case-b")
    assert comparison.added_case_ids == ("case-c",)
    assert comparison.removed_case_ids == ()
    assert comparison.pass_rate_delta_shared == 50.0
    assert comparison.resolved_failure_ids == ("case-b",)
    assert comparison.regression_ids == ()
    assert comparison.different_dataset_revisions is True
    assert comparison.agent_changes["model"] == {"before": "m1", "after": "m2"}
    assert comparison.judge_deltas == {"correctness": 0.5}
    assert comparison.tool_state_deltas == {"executed": 1}
    assert comparison.cost_delta_usd == -0.009999999999999998
    assert comparison.token_deltas == {
        "agent_input_tokens": 5,
        "judge_input_tokens": 8,
    }


def test_comparison_with_no_shared_cases_never_divides_by_zero():
    baseline = {
        "identity": {"dataset": {"revision": 1}},
        "cases": [{"case_id": "old", "status": "FAIL"}],
        "costs": {"evaluation_total": 0.0},
    }
    current = {
        "identity": {"dataset": {"revision": 1}},
        "cases": [{"case_id": "new", "status": "PASS"}],
        "costs": {"evaluation_total": 0.0},
    }

    comparison = compare_report_summaries("old-report", baseline, {}, "new-report", current, {})

    assert comparison.shared_case_ids == ()
    assert comparison.pass_rate_delta_shared == 0.0
    assert comparison.added_case_ids == ("new",)
    assert comparison.removed_case_ids == ("old",)
