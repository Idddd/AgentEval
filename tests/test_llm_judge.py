import pytest

from src.backends.local_backend import LocalJsonStore, LocalTracer
from src.llm_gateway import LlmResponse, LlmUsage, ObservedLlmGateway
from src.llm_judge import JudgeIncompleteError, LlmJudge
from src.workbench_models import TestCase as WorkbenchTestCase


class SequenceGateway:
    model = "judge-model"

    def __init__(self, texts):
        self.texts = iter(texts)

    def complete(self, system, messages, max_tokens, json_mode=False):
        return LlmResponse(next(self.texts), self.model, "end_turn", LlmUsage())


def case():
    return WorkbenchTestCase("case-1", {"query": "What happened?"},
                             {"expected_tool_called": None}, reference_answer="A concise answer")


def test_judge_returns_fixed_dimensions(tmp_path):
    gateway = SequenceGateway([
        '{"scores":{"correctness":4,"relevance":5,"completeness":4,"safety":4},'
        '"reasons":{"correctness":"Accurate","relevance":"Direct",'
        '"completeness":"Complete","safety":"Safe"},"summary":"Pass"}'
    ])

    result = LlmJudge(gateway, LocalTracer(tmp_path / "traces.jsonl")).evaluate(
        case(), "answer", (), {"execution_correctness": 1.0})

    assert tuple(result.scores) == ("correctness", "relevance", "completeness", "safety")
    assert result.passed is True
    assert result.usage_cost.category == "judge"


def test_judge_repairs_once_then_marks_incomplete(tmp_path):
    gateway = SequenceGateway(["not-json", "still-not-json"])

    with pytest.raises(JudgeIncompleteError, match="invalid judge response after one repair"):
        LlmJudge(gateway, LocalTracer(tmp_path / "traces.jsonl")).evaluate(case(), "answer", (), {})


def test_judge_rejects_boolean_and_extra_dimensions_then_repairs(tmp_path):
    gateway = SequenceGateway([
        '{"scores":{"correctness":true,"relevance":5,"completeness":4,"safety":4,"style":3},'
        '"reasons":{"correctness":"x","relevance":"x","completeness":"x","safety":"x"},'
        '"summary":"x"}',
        '{"scores":{"correctness":5,"relevance":5,"completeness":4,"safety":5},'
        '"reasons":{"correctness":"Accurate","relevance":"Direct",'
        '"completeness":"Enough","safety":"Safe"},"summary":"Pass"}',
    ])

    result = LlmJudge(gateway, LocalTracer(tmp_path / "traces.jsonl")).evaluate(case(), "answer", (), {})

    assert result.scores["correctness"] == 5


def test_judge_persists_evaluator_observation_and_usage(tmp_path):
    tracer = LocalTracer(tmp_path / "traces.jsonl")
    gateway = SequenceGateway([
        '{"scores":{"correctness":4,"relevance":4,"completeness":4,"safety":4},'
        '"reasons":{"correctness":"Accurate","relevance":"Direct",'
        '"completeness":"Enough","safety":"Safe"},"summary":"Pass"}'
    ])
    gateway.complete = lambda *args, **kwargs: LlmResponse(
        gateway.texts.__next__(), gateway.model, "end_turn", LlmUsage(10, 3, 2, 1, 0.02)
    )

    result = LlmJudge(gateway, tracer).evaluate(case(), "answer", (), {})

    trace = LocalJsonStore(tmp_path).get_trace(result.trace_id)
    evaluator = trace.find_span("score-response")
    assert evaluator.observation_type == "evaluator"
    assert result.observation_id == evaluator.id
    assert result.usage_cost.cost_usd == 0.02


def test_observed_judge_generation_is_nested_under_evaluator(tmp_path):
    tracer = LocalTracer(tmp_path / "traces.jsonl")
    provider = SequenceGateway([
        '{"scores":{"correctness":4,"relevance":4,"completeness":4,"safety":4},'
        '"reasons":{"correctness":"Accurate","relevance":"Direct",'
        '"completeness":"Enough","safety":"Safe"},"summary":"Pass"}'
    ])

    result = LlmJudge(ObservedLlmGateway(provider, tracer, category="judge"), tracer).evaluate(
        case(), "answer", (), {},
    )

    trace = LocalJsonStore(tmp_path).get_trace(result.trace_id)
    evaluator = trace.find_span("score-response")
    generation = trace.find_span("judge-generation")
    assert generation.parent_id == evaluator.id
    assert generation.observation_type == "generation"


def test_judge_returns_rubric_scores_in_fixed_order(tmp_path):
    gateway = SequenceGateway([
        '{"scores":{"safety":4,"completeness":4,"relevance":4,"correctness":4},'
        '"reasons":{"safety":"Safe","completeness":"Enough",'
        '"relevance":"Direct","correctness":"Accurate"},"summary":"Pass"}'
    ])

    result = LlmJudge(gateway, LocalTracer(tmp_path / "traces.jsonl")).evaluate(case(), "answer", (), {})

    assert tuple(result.scores) == ("correctness", "relevance", "completeness", "safety")


def test_judge_prompt_redacts_secret_like_input_fields(tmp_path):
    class CapturingGateway(SequenceGateway):
        def __init__(self):
            super().__init__([
                '{"scores":{"correctness":4,"relevance":4,"completeness":4,"safety":4},'
                '"reasons":{"correctness":"Accurate","relevance":"Direct",'
                '"completeness":"Enough","safety":"Safe"},"summary":"Pass"}'
            ])
            self.messages = None

        def complete(self, system, messages, max_tokens, json_mode=False):
            self.messages = messages
            return super().complete(system, messages, max_tokens, json_mode)

    gateway = CapturingGateway()
    secret_case = WorkbenchTestCase(
        "case-secret", {"query": "What happened?", "authorization": "Bearer should-not-leak"}, {},
    )

    LlmJudge(gateway, LocalTracer(tmp_path / "traces.jsonl")).evaluate(secret_case, "answer", (), {})

    assert "should-not-leak" not in gateway.messages[0]["content"]
    assert '"authorization": "[REDACTED]"' in gateway.messages[0]["content"]
