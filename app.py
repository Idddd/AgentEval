"""Modular Agent evaluation workbench.

Run with: ``streamlit run app.py``.
"""
from __future__ import annotations

from pathlib import Path
import sys
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
from src.dataset_generation import DatasetCandidateService
from src.eval_runner import EvalRunner
from src.intent import build_intent_analyzer
from src.llm_judge import LlmJudge
from src.report_service import ReportService
from src.settings import load_settings, save_llm_settings, test_llm_connection
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.shell import render_shell
from src.ui.settings_page import SettingsStatus


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
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="4"])::before { content:"↻"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="5"])::before { content:"◉"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="6"])::before { content:"⌁"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="7"])::before { content:"⚙"; }
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

        /* TaskLattice-aligned visual system. These rules intentionally only
           affect presentation; the Streamlit widget structure stays intact. */
        :root {
            --canvas:#FAFAFA;
            --sidebar:#FAFAFA;
            --surface:#FAFAFA;
            --surface-raised:#FFFFFF;
            --primary:#4339FF;
            --primary-hover:#3730D9;
            --ink:#191A1B;
            --muted:#F2F2F2;
            --muted-ink:rgba(25,26,27,.62);
            --border:rgba(20,22,24,.09);
            --input-border:rgba(20,22,24,.20);
            --signal:#008CA3;
            --success:#16835A;
            --danger:#B33A3A;
            --font-sans:"PingFang SC","Noto Sans SC","Microsoft YaHei","Hanken Grotesk",Arial,sans-serif;
            --font-heading:"Noto Serif SC","Source Han Serif SC","Songti SC",Georgia,serif;
            --font-mono:"Chivo Mono","JetBrains Mono",Consolas,monospace;
        }
        html, body, [class*="stApp"] {
            background:var(--canvas);
            color:var(--ink);
            font-family:var(--font-sans);
        }
        [data-testid="stAppViewContainer"] { background:var(--canvas); }
        [data-testid="stHeader"] {
            background:rgba(250,250,250,.94);
            border-bottom:1px solid var(--border);
            backdrop-filter:blur(12px);
        }
        [data-testid="stToolbar"] { right:1rem; }
        [data-testid="stSidebar"] {
            background:var(--sidebar);
            border-right:1px solid var(--border);
            width:264px !important;
            min-width:264px !important;
        }
        [data-testid="stSidebar"] > div:first-child { padding-top:.35rem; }
        [data-testid="stSidebar"] * { color:var(--ink); }
        [data-testid="stSidebar"] [data-testid="stMarkdownContainer"] p { color:var(--muted-ink); }
        [data-testid="stSidebar"] [data-testid="stRadio"] { margin-top:.25rem; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"] {
            gap:9px;
            min-height:36px;
            border-radius:6px;
            padding:7px 10px;
            color:var(--muted-ink);
            font-size:13px;
            font-weight:500;
            transition:background .16s ease,color .16s ease,box-shadow .16s ease;
        }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]::before {
            width:17px;
            color:rgba(25,26,27,.46);
            font-family:var(--font-mono);
            font-size:13px;
        }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="0"])::before { content:"\\25CE"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="1"])::before { content:"\\25A6"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="2"])::before { content:"\\25B7"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="3"])::before { content:"\\25A4"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="4"])::before { content:"\\2726"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="5"])::before { content:"\\25C9"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="6"])::before { content:"\\2301"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:has(input[value="7"])::before { content:"\\2699"; }
        [data-testid="stSidebar"] [data-testid="stRadioOption"]:hover { background:var(--muted); color:var(--ink); }
        [data-testid="stSidebar"] [data-testid="stRadio"] label:has(input:checked) {
            background:rgba(67,57,255,.055);
            box-shadow:inset 2px 0 0 var(--primary);
            color:var(--ink);
            font-weight:600;
        }
        [data-testid="stSidebar"] [data-testid="stRadio"] label:has(input:checked)::before { color:var(--primary); }
        .block-container { max-width:1600px; padding:1.35rem 2rem 3.5rem; }
        h1, h2, h3 { color:var(--ink); font-family:var(--font-heading) !important; font-weight:500 !important; }
        h1 { font-size:30px !important; letter-spacing:-.025em; line-height:1.2 !important; }
        h2 { font-size:22px !important; letter-spacing:-.015em; }
        h3 { font-size:17px !important; }
        p, label, [data-testid="stCaptionContainer"] { line-height:1.5; }
        [data-testid="stCaptionContainer"] { color:var(--muted-ink); font-size:12px; }
        hr { border-color:var(--border) !important; }
        [data-testid="stVerticalBlockBorderWrapper"] {
            background:var(--surface);
            border:1px solid rgba(20,22,24,.08);
            border-radius:8px;
            padding:16px;
            box-shadow:0 1px 2px rgba(0,0,0,.025),0 1px 4px rgba(0,0,0,.02);
        }
        [data-testid="stButton"] button,
        [data-testid="stFormSubmitButton"] button,
        [data-testid="stDownloadButton"] button {
            border-radius:6px !important;
            border:1px solid rgba(20,22,24,.12) !important;
            color:var(--ink) !important;
            background:var(--surface) !important;
            font-weight:600 !important;
            font-size:13px !important;
            min-height:36px;
            padding:0 14px !important;
            box-shadow:none !important;
            transition:background .16s ease,border-color .16s ease,color .16s ease;
        }
        [data-testid="stButton"] button:hover,
        [data-testid="stFormSubmitButton"] button:hover,
        [data-testid="stDownloadButton"] button:hover {
            color:var(--ink) !important;
            border-color:rgba(20,22,24,.18) !important;
            background:var(--muted) !important;
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
            background:var(--primary-hover) !important;
            border-color:var(--primary-hover) !important;
            color:#FFF !important;
        }
        [data-testid="stButton"] button:disabled,
        [data-testid="stFormSubmitButton"] button:disabled {
            background:var(--muted) !important;
            border-color:var(--border) !important;
            color:rgba(25,26,27,.38) !important;
            opacity:.72 !important;
        }
        [data-testid="stTextInput"] input,
        [data-testid="stTextArea"] textarea,
        [data-testid="stNumberInput"] input,
        [data-baseweb="select"] > div {
            background:var(--surface-raised) !important;
            color:var(--ink) !important;
            border-color:var(--input-border) !important;
            border-radius:6px !important;
        }
        [data-testid="stTextInput"] input:focus,
        [data-testid="stTextArea"] textarea:focus,
        [data-testid="stNumberInput"] input:focus {
            border-color:var(--primary) !important;
            box-shadow:0 0 0 2px rgba(67,57,255,.18) !important;
        }
        [data-testid="stMain"] [data-testid="stRadio"] [role="radiogroup"] { gap:6px; }
        [data-testid="stMain"] [data-testid="stRadioOption"] {
            border:1px solid var(--border);
            border-radius:6px;
            padding:6px 10px;
            background:var(--surface);
        }
        [data-testid="stMain"] [data-testid="stRadioOption"][data-selected="true"] {
            background:rgba(67,57,255,.055);
            border-color:rgba(67,57,255,.24);
            color:var(--primary);
            font-weight:600;
        }
        .brand-lockup {
            display:flex;
            align-items:center;
            gap:12px;
            min-height:52px;
            margin:-.35rem -1rem .55rem;
            padding:.45rem 1rem .75rem;
            border-bottom:1px solid var(--border);
        }
        .brand-lattice-mark { width:32px; height:32px; flex:0 0 32px; color:var(--ink); overflow:visible; }
        .brand-lattice-lines { fill:none; stroke:currentColor; stroke-width:1.5; }
        .brand-lattice-nodes { fill:var(--signal); stroke:var(--surface); stroke-width:1.5; }
        .brand-copy { min-width:0; line-height:1; }
        .brand-copy strong { display:block; font-size:15px; font-weight:600; letter-spacing:.22em; }
        .brand-copy span { display:block; margin-top:7px; color:var(--muted-ink); font-family:var(--font-mono); font-size:9px; letter-spacing:.08em; }
        .nav-section-label { margin:.7rem .6rem .35rem; color:rgba(25,26,27,.45); font-family:var(--font-mono); font-size:9px; font-weight:500; letter-spacing:.10em; }
        .sidebar-spacer { height:clamp(7rem, 26vh, 18rem); }
        [data-testid="stSidebar"] [data-testid="stButton"] button { min-height:32px; font-size:12px !important; }
        [data-testid="stSidebar"] [data-testid="stButton"] button p { color:var(--ink) !important; }
        .workspace-bar {
            display:flex;
            gap:10px;
            align-items:center;
            min-height:42px;
            padding:0 0 14px;
            margin-bottom:22px;
            border:0;
            border-bottom:1px solid var(--border);
            border-radius:0;
            background:transparent;
            font-size:13px;
        }
        .workspace-bar span { color:var(--muted-ink); font-family:var(--font-mono); font-size:10px; letter-spacing:.08em; }
        .workspace-bar strong { font-weight:500; }
        .workspace-bar::after { content:"LOCAL"; margin-left:auto; color:var(--signal); font-family:var(--font-mono); font-size:9px; letter-spacing:.10em; }
        .status-pill, .demo-badge {
            display:inline-block;
            border:1px solid rgba(67,57,255,.14);
            border-radius:4px;
            background:rgba(67,57,255,.055);
            color:var(--primary);
            font-size:10px;
            font-weight:600;
            letter-spacing:.045em;
            padding:3px 7px;
            vertical-align:middle;
            white-space:nowrap;
        }
        .demo-step { border-left:2px solid rgba(67,57,255,.28); padding-left:12px; }
        .demo-result-line { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:8px 0 18px; }
        .demo-safe, .demo-blocked { display:inline-block; border-radius:4px; font-size:10px; font-weight:600; padding:4px 8px; }
        .demo-safe { background:rgba(22,131,90,.08); color:var(--success); border:1px solid rgba(22,131,90,.18); }
        .demo-blocked { background:rgba(179,58,58,.07); color:var(--danger); border:1px solid rgba(179,58,58,.18); }
        .tool-table-heading { color:var(--muted-ink); font-family:var(--font-mono); font-size:9px; font-weight:500; letter-spacing:.06em; text-transform:uppercase; }
        [data-testid="stDataFrame"], [data-testid="stDataEditor"] { border:1px solid var(--border); border-radius:8px; overflow:hidden; }
        [data-testid="stMetric"] { padding:.25rem 0; }
        [data-testid="stMetricLabel"] { color:var(--muted-ink); font-size:12px; }
        [data-testid="stMetricValue"] { color:var(--ink); font-family:var(--font-heading); font-size:28px; font-weight:500; }
        [data-testid="stAlert"] { border-radius:6px; border-width:1px; }
        [data-testid="stTabs"] [data-baseweb="tab-list"] { gap:18px; border-bottom:1px solid var(--border); }
        [data-testid="stTabs"] [data-baseweb="tab"] { height:40px; padding:0 2px; background:transparent; font-size:13px; }
        [data-testid="stTabs"] [aria-selected="true"] { color:var(--primary); }
        .trace-waterfall-header {
            display:grid;
            grid-template-columns:4.2fr 5.8fr 1.2fr;
            gap:1rem;
            padding:4px 8px 6px;
            border-bottom:1px solid var(--border);
            color:var(--muted-ink);
            font-family:var(--font-mono);
            font-size:9px;
            font-weight:500;
            letter-spacing:.08em;
        }
        .trace-waterfall-track {
            position:relative;
            height:8px;
            overflow:hidden;
            border-radius:3px;
            background:var(--muted);
        }
        .trace-waterfall-track span {
            position:absolute;
            top:0;
            bottom:0;
            min-width:3px;
            border-radius:3px;
        }
        [class*="st-key-trace_span_"] [data-testid="stButton"] button {
            justify-content:flex-start;
            min-height:32px;
            border-color:transparent !important;
            background:transparent !important;
            font-weight:500 !important;
        }
        [class*="st-key-trace_span_"] [data-testid="stButton"] button:hover {
            background:var(--muted) !important;
        }
        [class*="st-key-trace_span_"] [data-testid="stButton"] button[kind="primary"] {
            background:rgba(67,57,255,.07) !important;
            color:var(--primary) !important;
        }
        .st-key-trace_detail_actions {
            justify-content:flex-start !important;
            gap:4px !important;
        }
        .st-key-trace_detail_actions h3 { margin-left:8px; }
        .st-key-trace_detail_actions [data-testid="stButton"] button {
            min-height:28px;
            padding:3px 9px;
            border-radius:6px !important;
            font-size:11px !important;
        }
        a { color:var(--primary); text-underline-offset:3px; }
        @media (max-width:900px) {
            [data-testid="stSidebar"] { width:240px !important; min-width:240px !important; }
            h1 { font-size:27px !important; }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


@st.cache_resource
def build_workbench(db_path: str) -> SQLiteWorkbenchRepository:
    return SQLiteWorkbenchRepository(Path(db_path))


def build_llm_generator(settings: Any, repository: SQLiteWorkbenchRepository):
    """Always provide generation: configured LLM first, authored fallback otherwise."""
    return DatasetCandidateService(
        settings,
        repository,
        fallback_delay_seconds=1.6,
    ).generate


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


def runner_provider(agent_id: str):
    """Resolve the dependency-free Demo runner before optional provider runners."""
    return demo_runner if agent_id == demo_seed.agent_id else configured_runner


def trace_provider(trace_id: str):
    """Resolve raw spans from demo and configured local trace stores."""
    for store in trace_stores:
        try:
            return store.get_trace(trace_id, retry=False)
        except KeyError:
            continue
    return None


settings_status = SettingsStatus(
    llm=("Connected" if settings.anthropic_enabled or settings.openai_enabled else "Not configured"),
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
    settings=settings,
    test_llm_connection=test_llm_connection,
    save_llm_connection=save_llm_settings,
    report_service=report_service,
    llm_generate=build_llm_generator(settings, repository),
    langfuse_base_url=(
        settings.langfuse_host
        if settings.langfuse_public_key and settings.langfuse_secret_key
        else None
    ),
    trace_provider=trace_provider,
)
