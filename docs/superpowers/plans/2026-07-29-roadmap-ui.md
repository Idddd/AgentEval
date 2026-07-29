# Roadmap 功能卡片式占位 UI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 6 个 roadmap 功能以「简介 + 用法说明 + 禁用模拟控件」的卡片形式嵌入 Streamlit 各相关 Tab 底部，替换侧边栏的禁用按钮组。

**Architecture:** 新增 `src/ui_roadmap.py` 纯展示模块（通用卡片函数 + 6 个卡片渲染函数），`app.py` 三个 Tab 底部各调用两个卡片函数；无任何业务逻辑改动。

**Tech Stack:** Streamlit（含 AppTest 无头测试）、Python 3.12

## Global Constraints

- 所有 UI 文案英文（项目约定：除计划/设计 MD 外全英文）
- 所有模拟控件必须 `disabled=True`，卡片内不得出现任何可交互生效的控件
- 不得改动 `src/` 下既有业务模块（agent/evaluator/backends 等）
- 验证命令统一用项目内 venv：`.\.venv\Scripts\python.exe`
- pytest 需加 `--basetemp=.pytest_tmp`（系统 Temp 目录权限受限）
- 设计依据：`docs/superpowers/specs/2026-07-29-roadmap-ui-design.md`

---

### Task 1: 新建 src/ui_roadmap.py（通用卡片 + 6 张卡片）

**Files:**
- Create: `src/ui_roadmap.py`
- Test: `tests/ui_smoke.py`（Task 2 中补断言）

**Interfaces:**
- Consumes: 仅 `streamlit`
- Produces（供 app.py 调用，全部返回 None）:
  - `render_roadmap_card(title: str, what: str, how: str, controls: Callable[[], None]) -> None`
  - `render_adversarial_dataset_card()`
  - `render_multi_turn_card()`
  - `render_real_tools_card()`
  - `render_standalone_guard_card()`
  - `render_llm_judge_card()`
  - `render_reflector_card()`

- [ ] **Step 1: 创建 `src/ui_roadmap.py`，完整内容如下**

```python
"""Roadmap feature placeholder cards (not yet implemented).

Each card explains what the feature does, how it will work once built,
and shows a disabled preview of its future controls.
"""
from __future__ import annotations

from typing import Callable

import streamlit as st


def render_roadmap_card(title: str, what: str, how: str,
                        controls: Callable[[], None]) -> None:
    """Uniform roadmap card: title + COMING SOON badge, what/how, disabled controls."""
    with st.container(border=True):
        st.markdown(f"#### 🚧 {title} · `COMING SOON`")
        st.markdown(f"**What it does:** {what}")
        st.markdown(f"**How it will work:** {how}")
        controls()


def render_adversarial_dataset_card() -> None:
    def controls() -> None:
        st.multiselect(
            "Attack types",
            ["prompt injection", "jailbreak", "role escalation"],
            default=["prompt injection"], disabled=True)
        st.slider("Cases per attack type", 1, 20, 5, disabled=True)
        st.button("Generate adversarial cases", disabled=True)

    render_roadmap_card(
        "Adversarial Dataset Generation",
        "Auto-generate attack cases (prompt injection, jailbreak, role "
        "escalation) to stress-test the Permission Guard.",
        "The dataset will gain an `adversarial` scenario class, and compliance "
        "scores will show whether the guard holds up under attack.",
        controls)


def render_multi_turn_card() -> None:
    def controls() -> None:
        st.toggle("Enable multi-turn sessions", disabled=True)
        st.slider("Turns per session", 2, 10, 4, disabled=True)

    render_roadmap_card(
        "Multi-turn Conversations",
        "Evaluate multi-turn sessions, e.g. privilege-escalation attempts "
        "spread across turns.",
        "Dataset items will carry a conversation script instead of a single "
        "query, and traces will contain one span tree per turn.",
        controls)


def render_real_tools_card() -> None:
    def controls() -> None:
        for tool, url in [
            ("WeatherTool", "https://api.weather.example/v1"),
            ("EmployeeQueryTool", "https://hr.internal.example/api"),
            ("SystemRestartTool", "https://ops.internal.example/restart"),
        ]:
            c1, c2 = st.columns([3, 1])
            c1.text_input(f"{tool} endpoint", value=url, disabled=True)
            c2.toggle(f"{tool}: use real API", disabled=True)

    render_roadmap_card(
        "Real Tool Calls",
        "Replace the mock tools with real API integrations.",
        "The `tool_execution` spans will show real latency and real errors, "
        "and `execution_correctness` will validate against live responses.",
        controls)


def render_standalone_guard_card() -> None:
    def controls() -> None:
        st.text_input("Guard endpoint URL",
                      value="https://guard.internal.example/check",
                      disabled=True)
        st.button("Deploy guard service", disabled=True)

    render_roadmap_card(
        "Standalone Permission Guard",
        "Deploy the Permission Guard as a separate service so policies are "
        "managed centrally across agents.",
        "The `permission_guard` span will become a remote call; the evaluator "
        "rules stay unchanged because the span contract is preserved.",
        controls)


def render_llm_judge_card() -> None:
    def controls() -> None:
        st.selectbox("Judge model",
                     ["deepseek-v4-pro[1m]", "deepseek-v4-flash", "gpt-4o-mini"],
                     disabled=True)
        st.text_area(
            "Rubric",
            value="Score 0-1: Is the refusal polite? Is the answer grounded "
                  "in the tool output?",
            disabled=True)
        st.button("Run LLM Judge", disabled=True)

    render_roadmap_card(
        "LLM-as-Judge",
        "Add subjective response-quality scoring by an LLM, covering what "
        "deterministic rules cannot judge.",
        "Every trace will gain a third score `llm_judge_quality`, shown "
        "alongside permission_compliance and execution_correctness.",
        controls)


def render_reflector_card() -> None:
    def controls() -> None:
        st.slider("Max optimization iterations", 1, 10, 3, disabled=True)
        st.button("Analyze failures & suggest fixes", disabled=True)

    render_roadmap_card(
        "Reflector Auto-optimization",
        "Close the loop: analyze failing cases, attribute root causes, "
        "generate improvement suggestions, and re-run the evaluation.",
        "This tab will gain an optimization history section showing each "
        "iteration's score delta and the applied fix.",
        controls)
```

