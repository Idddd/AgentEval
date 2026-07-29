"""Streamlit observability dashboard: Dataset / Trace timeline / Scores / Report.

Run: streamlit run app.py
"""
from __future__ import annotations

import asyncio
import shutil
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pandas as pd
import plotly.express as px
import streamlit as st

from src.backends.base import get_backend
from src.config_loader import (
    CONFIG_PATH,
    add_tool_test_requirement,
    clear_tool_test_requirements,
    load_tools_config,
)
from src.dataset_generator import DatasetGenerator, compute_case
from src.eval_runner import EvalRunner
from src.intent import build_intent_analyzer
from src.models import DatasetItemRecord, SpanRecord, TraceRecord
from src.report_generator import (
    COMPLIANCE, EXECUTION, ReportGenerator, aggregate, report_status,
)
from src.settings import load_settings

DATASET_NAME = "agent_permission_eval_v1"

# Soft palette — readable in both light and dark Streamlit themes
PASS_BG, PASS_FG = "#e8f5e9", "#1b5e20"
FAIL_BG, FAIL_FG = "#ffebee", "#b71c1c"

st.set_page_config(page_title="Agent Permission Compliance Eval", layout="wide")


@st.cache_resource
def init_runtime():
    settings = load_settings()
    backend, store = get_backend()
    config = load_tools_config()
    return settings, backend, store, config


settings, backend, store, config = init_runtime()


def case_reason(t: TraceRecord) -> str | None:
    return next((s.comment.split("|", 1)[1].strip()
                 for s in t.scores if s.comment and "|" in s.comment), None)


def styled_cases_df(traces: list[TraceRecord]) -> pd.io.formats.style.Styler:
    rows = [{
        "status": "PASS" if t.get_score(COMPLIANCE) == 1.0 else "FAIL",
        "scenario": t.metadata.get("scenario"),
        "user_role": t.metadata.get("user_role"),
        "tool": t.metadata.get("tool_name"),
        "compliance": t.get_score(COMPLIANCE),
        "execution": t.get_score(EXECUTION),
        "trace": t.name,
    } for t in traces]

    def _row_style(row):
        ok = row["compliance"] == 1.0 and row["execution"] == 1.0
        bg, fg = (PASS_BG, PASS_FG) if ok else (FAIL_BG, FAIL_FG)
        return [f"background-color: {bg}; color: {fg}"] * len(row)

    return pd.DataFrame(rows).style.apply(_row_style, axis=1)


def render_target_agent(config) -> None:
    st.subheader("Target Agent")
    st.markdown(
        "This demo evaluates an agent that identifies the requested tool, "
        "checks the **Permission Guard** before every high-risk action, and "
        "records a trace of its decision and execution."
    )
    st.subheader("Target tools")
    columns = st.columns(len(config.tools))
    for column, tool in zip(columns, config.tools.values()):
        risk = "High risk" if tool.sensitivity == "high" else "Low risk"
        required = tool.required_role or "Any role"
        with column:
            with st.container(border=True):
                st.markdown(f"**{tool.name}**")
                st.caption(tool.description)
                st.markdown(f"**Risk:** {risk}  \n**Required role:** {required}")
                requirements = tool.test_requirements or ["No custom requirements yet."]
                st.markdown("**Test requirements**")
                for requirement in requirements:
                    st.caption(f"• {requirement}")
                with st.form(f"requirement_form_{tool.name}"):
                    requirement = st.text_input(
                        "Add test requirement", key=f"requirement_{tool.name}")
                    submitted = st.form_submit_button("Add requirement")
                if submitted:
                    try:
                        add_tool_test_requirement(CONFIG_PATH, tool.name, requirement)
                    except ValueError as error:
                        st.warning(str(error))
                    else:
                        init_runtime.clear()
                        st.toast(f"Requirement added to {tool.name}", icon="✅")
                        st.rerun()


def render_permission_policy(config) -> None:
    st.subheader("Permission policy")
    rows = []
    for role, permissions in config.roles.items():
        rows.append({
            "Role": role,
            **{tool: "Allowed" if tool in permissions else "Denied"
               for tool in config.tools},
        })
    st.caption("Text labels make the current authorization rules explicit.")
    st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)


def render_status_banner(status: str, summary: str) -> None:
    if status == "COMPLIANT":
        color, background, icon = "#0b5d1e", "#dff7e5", "✅"
    else:
        color, background, icon = "#8a1515", "#ffe0e0", "⚠️"
    st.markdown(
        f"<div style='padding:16px 18px;border:2px solid {color};"
        f"border-radius:8px;background:{background};color:{color};'>"
        f"<strong>{icon} {status}</strong><br>{summary}</div>",
        unsafe_allow_html=True,
    )


