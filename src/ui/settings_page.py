"""Environment status and an explicit, test-before-save LLM connection editor."""
from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import dataclass

import streamlit as st

from src.settings import LlmConnectionDraft, LlmConnectionTestResult, Settings


@dataclass(frozen=True)
class SettingsStatus:
    """Safe-to-display service state for the local workbench environment."""

    llm: str
    langfuse: str
    database: str
    demo_fixture: str


_SAFE_STATUS_VALUES = {"Connected", "Not configured", "Available"}
ConnectionTester = Callable[[LlmConnectionDraft], LlmConnectionTestResult]
ConnectionSaver = Callable[[LlmConnectionDraft], None]


def _safe_status(value: str) -> str:
    return value if value in _SAFE_STATUS_VALUES else "Error (details hidden)"


def _fingerprint(draft: LlmConnectionDraft) -> str:
    value = "\0".join(
        (draft.provider, draft.base_url or "", draft.model, draft.api_key)
    )
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _stored_key(settings: Settings, provider: str) -> str:
    return (
        settings.anthropic_auth_token or ""
        if provider == "anthropic"
        else settings.openai_api_key or ""
    )


def render_settings_page(
    status: SettingsStatus,
    settings: Settings | None = None,
    *,
    test_connection: ConnectionTester | None = None,
    save_connection: ConnectionSaver | None = None,
) -> None:
    """Render safe status plus an optional runtime LLM connection workflow."""
    st.title("Environment status")
    st.caption("Connection status is safe to display; API keys are always masked.")
    with st.container(border=True):
        for label, value in (
            ("LLM", status.llm),
            ("Langfuse", status.langfuse),
            ("Database", status.database),
            ("Demo fixture", status.demo_fixture),
        ):
            row_label, row_value = st.columns([2, 3])
            row_label.markdown(f"**{label}**")
            row_value.caption(_safe_status(value))

    if settings is None or test_connection is None or save_connection is None:
        return

    st.subheader("LLM connection")
    st.caption(
        "Test a provider before saving it. Without a configured LLM, Dataset generation "
        "uses authored Demo metadata with simulated latency."
    )
    provider_options = {"OpenAI-compatible": "openai", "Anthropic-compatible": "anthropic"}
    active_label = next(
        (label for label, value in provider_options.items() if value == settings.llm_provider),
        "OpenAI-compatible",
    )
    with st.container(border=True):
        provider_label = st.selectbox(
            "Provider",
            tuple(provider_options),
            index=tuple(provider_options).index(active_label),
            key="settings_llm_provider",
        )
        provider = provider_options[provider_label]
        active_provider = settings.llm_provider == provider
        default_url = (
            settings.anthropic_base_url
            if provider == "anthropic"
            else settings.openai_base_url
        ) or ""
        default_model = (
            settings.anthropic_model if provider == "anthropic" else settings.openai_model
        )
        base_url = st.text_input(
            "Base URL" + (" *" if provider == "anthropic" else " (optional)"),
            value=default_url,
            key=f"settings_llm_base_url_{provider}",
            placeholder=(
                "https://api.anthropic.com"
                if provider == "anthropic"
                else "https://api.openai.com/v1"
            ),
        )
        model = st.text_input(
            "Model *", value=default_model, key=f"settings_llm_model_{provider}"
        )
        entered_key = st.text_input(
            "API key *",
            value="",
            type="password",
            key=f"settings_llm_api_key_{provider}",
            placeholder="Leave blank to keep the saved key" if active_provider and _stored_key(settings, provider) else "Paste API key",
        )
        api_key = entered_key.strip() or (
            _stored_key(settings, provider) if active_provider else ""
        )
        if active_provider and _stored_key(settings, provider):
            st.caption("A saved key is available and remains hidden.")
        draft = LlmConnectionDraft(provider, base_url.strip() or None, model.strip(), api_key)
        fingerprint = _fingerprint(draft)
        test_key = "settings_llm_tested_fingerprint"
        result_key = "settings_llm_test_result"
        test_col, save_col = st.columns(2)
        if test_col.button("Test connection", type="primary", width="stretch"):
            with st.spinner("Testing the model endpoint..."):
                try:
                    result = test_connection(draft)
                except ValueError as error:
                    result = LlmConnectionTestResult(
                        False, provider, model.strip(), 0, str(error)
                    )
            st.session_state[result_key] = result
            st.session_state[test_key] = fingerprint if result.success else None

        tested = st.session_state.get(test_key) == fingerprint
        if save_col.button(
            "Save and use",
            width="stretch",
            disabled=not tested,
            help="Test the current values successfully before saving.",
        ):
            save_connection(draft)
            st.success("LLM connection saved. Reloading the runtime configuration...")
            st.rerun()

        result = st.session_state.get(result_key)
        if isinstance(result, LlmConnectionTestResult):
            if result.success and tested:
                st.success(f"{result.message} · {result.model} · {result.latency_ms} ms")
            elif not result.success:
                st.error(result.message)
            else:
                st.info("Connection fields changed. Test the current values again before saving.")