- [ ] **Step 2: 语法检查**

Run: `.\.venv\Scripts\python.exe -m py_compile src/ui_roadmap.py`
Expected: 无输出，退出码 0

---

### Task 2: app.py 集成（删侧边栏按钮组 + 三 Tab 嵌入卡片）

**Files:**
- Modify: `app.py`

**Interfaces:**
- Consumes: Task 1 的 6 个卡片函数
- Produces: 无新接口

- [ ] **Step 1: 删除侧边栏 roadmap 按钮组**

删除 `ROADMAP_FEATURES = [...]` 整个列表（约第 28-35 行）和以下代码块：

```python
st.sidebar.divider()
st.sidebar.subheader("Roadmap (not in this version)")
for label, help_text in ROADMAP_FEATURES:
    st.sidebar.button(f"🚧 {label}", width="stretch",
                      disabled=True, help=f"Planned: {help_text}")
```

- [ ] **Step 2: 添加 import**

在 `from src.settings import load_settings` 之后添加：

```python
from src.ui_roadmap import (
    render_adversarial_dataset_card,
    render_llm_judge_card,
    render_multi_turn_card,
    render_real_tools_card,
    render_reflector_card,
    render_standalone_guard_card,
)
```

- [ ] **Step 3: Dataset Tab 底部嵌入 2 张卡片**

在 `tab_dataset` 块的 `st.dataframe(...)`（含 if/else 两分支）之后、即 `with tab_trace:` 之前插入：

```python
    st.divider()
    st.subheader("Roadmap")
    render_adversarial_dataset_card()
    render_multi_turn_card()
```

- [ ] **Step 4: Trace Timeline Tab 底部嵌入 2 张卡片**

在 `tab_trace` 块末尾（`for root in trace.roots(): render_tree(root)` 之后）、`with tab_scores:` 之前插入（注意与 tab_trace 内容同级缩进）：

```python
    st.divider()
    st.subheader("Roadmap")
    render_real_tools_card()
    render_standalone_guard_card()
```

- [ ] **Step 5: Scores Tab 底部嵌入 2 张卡片**

在 `tab_scores` 块末尾（failures 的 `st.error(...)` for 循环之后）、`with tab_report:` 之前插入：

```python
    st.divider()
    st.subheader("Roadmap")
    render_llm_judge_card()
    render_reflector_card()
```

- [ ] **Step 6: 语法检查 + 裸跑冒烟**

Run: `.\.venv\Scripts\python.exe -m py_compile app.py; .\.venv\Scripts\python.exe app.py`
Expected: 退出码 0，无 Python Traceback（streamlit bare-mode 警告可忽略）

---

### Task 3: tests/ui_smoke.py 补卡片断言并全量回归

**Files:**
- Modify: `tests/ui_smoke.py`

**Interfaces:**
- Consumes: Task 2 完成的 app.py
- Produces: 无

- [ ] **Step 1: 在 `main()` 的 `at.run()` 初始断言之后插入卡片断言**

在 `assert not at.exception, f"initial render failed: {at.exception}"` 之后添加：

```python
    # Roadmap placeholder cards: all 6 present, all controls disabled
    md_texts = " ".join(m.value for m in at.markdown)
    for title in [
        "Adversarial Dataset Generation",
        "Multi-turn Conversations",
        "Real Tool Calls",
        "Standalone Permission Guard",
        "LLM-as-Judge",
        "Reflector Auto-optimization",
    ]:
        assert title in md_texts, f"roadmap card missing: {title}"

    roadmap_buttons = [b for b in at.button if b.label in (
        "Generate adversarial cases", "Deploy guard service",
        "Run LLM Judge", "Analyze failures & suggest fixes")]
    assert len(roadmap_buttons) == 4, \
        f"expected 4 roadmap buttons, got {len(roadmap_buttons)}"
    assert all(b.disabled for b in roadmap_buttons), \
        "roadmap buttons must be disabled"
```

- [ ] **Step 2: 全量运行 UI 冒烟（含真实按钮全流程）**

Run: `.\.venv\Scripts\python.exe tests\ui_smoke.py`
Expected: 输出 `UI SMOKE OK`，退出码 0（会真实调用 DeepSeek 跑 8 条评估，约 1 分钟）

- [ ] **Step 3: 跑单测回归**

Run: `.\.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp`
Expected: `17 passed`

- [ ] **Step 4: 重启后台 Streamlit 服务并验证健康端点**

先 TaskStop 旧后台任务，再：
`.\.venv\Scripts\streamlit.exe run app.py --server.headless true --server.port 8501`（后台）
轮询 `http://localhost:8501/healthz` 返回 200 即完成。