# ---------------- Main header + live run console ----------------
# The console placeholder is created BEFORE the sidebar handlers so the
# evaluation can stream progress into it during the same script run.

st.title("Agent Permission Compliance Dashboard")

with st.container(border=True):
    render_target_agent(config)
    st.divider()
    render_permission_policy(config)
    st.divider()
    st.subheader("Run an evaluation")
    st.caption("Follow the ordered workflow in the sidebar: prepare a dataset, run the evaluation, then review Scores and export the Report.")

if "run_log" not in st.session_state:
    st.session_state["run_log"] = []

console_slot = st.empty()
if st.session_state["run_log"]:
    console_slot.code("\n".join(st.session_state["run_log"]), language="text")

# ---------------- Sidebar ----------------

st.sidebar.title("Agent Permission Eval")

if settings.langfuse_enabled:
    st.sidebar.success("Trace Backend: Langfuse")
else:
    st.sidebar.warning("Trace Backend: Local JSON (no Langfuse credentials)")
if settings.anthropic_enabled:
    st.sidebar.success(f"LLM: DeepSeek ({settings.anthropic_model})")
elif settings.openai_enabled:
    st.sidebar.success("LLM: OpenAI")
else:
    st.sidebar.warning("LLM: Rule-based (no LLM credentials)")

experiment_name = st.sidebar.text_input("Experiment name", value="exp_v1")

st.sidebar.divider()
st.sidebar.subheader("Pipeline")

if st.sidebar.button("1️⃣ Generate Dataset", width="stretch"):
    with st.spinner("Generating dataset..."):
        gen = DatasetGenerator(DATASET_NAME, backend, config)
        items = gen.generate()
    st.toast(f"Dataset generated: {len(items)} items", icon="✅")

try:
    dataset_items = backend.get_dataset_items(DATASET_NAME)
except KeyError:
    dataset_items = []
dataset_ready = len(dataset_items) > 0

if st.sidebar.button("2️⃣ Run Evaluation", width="stretch",
                     disabled=not dataset_ready):
    runner = EvalRunner(DATASET_NAME, experiment_name, backend, store,
                        config, build_intent_analyzer(settings))
    bar = st.sidebar.progress(0.0, text="Starting...")
    lines: list[str] = []

    def on_progress(done: int, total: int, label: str) -> None:
        bar.progress(done / max(total, 1), text=f"{done}/{total}")
        lines.append(label)
        console_slot.code("\n".join(lines), language="text")

    with st.spinner("Running evaluation..."):
        results = asyncio.run(runner.run(progress=on_progress))
    st.session_state["run_log"] = lines
    st.toast(f"Done: {len(results)} traces scored", icon="✅")

traces = store.list_traces(tag=experiment_name)
has_scores = any(t.scores for t in traces)

if st.sidebar.button("3️⃣ Generate Report", width="stretch",
                     disabled=not has_scores):
    with st.spinner("Generating report..."):
        ReportGenerator(experiment_name, store).generate()
    st.toast(f"Report saved to reports/report_{experiment_name}.md",
             icon="✅")

st.sidebar.divider()
if not st.session_state.get("reset_armed"):
    if st.sidebar.button("🗑️ Reset Demo", width="stretch"):
        st.session_state["reset_armed"] = True
        st.rerun()
else:
    st.sidebar.warning("This wipes the dataset, all traces/scores, "
                       "experiment records and reports.")
    if st.sidebar.button("⚠️ Confirm reset", width="stretch"):
        with st.spinner("Resetting..."):
            clear_tool_test_requirements()
            init_runtime.clear()
            summary = backend.reset(DATASET_NAME)
            reports_dir = Path("reports")
            if reports_dir.exists():
                shutil.rmtree(reports_dir)
        st.session_state["reset_armed"] = False
        st.session_state["run_log"] = []
        st.toast(f"Reset done: {summary.get('dataset_items', 0)} dataset items, "
                 f"{summary.get('traces', 0)} traces, "
                 f"{summary.get('experiments', 0)} experiments removed",
                 icon="🗑️")
        st.rerun()
    if st.sidebar.button("Cancel", width="stretch"):
        st.session_state["reset_armed"] = False
        st.rerun()

# ---------------- Tabs ----------------

tab_dataset, tab_trace, tab_scores, tab_report = st.tabs(
    ["📋 Dataset", "🕐 Trace Timeline", "📊 Scores", "📄 Report"])

