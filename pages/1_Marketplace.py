"""Marketplace: register agents by manifest, trigger sandboxed eval runs,
and open the resulting reports.

Runs are executed by the orchestrator worker process:
    SANDBOX_RUNNER=k8s .venv/bin/python -m src.orchestrator
"""
from __future__ import annotations

import os
from pathlib import Path

import streamlit as st

from src.marketplace.manifest import ManifestError
from src.marketplace.registry import DuplicateAgentError, MarketplaceRegistry
from src.orchestrator.queue import RunQueue
from src.settings import PROJECT_ROOT

DB_PATH = Path(os.environ.get("AGENT_EVAL_DB",
                              PROJECT_ROOT / "data" / "marketplace.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

st.set_page_config(page_title="Agent Marketplace", layout="wide")
st.title("Agent Marketplace")

registry = MarketplaceRegistry(DB_PATH)
queue = RunQueue(DB_PATH)

# ---------- Register ----------

st.header("Register an agent")
manifest_text = st.text_area(
    "Agent manifest (YAML, image pinned by digest)", key="manifest_input",
    height=220,
    placeholder="manifest_version: 1\nagent_id: acme/my-agent\n…")
if st.button("Register agent", key="register_button"):
    try:
        agent = registry.register(manifest_text)
        st.success(f"Registered {agent.manifest.agent_id} "
                   f"version {agent.manifest.version}")
    except (ManifestError, DuplicateAgentError) as error:
        st.error(f"Registration failed: {error}")

# ---------- Registered agents ----------

st.header("Registered agents")
agents = registry.list_agents()
if not agents:
    st.info("No agents registered yet. Paste a manifest above to register one.")
else:
    for agent in agents:
        manifest = agent.manifest
        with st.container(border=True):
            left, right = st.columns([4, 1])
            left.markdown(
                f"**{manifest.display_name}** — `{manifest.agent_id}` "
                f"v{manifest.version} ({agent.version_count} version(s))\n\n"
                f"Contract `{manifest.protocol}` · image "
                f"`…{manifest.image_digest[-23:]}`")
            if right.button("Run eval", key=f"run_{manifest.agent_id}"):
                run_id = queue.enqueue(manifest.agent_id, manifest.version,
                                       manifest.image_digest)
                st.success(f"Run {run_id} QUEUED — the orchestrator worker "
                           f"will pick it up.")

# ---------- Runs ----------

st.header("Eval runs")
runs = queue.list_runs()
if not runs:
    st.info("No runs yet. Register an agent and press Run eval.")
for run in runs:
    with st.container(border=True):
        st.markdown(
            f"`{run.run_id}` — **{run.status}** — {run.agent_id} "
            f"v{run.version} — created {run.created_at}")
        if run.error:
            st.error(run.error)
        if run.results:
            cases = run.results.get("cases", [])
            passed = sum(1 for c in cases if c["status"] == "PASS")
            failed = sum(1 for c in cases if c["status"] == "FAIL")
            st.markdown(f"{passed} PASS / {failed} FAIL / "
                        f"{len(cases) - passed - failed} INCOMPLETE")
        if run.report_path and Path(run.report_path).exists():
            with st.expander("Report"):
                st.markdown(Path(run.report_path).read_text(encoding="utf-8"))
