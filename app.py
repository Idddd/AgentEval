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
from src.workbench_models import DatasetSchema, TestCase


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
        [data-testid="stSidebar"] [data-testid="stRadio"] { display:none; }
        .sidebar-nav-heading { color:#91AFA5 !important; font-size:10px; font-weight:800; letter-spacing:.12em; margin:16px 0 5px; }
        [data-testid="stSidebar"] [class*="st-key-sidebar_nav_item_"] [data-testid="stButton"] button {
            background:transparent !important; border-color:transparent !important; color:#DDE9E4 !important;
            min-height:34px; padding:6px 9px; font-weight:500 !important;
        }
        [data-testid="stSidebar"] [class*="st-key-sidebar_nav_item_"] [data-testid="stButton"] button:hover {
            background:rgba(255,255,255,.08) !important; color:#FFF !important;
        }
        [data-testid="stSidebar"] [class*="st-key-sidebar_nav_item_"] [data-testid="stButton"] button[kind="primary"] {
            background:rgba(255,255,255,.13) !important; color:#FFF !important; font-weight:700 !important;
        }
        [data-testid="stSidebar"] [class*="st-key-sidebar_nav_item_"][class*="_child"] { margin-left:14px; width:calc(100% - 14px); }
        [data-testid="stSidebar"] [class*="st-key-sidebar_nav_item_"] [data-testid="stButton"] button p { color:inherit !important; }
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
            justify-content:flex-start;
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
        .trace-waterfall-header { display:grid; grid-template-columns:4.2fr 5.8fr 1.2fr; gap:1rem; color:#718078; font-size:10px; font-weight:800; letter-spacing:.08em; padding:4px 8px 6px; border-bottom:1px solid var(--border); }
        .trace-waterfall-track { position:relative; height:10px; border-radius:999px; background:#EDF1EF; overflow:hidden; }
        .trace-waterfall-track span { position:absolute; top:0; bottom:0; border-radius:999px; min-width:3px; }
        [class*="st-key-trace_span_"] [data-testid="stButton"] button { justify-content:flex-start; border-color:transparent !important; background:transparent !important; font-weight:500 !important; min-height:32px; }
        [class*="st-key-trace_span_"] [data-testid="stButton"] button:hover { background:#F2F8F5 !important; }
        [class*="st-key-trace_span_"] [data-testid="stButton"] button[kind="primary"] { background:#E4F0E9 !important; color:var(--primary) !important; }
        .st-key-trace_detail_actions { justify-content:flex-start !important; gap:4px !important; }
        .st-key-trace_detail_actions h3 { margin-left:8px; }
        .st-key-trace_detail_actions [data-testid="stButton"] button { min-height:28px; padding:3px 9px; font-size:11px !important; border-radius:999px !important; }
        .st-key-trace_mark_fail [data-testid="stButton"] button { color:#A33C36 !important; border-color:#E4AAA5 !important; background:#FFF7F6 !important; }
        .st-key-trace_mark_fail [data-testid="stButton"] button:hover { color:#842E29 !important; border-color:#CF756D !important; background:#FCE8E6 !important; }
        .st-key-trace_analysis [data-testid="stButton"] button { color:#176B55 !important; border-color:#9DC8B8 !important; background:#F2F8F5 !important; }
        .st-key-trace_analysis [data-testid="stButton"] button:hover { color:#125743 !important; border-color:#6EAD96 !important; background:#E4F0E9 !important; }
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

    def generate(agent_id: str, cases: Sequence[TestCase], schema: DatasetSchema) -> list[dict]:
        existing = [
            str(case.input.get(column.name, ""))
            for column in schema.input_columns
            for case in cases
        ]
        prompt = _build_candidate_prompt(agent_id, schema, existing)
        return generate_case_candidates(settings, prompt)

    return generate


def _build_candidate_prompt(agent_id: str, schema: DatasetSchema, existing: list[str]) -> str:
    input_lines = [
        f"- {col.name} ({col.data_type}, {'required' if col.required else 'optional'})"
        + (f": {col.description}" if col.description else "")
        for col in schema.input_columns
    ]
    output_lines = [
        f"- {col.name} ({col.data_type}, {'required' if col.required else 'optional'})"
        + (f": {col.description}" if col.description else "")
        for col in schema.output_columns
    ]
    return (
        "Generate diverse Agent evaluation cases as JSON. "
        'Return a JSON object with a "candidates" array.\n\n'
        "Schema (each case MUST conform):\n"
        "Input fields:\n" + "\n".join(input_lines) + "\n\n"
        "Output fields:\n" + "\n".join(output_lines) + "\n\n"
        f"Agent ID: {agent_id}.\n"
        f"Existing values: {existing}"
    )


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
trace_stores = (
    LocalJsonStore(settings.data_dir, traces_path=demo_trace_path),
    LocalJsonStore(settings.data_dir),
)


def trace_provider(trace_id: str):
    for store in trace_stores:
        try:
            return store.get_trace(trace_id, retry=False)
        except KeyError:
            continue
    return None


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
    trace_provider=trace_provider,
)