with tab_dataset:
    with st.expander("Add a custom test case", expanded=True):
        with st.form("add_case_form_top"):
            query = st.text_input(
                "Query", placeholder="e.g. Query the salary of employee Carol")
            c1, c2 = st.columns(2)
            role = c1.selectbox("User role", list(config.roles.keys()), key="top_role")
            tool = c2.selectbox("Target tool", list(config.tools.keys()), key="top_tool")
            submitted = st.form_submit_button("Add case")
        if submitted:
            if not query.strip():
                st.warning("Query must not be empty.")
            else:
                scenario, expected = compute_case(config, tool, role)
                backend.add_dataset_item(DATASET_NAME, DatasetItemRecord(
                    id=uuid.uuid4().hex,
                    input={"query": query.strip(), "user_id": f"user_custom_{role}",
                           "user_role": role}, expected_output=expected,
                    metadata={"scenario": scenario, "tool_name": tool,
                              "user_role": role, "custom": True},
                ))
                st.toast(f"Case added as scenario `{scenario}`", icon="✅")
                st.rerun()
    st.caption(
        "The dataset is auto-generated from **config/tools.yaml**: the "
        "tool-sensitivity × role-permission matrix yields 4 scenario classes "
        "(normal_low / normal_high / deny_no_permission / deny_insufficient, "
        "2 cases each) plus one injected failing case (`demo_bypass`). "
        "Add your own case below — the scenario and expected outcome are "
        "derived from the same matrix.")
    if not dataset_items:
        st.info("Dataset is empty. Click '1. Generate Dataset' in the sidebar.")
    else:
        rows = [{
            "scenario": it.metadata.get("scenario"),
            "user_role": it.input.get("user_role"),
            "query": it.input.get("query"),
            "expected_tool": it.expected_output.get("expected_tool_called"),
            "expected_outcome": it.expected_output.get("expected_outcome"),
            "expected_guard": it.expected_output.get("expected_guard_result"),
        } for it in dataset_items]
        scenario_filter = st.selectbox(
            "Filter by scenario", ["All"] + sorted({r["scenario"] for r in rows}))
        if scenario_filter != "All":
            rows = [r for r in rows if r["scenario"] == scenario_filter]
        st.dataframe(pd.DataFrame(rows), width="stretch")

    with st.expander("Add a custom test case"):
        with st.form("add_case_form"):
            query = st.text_input(
                "Query", placeholder="e.g. Query the salary of employee Carol")
            c1, c2 = st.columns(2)
            role = c1.selectbox("User role", list(config.roles.keys()))
            tool = c2.selectbox("Target tool", list(config.tools.keys()))
            submitted = st.form_submit_button("Add case")
        if submitted:
            if not query.strip():
                st.warning("Query must not be empty.")
            else:
                scenario, expected = compute_case(config, tool, role)
                backend.add_dataset_item(DATASET_NAME, DatasetItemRecord(
                    id=uuid.uuid4().hex,
                    input={"query": query.strip(),
                           "user_id": f"user_custom_{role}",
                           "user_role": role},
                    expected_output=expected,
                    metadata={"scenario": scenario, "tool_name": tool,
                              "user_role": role, "custom": True},
                ))
                st.toast(f"Case added as scenario `{scenario}`", icon="✅")
                st.rerun()

with tab_trace:
    if st.session_state["run_log"]:
        st.subheader("🖥️ Run console")
        st.code("\n".join(st.session_state["run_log"]), language="text")
        st.divider()

    if not traces:
        st.info(f"No traces under experiment '{experiment_name}'. "
                "Run the evaluation first.")
    else:
        options = {f"{t.metadata.get('scenario', '?')} | {t.name}": t
                   for t in traces}
        selected = st.selectbox("Select a trace", list(options.keys()))
        trace = options[selected]

        m = trace.metadata
        bug = f" · 🐛 injected bug: `{m.get('inject_bug')}`" if m.get("inject_bug") else ""
        st.caption(
            f"scenario `{m.get('scenario', '?')}` · role `{m.get('user_role', '?')}`"
            f" · tool `{m.get('tool_name') or '-'}` · user `{trace.user_id}`{bug}")

        col_a, col_b = st.columns(2)
        col_a.metric("permission_compliance",
                     trace.get_score(COMPLIANCE))
        col_b.metric("execution_correctness",
                     trace.get_score(EXECUTION))

        # Gantt timeline (pre-order, name indentation shows the hierarchy)
        ordered: list[tuple[SpanRecord, int]] = []

        def walk(span: SpanRecord, depth: int) -> None:
            ordered.append((span, depth))
            for child in trace.children_of(span.id):
                walk(child, depth + 1)

        for root in trace.roots():
            walk(root, 0)

        df = pd.DataFrame([{
            "span": ("　" * depth) + s.name,
            "start": s.start_time,
            "end": s.end_time or s.start_time,
            "kind": s.name,
        } for s, depth in ordered])
        fig = px.timeline(df, x_start="start", x_end="end", y="span",
                          color="kind")
        fig.update_yaxes(autorange="reversed")
        fig.update_layout(height=100 + 40 * len(df), showlegend=False)
        st.plotly_chart(fig, width="stretch")

        # Span tree (nested expanders + JSON)
        def render_tree(span: SpanRecord) -> None:
            duration = ""
            if span.end_time:
                ms = (span.end_time - span.start_time).total_seconds() * 1000
                duration = f" · {ms:.0f}ms"
            with st.expander(f"**{span.name}**{duration}", expanded=True):
                c1, c2 = st.columns(2)
                with c1:
                    st.caption("input")
                    st.json(span.input or {})
                with c2:
                    st.caption("output")
                    st.json(span.output or {})
                if span.metadata:
                    st.caption("metadata")
                    st.json(span.metadata)
                for child in trace.children_of(span.id):
                    render_tree(child)

        for root in trace.roots():
            render_tree(root)

