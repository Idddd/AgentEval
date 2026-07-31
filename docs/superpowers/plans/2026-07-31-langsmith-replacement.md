# LangSmith replacement implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Langfuse with LangSmith while retaining the existing generated demo cases, evaluator, dashboard, report, and Local JSON fallback.

**Architecture:** A LangSmith SDK adapter implements the existing backend protocols. Root runs group an evaluation into a LangSmith project; child runs represent existing spans and are reconstructed to the unchanged normalized trace model.

**Tech Stack:** Python 3.12, `langsmith`, pytest, Streamlit.

## Global Constraints

- Completely remove Langfuse dependency, settings, backend code, and self-hosted assets.
- Preserve the existing `generate -> run -> report` UI and CLI case flow.
- Use Local JSON if Cloud LangSmith credentials are unavailable.
- Configure Cloud LangSmith with `LANGSMITH_API_KEY`, optional `LANGSMITH_ENDPOINT`, and optional `LANGSMITH_WORKSPACE_ID`.
- Start every behavior change with a focused failing pytest assertion.

---

## File structure

- `src/settings.py`: LangSmith environment configuration and connectivity probe.
- `src/backends/langsmith_backend.py`: tracer, SDK persistence, readback conversion.
- `src/backends/base.py`: remote-backend selection.
- `tests/test_settings.py` and `tests/test_langsmith_backend.py`: adapter contract tests using a fake client.
- `.env.example`, `requirements.txt`, `README.md`, `app.py`, `agent_permission_eval_spec.md`: user-facing migration.
- Remove: `src/backends/langfuse_backend.py`, `langfuse/`.

### Task 1: Configure and select LangSmith

**Files:** Modify `src/settings.py`, `src/backends/base.py`, `.env.example`, `requirements.txt`; create `tests/test_settings.py`.

**Interfaces:** Add `Settings.langsmith_api_key`, `langsmith_endpoint`, `langsmith_workspace_id`, `langsmith_enabled`; have `get_backend()` select `LangsmithBackend` when enabled.

- [ ] **Step 1: Write the failing tests**

```python
def test_load_settings_enables_langsmith_after_successful_probe(monkeypatch):
    monkeypatch.setenv("LANGSMITH_API_KEY", "lsv2_pt_test")
    monkeypatch.setattr("langsmith.Client", lambda **_: FakeClient())
    assert load_settings().langsmith_enabled is True

def test_load_settings_uses_local_mode_when_probe_fails(monkeypatch):
    monkeypatch.setenv("LANGSMITH_API_KEY", "lsv2_pt_test")
    monkeypatch.setattr("langsmith.Client", lambda **_: FailingClient())
    assert load_settings().langsmith_enabled is False
```

- [ ] **Step 2: Verify red**

Run: `.venv\Scripts\python.exe -m pytest tests/test_settings.py -q`

Expected: FAIL because no LangSmith fields or probe exist.

- [ ] **Step 3: Implement minimum configuration**

```python
if probe and s.langsmith_api_key:
    try:
        Client(api_key=s.langsmith_api_key, api_url=s.langsmith_endpoint).list_projects(limit=1)
        s.langsmith_enabled = True
    except Exception:
        s.langsmith_enabled = False
```

Replace Langfuse requirement and environment variables; select the new backend from `get_backend()`.

- [ ] **Step 4: Verify green**

Run: `.venv\Scripts\python.exe -m pytest tests/test_settings.py tests/test_local_backend.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/settings.py src/backends/base.py .env.example requirements.txt tests/test_settings.py
git commit -m "feat: configure LangSmith backend"
```

### Task 2: Implement trace creation and normalized readback

**Files:** Create `src/backends/langsmith_backend.py`, `tests/test_langsmith_backend.py`.

**Interfaces:** `LangsmithTracer.start_trace()` creates a root `chain` run using `tags[0]` as project; `span()` creates nested child runs; `LangsmithStore.get_trace()` returns the current `TraceRecord` shape; `list_traces(tag)` returns matching roots.

- [ ] **Step 1: Write the failing round-trip test**

```python
def test_trace_roundtrip_rebuilds_nested_span_tree(tmp_path):
    client = FakeLangsmithClient()
    backend = LangsmithBackend(Settings(data_dir=tmp_path), client=client)
    store = LangsmithStore(Settings(data_dir=tmp_path), client=client)
    with backend.tracer.start_trace("agent-run-test", user_id="u1", tags=["exp_test"], metadata={"scenario": "s"}):
        with backend.tracer.span("permission_guard", input={"user_role": "hr"}) as span:
            span.set_output({"granted": True})
    trace = store.get_trace(backend.tracer.last_trace_id())
    assert trace.find_span("permission_guard").output == {"granted": True}
    assert [run.trace_id for run in store.list_traces(tag="exp_test")] == [trace.trace_id]
```

- [ ] **Step 2: Verify red**

Run: `.venv\Scripts\python.exe -m pytest tests/test_langsmith_backend.py::test_trace_roundtrip_rebuilds_nested_span_tree -q`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement minimum adapter**

```python
client.create_run(id=root_id, name=name, run_type="chain", project_name=project, inputs={}, extra={"metadata": metadata})
client.create_run(id=child_id, name=name, run_type="chain", parent_run_id=parent_id, inputs=input or {}, extra={"metadata": metadata or {}})
client.update_run(child_id, outputs=output, end_time=datetime.now(timezone.utc))
```

Use a thread-local run stack, UUID run IDs, `read_run`, and `list_runs(trace_id=...)`; convert child runs to `SpanRecord`s and root feedback to `ScoreRecord`s.

- [ ] **Step 4: Verify green**

