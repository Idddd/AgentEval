"""Modular Agent evaluation workbench.

Run with: ``streamlit run app.py``.
"""
from __future__ import annotations

from pathlib import Path
import sys
from collections.abc import Sequence
from typing import Any

import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.agent_registry import AgentRegistry
from src.agent import TargetAgent
from src.agent_adapter import PermissionAgentAdapter
from src.backends.local_backend import LocalJsonBackend, LocalJsonStore
from src.code_evaluator import CodeEvaluator
from src.config_loader import load_tools_config
from src.demo_workspace import DemoEvalRunner, seed_demo_workspace
from src.eval_runner import EvalRunner
from src.intent import build_intent_analyzer, generate_case_candidates
from src.llm_judge import LlmJudge
from src.report_service import ReportService
from src.settings import load_settings
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.shell import render_shell
from src.ui.settings_page import SettingsStatus
from src.workbench_models import TestCase


st.set_page_config(page_title="Eval Studio", page_icon="◆", layout="wide", initial_sidebar_state="auto")


def load_styles() -> None:
    st.markdown(
        """
        <style>
        :root { --canvas:#F4F6F4; --sidebar:#102E28; --primary:#176B55; --ink:#17201E; --border:#DCE3DF; }
        html, body, [class*="stApp"] { background:var(--canvas); color:var(--ink); font-family:Arial, Helvetica, sans-serif; }
        [data-testid="stAppViewContainer"] { background:radial-gradient(circle at 92% 3%, #E6F0E9 0, transparent 25rem), var(--canvas); }
        [data-testid="stSidebar"] { background:var(--sidebar); width:248px !important; min-width:248px !important; }
        [data-testid="stSidebar"] * { color:#EAF0ED; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"] {
            display:flex;
            align-items:center;
            gap:10px;
            border-radius:10px;
            padding:10px 12px;
        }
        [data-testid="stSidebar"] [data-testid="stRadioOption"] > div > div > div:first-child { display:none; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]::before {
            width:18px;
            color:#A9D7C7;
            font-size:15px;
            line-height:1;
            text-align:center;
        }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="0"])::before { content:"◎"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="1"])::before { content:"▤"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="2"])::before { content:"▥"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="3"])::before { content:"⚙"; }
        [data-testid="stSidebar"] [data-testid="stRadio"] label:has(input:checked) { background:rgba(255,255,255,.14); font-weight:700; }
        .block-container { max-width:1280px; padding-top:1.7rem; padding-bottom:3rem; }
        h1 { color:var(--ink); font-size:34px !important; font-weight:700 !important; letter-spacing:-.035em; }
        h2, h3 { color:var(--ink); }
        [data-testid="stVerticalBlockBorderWrapper"] { background:#FFF; border:1px solid var(--border); border-radius:15px; padding:20px; box-shadow:none; }
        [data-testid="stButton"] button,
        [data-testid="stFormSubmitButton"] button,
        [data-testid="stDownloadButton"] button {
            border-radius:10px !important;
            border:1px solid var(--border) !important;
            color:var(--ink) !important;
            background:#FFF !important;
            font-weight:650 !important;
            font-size:13px !important;
            line-height:1.15 !important;
            white-space:nowrap;
            min-height:40px;
            box-shadow:none !important;
        }
        [data-testid="stButton"] button:hover,
        [data-testid="stFormSubmitButton"] button:hover,
        [data-testid="stDownloadButton"] button:hover {
            color:var(--primary) !important;
            border-color:#9DC8B8 !important;
            background:#F2F8F5 !important;
        }
        [data-testid="stButton"] button[kind="primary"],
        [data-testid="stFormSubmitButton"] button[kind="primary"],
        [data-testid="stDownloadButton"] button[kind="primary"] {
            background:var(--primary) !important;
            border-color:var(--primary) !important;
            color:#FFF !important;
        }
        [data-testid="stButton"] button[kind="primary"]:hover,
        [data-testid="stFormSubmitButton"] button[kind="primary"]:hover {
            background:#125743 !important;
            border-color:#125743 !important;
            color:#FFF !important;
        }
        [data-testid="stButton"] button:disabled,
        [data-testid="stFormSubmitButton"] button:disabled {
            background:#EEF2EF !important;
            border-color:#DCE3DF !important;
            color:#718078 !important;
            opacity:1 !important;
        }
        [data-testid="stTextInput"] input,
        [data-testid="stTextArea"] textarea,
        [data-testid="stNumberInput"] input,
        [data-baseweb="select"] > div {
            background:#FFF !important;
            color:var(--ink) !important;
            border-color:var(--border) !important;
        }
        [data-testid="stTextInput"] input:focus,
        [data-testid="stTextArea"] textarea:focus,
        [data-testid="stNumberInput"] input:focus {
            border-color:var(--primary) !important;
            box-shadow:0 0 0 1px var(--primary) !important;
        }
        [data-testid="stMain"] [data-testid="stRadio"] [role="radiogroup"] {
            gap:8px;
            flex-wrap:wrap;
        }
        [data-testid="stMain"] [data-testid="stRadioOption"] {
            border:1px solid var(--border);
            border-radius:999px;
            padding:7px 12px;
            background:#FFF;
            transition:background .15s ease, border-color .15s ease;
        }
        [data-testid="stMain"] [data-testid="stRadioOption"] > div > div > div:first-child { display:none; }
        [data-testid="stMain"] [data-testid="stRadioOption"][data-selected="true"] {
            background:#E4F0E9;
            border-color:#9DC8B8;
            color:var(--primary);
            font-weight:700;
        }
        .brand-mark { font-size:18px; font-weight:700; letter-spacing:.08em; margin:12px 0 2px; }
        .sidebar-spacer { height:clamp(8rem, 30vh, 22rem); }
        [data-testid="stSidebar"] [data-testid="stButton"] button {
            min-height:32px;
            font-size:12px !important;
        }
        [data-testid="stSidebar"] [data-testid="stButton"] button p {
            color:var(--ink) !important;
        }
        .workspace-bar { display:flex; gap:12px; align-items:center; padding:10px 14px; margin-bottom:22px; border:1px solid rgba(220,227,223,.9); border-radius:10px; background:rgba(255,255,255,.7); font-size:13px; }
        .workspace-bar span { color:#587269; font-size:11px; letter-spacing:.08em; }
        .status-pill { display:inline-block; border-radius:999px; background:#E4F0E9; color:#176B55; font-size:11px; font-weight:700; padding:4px 8px; white-space:nowrap; }
        .demo-badge { display:inline-block; border-radius:999px; background:#E4F0E9; color:#176B55; font-size:10px; font-weight:800; letter-spacing:.06em; padding:3px 7px; vertical-align:middle; }
        .demo-step { border-left:3px solid #9DC8B8; padding-left:12px; }
        .demo-result-line { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:8px 0 18px; }
        .demo-safe, .demo-blocked { display:inline-block; border-radius:999px; font-size:11px; font-weight:800; padding:4px 9px; }
        .demo-safe { background:#E4F0E9; color:#176B55; border:1px solid #B8D8CA; }
        .demo-blocked { background:#FBE9E7; color:#A33C36; border:1px solid #EDB8B3; }
        .tool-table-heading { display:grid; grid-template-columns:2.1fr 1.3fr 2fr 1.15fr 1.2fr; gap:1rem; color:#587269; font-size:11px; font-weight:700; letter-spacing:.05em; padding:0 12px 7px; }
        .tool-table-heading span { display:block; }
        @media (max-width: 900px) {
            .block-container { padding:1rem 1rem 2rem !important; }
            [data-testid="stSidebar"] { width:224px !important; min-width:224px !important; }
            .workspace-bar { margin-bottom:14px; }
            h1 { font-size:30px !important; }
            [data-testid="stHorizontalBlock"] { gap:.65rem !important; }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


@st.cache_resource
def build_workbench(db_path: str) -> SQLiteWorkbenchRepository:
    return SQLiteWorkbenchRepository(Path(db_path))


def build_llm_generator(settings: Any):
    """Build a lazy candidate generator; provider errors remain inside the Dataset UI."""
    if not (settings.anthropic_enabled or settings.openai_enabled):
        return None

    def generate(agent_id: str, cases: Sequence[TestCase]) -> list[dict]:
        existing = [str(case.input.get("query", "")) for case in cases]
        prompt = (
            "Generate diverse Agent evaluation cases as JSON. Return a candidates array. "
            "Each candidate must include input.query and expected_output. "
            f"Agent ID: {agent_id}. Existing queries: {existing}"
        )
        return generate_case_candidates(settings, prompt)

    return generate


def build_runner(settings: Any, repository: SQLiteWorkbenchRepository):
    """Build a local-first runner only when an LLM Judge is configured."""
    if not (settings.anthropic_enabled or settings.openai_enabled):
        return None
    try:
        from src.intent import build_llm_gateway

        backend = LocalJsonBackend(settings.data_dir)
        store = LocalJsonStore(settings.data_dir)
        agent = TargetAgent(
            load_tools_config(),
            backend.tracer,
            build_intent_analyzer(settings),
        )
        adapter = PermissionAgentAdapter(agent, store)
        judge = LlmJudge(build_llm_gateway(settings), backend.tracer)
        return EvalRunner(repository, adapter, CodeEvaluator(), judge)
    except Exception:
        # The Runs module presents the disconnected state and keeps navigation usable.
        return None


load_styles()
settings = load_settings(probe=False)
repository = build_workbench(str(settings.workbench_db))
report_service = ReportService(repository, repository.db_path.parent / "reports")
demo_trace_path = settings.data_dir / "demo-tool-traces.jsonl"
demo_seed = seed_demo_workspace(repository, report_service, demo_trace_path)
demo_runner = DemoEvalRunner(repository, demo_trace_path, inject_regression=True)
configured_runner = build_runner(settings, repository)


def runner_provider(agent_id: str):
    """Resolve the dependency-free Demo runner before optional provider runners."""
    return demo_runner if agent_id == demo_seed.agent_id else configured_runner


settings_status = SettingsStatus(
    llm=("Available" if settings.anthropic_enabled or settings.openai_enabled else "Not configured"),
    langfuse=(
        "Available"
        if settings.langfuse_public_key and settings.langfuse_secret_key
        else "Not configured"
    ),
    database="Available",
    demo_fixture="Available",
)
render_shell(
    AgentRegistry(repository),
    repository,
    default_agent_id=demo_seed.agent_id,
    runner_provider=runner_provider,
    settings_status=settings_status,
    report_service=report_service,
    llm_generate=build_llm_generator(settings),
    langfuse_base_url=(
        settings.langfuse_host
        if settings.langfuse_public_key and settings.langfuse_secret_key
        else None
    ),
)
