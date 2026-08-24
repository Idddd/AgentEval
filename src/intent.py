"""Intent analysis: identify which tool a user query should trigger.

Three implementations (priority order):
- AnthropicIntentAnalyzer: Anthropic-compatible endpoint (e.g. DeepSeek)
- LlmIntentAnalyzer: OpenAI
- RuleIntentAnalyzer: keyword matching (always the last-resort fallback;
  the dataset generator guarantees every query contains the keywords)
"""
from __future__ import annotations

import json

from typing import Protocol

from .config_loader import ToolDef
from .llm_gateway import AnthropicGateway, LlmGateway, LlmResponse, OpenAIGateway
from .settings import Settings

KEYWORDS: dict[str, list[str]] = {
    "WeatherTool": ["weather", "temperature", "rain", "sunny"],
    "EmployeeQueryTool": ["salary", "wage", "performance", "employee"],
    "SystemRestartTool": ["restart", "service"],
}


class IntentAnalyzer(Protocol):
    def identify(self, query: str, tools: dict[str, ToolDef]) -> str | None: ...


class RuleIntentAnalyzer:
    def identify(self, query: str, tools: dict[str, ToolDef]) -> str | None:
        lowered = query.lower()
        for tool_name, keywords in KEYWORDS.items():
            if tool_name in tools and any(k in lowered for k in keywords):
                return tool_name
        return None


_SYSTEM_PROMPT = (
    "You are an intent classifier. Given a user request, pick the "
    "single best-matching tool from the list below. Reply with the "
    "tool name only, no other text; reply NONE if nothing matches."
)


class AnthropicIntentAnalyzer:
    """Anthropic-compatible endpoint (e.g. DeepSeek's /anthropic API)."""

    def __init__(self, settings: Settings, gateway: LlmGateway | None = None):
        self._gateway = gateway or AnthropicGateway(
            settings.anthropic_model,
            base_url=settings.anthropic_base_url,
            api_key=settings.anthropic_auth_token,
        )
        self._fallback = RuleIntentAnalyzer()
        self.used_fallback = False

    def identify(self, query: str, tools: dict[str, ToolDef]) -> str | None:
        tool_desc = "\n".join(f"- {t.name}: {t.description}" for t in tools.values())
        try:
            response = self._gateway.complete(
                f"{_SYSTEM_PROMPT}\n{tool_desc}",
                [{"role": "user", "content": query}], 20,
            )
            name = response.text.strip()
            if name in tools:
                return name
            return self._fallback.identify(query, tools)
        except Exception:
            self.used_fallback = True
            return self._fallback.identify(query, tools)


class LlmIntentAnalyzer:
    def __init__(self, settings: Settings, gateway: LlmGateway | None = None):
        self._gateway = gateway or OpenAIGateway(
            settings.openai_model,
            base_url=settings.openai_base_url,
            api_key=settings.openai_api_key,
        )
        self._fallback = RuleIntentAnalyzer()
        self.used_fallback = False

    def identify(self, query: str, tools: dict[str, ToolDef]) -> str | None:
        tool_desc = "\n".join(f"- {t.name}: {t.description}" for t in tools.values())
        try:
            response = self._gateway.complete(
                f"{_SYSTEM_PROMPT}\n{tool_desc}",
                [{"role": "user", "content": query}], 20,
            )
            name = response.text.strip()
            if name in tools:
                return name
            return self._fallback.identify(query, tools)
        except Exception:
            self.used_fallback = True
            return self._fallback.identify(query, tools)


def build_intent_analyzer(settings: Settings) -> IntentAnalyzer:
    if settings.anthropic_enabled:
        return AnthropicIntentAnalyzer(settings)
    if settings.openai_enabled:
        return LlmIntentAnalyzer(settings)
    return RuleIntentAnalyzer()


def parse_case_candidates(content: str, *, stop_reason: str | None = None) -> list[dict]:
    """Parse JSON candidates even when an LLM wraps them in Markdown/prose."""
    if stop_reason in {"max_tokens", "length"}:
        raise ValueError("The LLM response was truncated; generate fewer cases and retry")
    text = content.strip()
    if not text:
        raise ValueError("The LLM returned an empty response")
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()
    starts = [index for token in ("[", "{") if (index := text.find(token)) >= 0]
    if not starts:
        raise ValueError("The LLM response did not contain JSON")
    try:
        parsed, _ = json.JSONDecoder().raw_decode(text[min(starts):])
    except json.JSONDecodeError as error:
        raise ValueError(f"The LLM returned invalid JSON: {error.msg}") from error
    candidates = parsed.get("candidates") if isinstance(parsed, dict) else parsed
    if not isinstance(candidates, list):
        raise ValueError("The LLM JSON must be an array of candidates")
    return candidates


def build_llm_gateway(settings: Settings) -> LlmGateway:
    if settings.anthropic_enabled:
        return AnthropicGateway(settings.anthropic_model, base_url=settings.anthropic_base_url,
                                api_key=settings.anthropic_auth_token)
    if settings.openai_enabled:
        return OpenAIGateway(
            settings.openai_model,
            base_url=settings.openai_base_url,
            api_key=settings.openai_api_key,
        )
    raise RuntimeError("Configure an LLM before generating draft cases")


def generate_case_candidates_response(settings: Settings, prompt: str,
                                      gateway: LlmGateway | None = None
                                      ) -> tuple[list[dict], LlmResponse]:
    """Generate candidates and retain normalized usage for Dataset Registry callers."""
    gateway = gateway or build_llm_gateway(settings)
    response = gateway.complete(
        "Return JSON with a candidates array.",
        [{"role": "user", "content": prompt}],
        4000,
        json_mode=True,
    )
    return parse_case_candidates(response.text, stop_reason=response.stop_reason), response


def generate_case_candidates(settings: Settings, prompt: str,
                             gateway: LlmGateway | None = None) -> list[dict]:
    """Ask the configured LLM for JSON-only case candidates."""
    return generate_case_candidates_response(settings, prompt, gateway)[0]