Run: `.venv\Scripts\python.exe -m pytest tests/test_langsmith_backend.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/backends/langsmith_backend.py tests/test_langsmith_backend.py
git commit -m "feat: add LangSmith trace backend"
```

### Task 3: Implement dataset, feedback, experiment, and reset mappings

**Files:** Modify `src/backends/langsmith_backend.py`, `tests/test_langsmith_backend.py`.

**Interfaces:** `DatasetItemRecord` maps to LangSmith examples; score writes use feedback; experiment registry remains local for UI compatibility and says `backend: "langsmith"`; reset best-effort deletes named remote demo data.

- [ ] **Step 1: Write failing dataset and feedback tests**

```python
def test_dataset_and_feedback_mapping(tmp_path):
    client, backend = fake_backend(tmp_path)
    item = DatasetItemRecord(id="case-1", input={"query": "q"}, expected_output={"expected": "x"}, metadata={"scenario": "s"})
    backend.create_dataset("demo", [item])
    assert client.examples[0]["inputs"] == item.input
    backend.save_score("run-1", "permission_compliance", 1.0, "ok")
    assert client.feedback == [{"run_id": "run-1", "key": "permission_compliance", "score": 1.0, "comment": "ok"}]
```

- [ ] **Step 2: Verify red**

Run: `.venv\Scripts\python.exe -m pytest tests/test_langsmith_backend.py::test_dataset_and_feedback_mapping -q`

Expected: FAIL because the operations are incomplete.

- [ ] **Step 3: Implement mappings**

```python
dataset = client.create_dataset(dataset_name=name, description="Agent permission compliance evaluation cases")
client.create_examples(dataset_id=dataset.id, examples=[{"inputs": item.input, "outputs": item.expected_output, "metadata": item.metadata} for item in items])
client.create_feedback(run_id=trace_id, key=name, score=value, comment=comment)
```

Use client listing/deletion APIs to fetch examples, replace datasets, list experiments, and best-effort delete demo root runs.

- [ ] **Step 4: Verify green**

Run: `.venv\Scripts\python.exe -m pytest tests/test_langsmith_backend.py tests/test_local_backend.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/backends/langsmith_backend.py tests/test_langsmith_backend.py
git commit -m "feat: persist LangSmith datasets and feedback"
```

### Task 4: Remove Langfuse and update the demo surface

**Files:** Modify `app.py`, `README.md`, `agent_permission_eval_spec.md`; delete `src/backends/langfuse_backend.py`, `langfuse/`; modify `tests/ui_smoke.py`.

**Interfaces:** Sidebar calls remote mode `LangSmith`; documentation only instructs Cloud LangSmith; no `langfuse` code/assets remain.

- [ ] **Step 1: Write the failing UI assertion**

```python
def test_sidebar_calls_remote_backend_langsmith():
    app = AppTest.from_file("app.py").run()
    assert "Trace Backend: LangSmith" in rendered_sidebar_text(app)
```

- [ ] **Step 2: Verify red**

Run: `.venv\Scripts\python.exe -m pytest tests/ui_smoke.py -q`

Expected: FAIL because the sidebar still says Langfuse.

- [ ] **Step 3: Apply the replacement**

```python
if settings.langsmith_enabled:
    st.sidebar.success("Trace Backend: LangSmith")
else:
    st.sidebar.warning("Trace Backend: Local JSON (no LangSmith credentials)")
```

Replace Langfuse docs and setup details, remove the old backend/assets, and confirm no remaining `langfuse` matches with `rg -n -i langfuse`.

- [ ] **Step 4: Verify green**

Run: `.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp; .venv\Scripts\python.exe tests\ui_smoke.py`

Expected: PASS and preserve the intentional `demo_bypass` failure in the demo result.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: replace Langfuse demo with LangSmith"
```

### Task 5: Verify the real Cloud LangSmith demo

**Files:** Modify only if a focused failing regression test identifies a defect.

**Interfaces:** A valid `.env` key permits `main.py --step all` to create current demo cases, root/child runs, and two feedback scores in LangSmith.

- [ ] **Step 1: Check enabled mode without revealing credentials**

Run: `.venv\Scripts\python.exe -c "from src.settings import load_settings; assert load_settings().langsmith_enabled, 'LangSmith credentials unavailable'; print('LangSmith enabled')"`

Expected: `LangSmith enabled`.

- [ ] **Step 2: Run the unchanged demo flow remotely**

Run: `.venv\Scripts\python.exe main.py --step all --experiment langsmith_smoke`

Expected: generated cases complete, score writes succeed, and the intended `demo_bypass` case remains a compliance failure.

- [ ] **Step 3: Verify remote readback**

Run: `.venv\Scripts\python.exe -c "from src.backends.base import get_backend; _, store = get_backend(refresh=True); traces = store.list_traces(tag='langsmith_smoke'); assert traces and all(t.scores for t in traces); assert any(t.metadata.get('inject_bug') == 'skip_guard' for t in traces); print(len(traces))"`

Expected: a positive trace count, two feedback scores per trace, and the original intentional failing case.

- [ ] **Step 4: Commit a defect fix only after red-green verification**

```powershell
git add <verified-files>
git commit -m "fix: complete LangSmith demo flow"
```

## Plan self-review

- Spec coverage: Tasks 1–4 replace Langfuse, add Cloud configuration, retain Local JSON, preserve the case flow, and map runs/datasets/feedback. Task 5 verifies the live demo.
- Placeholder scan: no deferred behavior or ambiguous interfaces are present; the conditional final commit avoids an empty commit.
- Type consistency: adapter classes match the existing `TraceBackend`, `TraceStore`, and `Tracer` protocols; experiment names retain the existing single-item tag transport.

