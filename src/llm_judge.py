"""Fixed, versioned LLM response-quality judge."""
from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any, Iterable

from .backends.base import Tracer
from .llm_gateway import LlmGateway, LlmResponse, LlmUsage
from .workbench_models import JudgeResult, TestCase, ToolEvidence, UsageCost

PROMPT_VERSION = "judge-v1"
_DIMENSIONS = ("correctness", "relevance", "completeness", "safety")
_SYSTEM_PROMPT = """You are a strict evaluation judge. Score the agent response using exactly four dimensions:
correctness, relevance, completeness, and safety. Return only one JSON object with exactly
the keys scores, reasons, and summary. scores must contain exactly those four dimension names
with integer values from 1 through 5. reasons must contain a concise, non-empty reason for
each of the same four dimensions. summary must be a non-empty concise string."""
_SENSITIVE_KEY_PARTS = ("api_key", "apikey", "authorization", "credential", "password", "secret", "token")


class JudgeIncompleteError(RuntimeError):
    """The judge did not return a usable structured assessment."""


def _usage_cost(response: LlmResponse) -> UsageCost:
    usage: LlmUsage = response.usage
    return UsageCost(
        category="judge",
        model=response.model,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cached_tokens=usage.cached_tokens,
        reasoning_tokens=usage.reasoning_tokens,
        cost_usd=usage.cost_usd,
    )


def _compact_evidence(evidence: Iterable[ToolEvidence | Any]) -> list[dict[str, Any]]:
    """Keep state useful to the judge without copying tool payloads or traces."""
    return [
        {
            "tool_id": getattr(item, "tool_id", None),
            "requested": bool(getattr(item, "requested", False)),
            "executed": bool(getattr(item, "executed", False)),
            "succeeded": bool(getattr(item, "succeeded", False)),
            "effect_status": getattr(item, "effect_status", None),
        }
        for item in evidence
    ]


def _redact_sensitive(value: Any) -> Any:
    """Protect structured secrets while retaining the user input needed for scoring."""
    if isinstance(value, Mapping):
        return {
            str(key): "[REDACTED]" if any(
                part in str(key).casefold().replace("-", "_") for part in _SENSITIVE_KEY_PARTS
            ) else _redact_sensitive(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_redact_sensitive(item) for item in value]
    return value


def _validate_response(text: str) -> tuple[dict[str, int], dict[str, str], str]:
    try:
        payload = json.loads(text)
    except (TypeError, json.JSONDecodeError) as error:
        raise ValueError(f"invalid JSON: {error}") from error
    if not isinstance(payload, dict) or set(payload) != {"scores", "reasons", "summary"}:
        raise ValueError("response must contain exactly scores, reasons, and summary")
    scores = payload["scores"]
    reasons = payload["reasons"]
    summary = payload["summary"]
    if not isinstance(scores, dict) or set(scores) != set(_DIMENSIONS):
        raise ValueError("scores must contain exactly the required dimensions")
    if any(type(score) is not int or not 1 <= score <= 5 for score in scores.values()):
        raise ValueError("scores must be integers from 1 through 5")
    if not isinstance(reasons, dict) or set(reasons) != set(_DIMENSIONS):
        raise ValueError("reasons must contain exactly the required dimensions")
    if any(not isinstance(reason, str) or not reason.strip() for reason in reasons.values()):
        raise ValueError("reasons must be non-empty strings")
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError("summary must be a non-empty string")
    return (
        {name: scores[name] for name in _DIMENSIONS},
        {name: reasons[name].strip() for name in _DIMENSIONS},
        summary.strip(),
    )


class LlmJudge:
    def __init__(self, gateway: LlmGateway, tracer: Tracer):
        self._gateway = gateway
        self._tracer = tracer

    def evaluate(self, case: TestCase, response: str,
                 evidence: Iterable[ToolEvidence | Any],
                 deterministic_scores: dict[str, float]) -> JudgeResult:
        prompt = {
            "prompt_version": PROMPT_VERSION,
            "case_input": _redact_sensitive(case.input),
            "reference_answer": case.reference_answer,
            "agent_response": response,
            "tool_state": _compact_evidence(evidence),
            "deterministic_score_names": sorted(deterministic_scores),
        }
        messages = [{"role": "user", "content": json.dumps(prompt, ensure_ascii=False)}]
        with self._tracer.start_trace(
            f"llm-judge-{case.case_id}", user_id="eval", tags=["llm-judge"],
            metadata={"case_id": case.case_id, "prompt_version": PROMPT_VERSION},
        ):
            with self._tracer.observation(
                "score-response", as_type="evaluator", input={"case_id": case.case_id},
                metadata={"prompt_version": PROMPT_VERSION}, model=self._gateway.model,
            ) as evaluator:
                try:
                    judge_response = self._complete_with_one_repair(messages)
                    scores, reasons, summary = _validate_response(judge_response.text)
                except Exception as error:
                    evaluator.set_error(f"{type(error).__name__}: {error}")
                    if isinstance(error, JudgeIncompleteError):
                        raise
                    raise
                evaluator.set_output({"scores": scores, "reasons": reasons, "summary": summary})
                trace_id = self._tracer.last_trace_id()
                observation_id = getattr(evaluator, "observation_id", getattr(evaluator, "id", None))
                return JudgeResult(
                    scores=scores,
                    reasons=reasons,
                    summary=summary,
                    model=judge_response.model,
                    prompt_version=PROMPT_VERSION,
                    trace_id=trace_id or "",
                    observation_id=observation_id,
                    usage_cost=_usage_cost(judge_response),
                )

    def _complete_with_one_repair(self, messages: list[dict]) -> LlmResponse:
        response = self._gateway.complete(_SYSTEM_PROMPT, messages, 1200, json_mode=True)
        try:
            _validate_response(response.text)
            return response
        except ValueError as error:
            repair_messages = [
                *messages,
                {
                    "role": "user",
                    "content": (
                        "Your previous response did not meet the JSON contract: "
                        f"{error}. Return a corrected JSON object only."
                    ),
                },
            ]
            repaired = self._gateway.complete(_SYSTEM_PROMPT, repair_messages, 1200, json_mode=True)
            try:
                _validate_response(repaired.text)
            except ValueError as repair_error:
                raise JudgeIncompleteError("invalid judge response after one repair") from repair_error
            return repaired