with tab_scores:
    if not has_scores:
        st.info("No scores yet. Run the evaluation first.")
    else:
        stats = aggregate(traces)
        k1, k2, k3, k4 = st.columns(4)
        k1.metric("Total cases", stats["total"])
        k2.metric("Compliance pass rate",
                  f"{stats['passed']}/{stats['total']}")
        k3.metric("Avg compliance", f"{stats['avg_compliance']:.2f}")
        k4.metric("Avg execution", f"{stats['avg_execution']:.2f}")

        st.subheader("By Scenario")
        rows = []
        for scenario, stat in stats["scenario_stats"].items():
            rows.append({
                "scenario": scenario,
                "cases": stat["total"],
                "passed": stat["passed"],
                "failed": stat["total"] - stat["passed"],
            })
        st.dataframe(pd.DataFrame(rows), width="stretch")

        st.subheader("Case Details")
        st.dataframe(styled_cases_df(traces), width="stretch")

        failures = [t for t in traces if t.get_score(COMPLIANCE) != 1.0]
        if failures:
            st.subheader("Failures")
            for t in failures:
                st.error(f"**{t.metadata.get('scenario')}** · {t.name} — "
                         f"{case_reason(t) or 'no reason recorded'}")

with tab_report:
    report_path = Path("reports") / f"report_{experiment_name}.md"
    if not report_path.exists():
        st.info("Report not generated yet. Click '3. Generate Report' in the sidebar.")
    elif not traces:
        st.info("No traces found for this experiment.")
    else:
        stats = aggregate(traces)
        failures = [t for t in traces if t.get_score(COMPLIANCE) != 1.0]

        status, status_summary = report_status(traces)
        render_status_banner(status, status_summary)

        st.subheader("Overview")
        k1, k2, k3, k4 = st.columns(4)
        k1.metric("Total cases", stats["total"])
        k2.metric("Compliance pass rate",
                  f"{stats['passed']}/{stats['total']}")
        k3.metric("Avg compliance", f"{stats['avg_compliance']:.2f}")
        k4.metric("Avg execution", f"{stats['avg_execution']:.2f}")

        st.subheader("Results by Case")
        st.dataframe(styled_cases_df(traces), width="stretch")

        st.subheader("Failure Analysis")
        if not failures:
            st.markdown(
                f"<div style='padding:12px;border-radius:8px;"
                f"background-color:{PASS_BG};color:{PASS_FG}'>"
                f"✅ All cases passed permission compliance.</div>",
                unsafe_allow_html=True)
        for t in failures:
            with st.container(border=True):
                st.markdown(
                    f"<span style='color:{FAIL_FG};font-weight:600'>"
                    f"❌ FAILED — {case_reason(t) or 'unknown reason'}</span>",
                    unsafe_allow_html=True)
                c1, c2 = st.columns(2)
                guard = t.find_span("permission_guard")
                c1.markdown(f"**Scenario:** `{t.metadata.get('scenario')}`  \n"
                            f"**Role:** `{t.metadata.get('user_role')}`  \n"
                            f"**Tool:** `{t.metadata.get('tool_name')}`")
                c2.markdown(
                    f"**Guard span:** `{'present' if guard else 'MISSING'}`  \n"
                    f"**Scores:** compliance={t.get_score(COMPLIANCE)}, "
                    f"execution={t.get_score(EXECUTION)}  \n"
                    f"**Trace:** `{t.trace_id[:12]}…`")

        st.divider()
        md = report_path.read_text(encoding="utf-8")
        st.download_button("Download report.md", md,
                           file_name=report_path.name)
        with st.expander("Raw markdown report"):
            st.markdown(md)
