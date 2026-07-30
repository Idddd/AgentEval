"""Modular Agent evaluation workbench.

Run with: ``streamlit run app.py``.
"""
from __future__ import annotations

from pathlib import Path
import sys

import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.agent_registry import AgentRegistry
from src.settings import load_settings
from src.sqlite_workbench import SQLiteWorkbenchRepository
from src.ui.shell import render_shell


st.set_page_config(page_title="Eval Studio", page_icon="◆", layout="wide", initial_sidebar_state="expanded")


def load_styles() -> None:
    st.markdown(
        """
        <style>
        :root { --canvas:#F4F6F4; --sidebar:#102E28; --primary:#176B55; --ink:#17201E; --border:#DCE3DF; }
        html, body, [class*="stApp"] { background:var(--canvas); color:var(--ink); font-family:Arial, Helvetica, sans-serif; }
        [data-testid="stAppViewContainer"] { background:radial-gradient(circle at 92% 3%, #E6F0E9 0, transparent 25rem), var(--canvas); }
        [data-testid="stSidebar"] { background:var(--sidebar); min-width:248px; }
        [data-testid="stSidebar"] * { color:#EAF0ED; }
        [data-testid="stSidebar"] [data-testid="stRadio"] label { border-radius:10px; padding:8px 10px; }
        [data-testid="stSidebar"] [data-testid="stRadio"] label:has(input:checked) { background:rgba(255,255,255,.14); font-weight:700; }
        .block-container { max-width:1280px; padding-top:1.7rem; padding-bottom:3rem; }
        h1 { color:var(--ink); font-size:34px !important; font-weight:700 !important; letter-spacing:-.035em; }
        h2, h3 { color:var(--ink); }
        [data-testid="stVerticalBlockBorderWrapper"] { background:#FFF; border:1px solid var(--border); border-radius:15px; padding:20px; box-shadow:none; }
        [data-testid="stButton"] > button { border-radius:10px; border:1px solid var(--border); color:var(--ink); background:#FFF; font-weight:600; }
        [data-testid="stButton"] > button[kind="primary"] { background:var(--primary); border-color:var(--primary); color:#FFF; }
        .brand-mark { font-size:18px; font-weight:700; letter-spacing:.08em; margin:12px 0 2px; }
        .sidebar-foot { position:fixed; bottom:24px; color:#BDD1C7 !important; font-size:12px; line-height:1.6; }
        .workspace-bar { display:flex; gap:12px; align-items:center; padding:10px 14px; margin-bottom:22px; border:1px solid rgba(220,227,223,.9); border-radius:10px; background:rgba(255,255,255,.7); font-size:13px; }
        .workspace-bar span { color:#587269; font-size:11px; letter-spacing:.08em; }
        .status-pill { display:inline-block; border-radius:999px; background:#E4F0E9; color:#176B55; font-size:11px; font-weight:700; padding:4px 8px; white-space:nowrap; }
        .tool-table-heading { display:grid; grid-template-columns:2.1fr 1.3fr 2fr 1.15fr 1.2fr; gap:1rem; color:#587269; font-size:11px; font-weight:700; letter-spacing:.05em; padding:0 12px 7px; }
        .tool-table-heading span { display:block; }
        </style>
        """,
        unsafe_allow_html=True,
    )


@st.cache_resource
def build_workbench(db_path: str) -> SQLiteWorkbenchRepository:
    return SQLiteWorkbenchRepository(Path(db_path))


load_styles()
settings = load_settings(probe=False)
repository = build_workbench(str(settings.workbench_db))
render_shell(AgentRegistry(repository), repository)
