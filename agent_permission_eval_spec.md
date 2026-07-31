# Agent Permission Compliance Eval Demo — Implementation Spec

> Goal: implement the complete loop “tool definitions → generated Dataset →
> Agent execution → deterministic Code Eval → Markdown Report”.
>
> Stack: Python, LangSmith SDK, Streamlit, and optional
> Anthropic-compatible/OpenAI intent analysis.
>
> Graceful degradation: when the LangSmith key is absent or its connectivity
> probe fails, datasets, traces, scores, and experiments use Local JSON under
> `data/`. When no LLM credential is usable, intent analysis uses deterministic
> rules. Every credential combination runs the same demo flow.

## 1. Project structure

```text
agent-permission-eval/
├── config/
│   └── tools.yaml
├── data/                         # Local store and Cloud experiment index
├── reports/                      # Generated Markdown reports
├── src/
│   ├── settings.py               # Environment loading and mode probe
│   ├── config_loader.py          # Tool/role configuration
│   ├── models.py                 # Normalized trace, span, and score records
│   ├── backends/
│   │   ├── base.py               # Tracer/TraceBackend/TraceStore protocols
│   │   ├── langsmith_backend.py  # Cloud adapter
│   │   └── local_backend.py      # Local JSON adapter
│   ├── intent.py
│   ├── tools_mock.py
│   ├── dataset_generator.py
│   ├── agent.py
│   ├── eval_runner.py
│   ├── code_evaluator.py
│   └── report_generator.py
├── app.py
├── main.py
├── tests/
├── requirements.txt
└── .env                          # Optional; ignored by Git
```

Normalized models and backend protocols are provider-independent and must not
be renamed as part of backend work.

## 2. Environment

### 2.1 Runtime dependencies

```text
langsmith>=0.10.14,<0.11
openai>=1.0.0
anthropic>=0.40.0
pyyaml>=6.0
python-dotenv>=1.0.0
streamlit>=1.35
plotly>=5.20
pandas>=2.0
pytest>=8.0
```

### 2.2 `.env`

```dotenv
# Optional Cloud tracing. Failed/missing access selects Local JSON.
LANGSMITH_API_KEY=
LANGSMITH_ENDPOINT=
LANGSMITH_WORKSPACE_ID=

# Preferred optional intent analyzer.
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_AUTH_TOKEN=
ANTHROPIC_MODEL=deepseek-v4-flash

# Alternative optional intent analyzer.
OPENAI_API_KEY=
```

`LANGSMITH_ENDPOINT` overrides the SDK API endpoint. It is not a project page
URL. `LANGSMITH_WORKSPACE_ID` is passed through when set, for credentials that
require explicit workspace scoping.

`load_settings()` performs a lightweight `Client.list_projects(limit=1)`
probe. Cloud mode is enabled only when a key exists and the probe succeeds.
All exceptions during the probe select Local JSON; no live access is required
for tests or the offline demo. Each entry point resolves settings once and
passes that exact object to a refreshed backend factory, so the displayed mode
and selected store cannot diverge after an alternating probe.

Cloud mode uploads trace inputs, user IDs, custom queries, and tool outputs.
Use synthetic, non-sensitive demo data only.

### 2.3 `config/tools.yaml`

```yaml
tools:
  - name: WeatherTool
    description: Query the weather of a given city
    sensitivity: low
    required_role: null
  - name: EmployeeQueryTool
    description: Query sensitive employee information
    sensitivity: high
    required_role: hr
  - name: SystemRestartTool
    description: Restart production services
    sensitivity: high
    required_role: admin

roles:
  - name: guest
    permissions: [WeatherTool]
  - name: employee
    permissions: [WeatherTool]
  - name: hr
    permissions: [WeatherTool, EmployeeQueryTool]
  - name: admin
    permissions: [WeatherTool, EmployeeQueryTool, SystemRestartTool]
```

## 3. Backend contract and provider mappings

`src/backends/base.py` exposes the write-side `Tracer` and `TraceBackend`
protocols and the read-side `TraceStore` protocol. Both adapters must return
the normalized records defined in `src/models.py`.

### 3.1 Runs and spans

- `Tracer.start_trace()` creates a root LangSmith Run with a generated UUID as
  both Run ID and trace ID.
- The first experiment tag maps to the remote project
  `agenteval__{experiment}`; all supplied public tags remain on the root Run.
- Root metadata is written under `extra.metadata`, with `user_id` and the
  durable `agent_eval_owner: "AgentEval"` marker included.
- Each `Tracer.span()` creates a child Run with the same `trace_id` and the
  active Run as `parent_run_id`.
- Child inputs, outputs, metadata, start/end times, and errors map directly to
  the corresponding Run fields.
- The tracer maintains a thread-local parent stack so nested spans and
  concurrent traces do not cross.
- `flush()` drains the SDK queue when the client exposes a flush/drain API.

`LangsmithStore.get_trace()` reads the root Run, lists Runs sharing its trace
ID, excludes the root from the span list, and maps child Runs into
`SpanRecord`s. `list_traces(tag=experiment)` lists root Runs in the matching
prefixed project and normalizes each one. A lazily raised
`LangSmithNotFoundError` for a not-yet-created project maps to an empty list;
other read failures surface.

Cloud reads are eventually consistent. `get_trace(retry=True)` attempts up to
20 reads, waiting 0.5 seconds between attempts. `retry=False` reads once.
Local JSON writes synchronously and uses the same method contract.

### 3.2 Datasets and examples

- Public dataset name `name` maps to the remote
  `agenteval__{name}` Dataset. `create_dataset(..., replace=True)` replaces
  only that exact prefixed Dataset, then bulk-creates Examples; an external
  unprefixed same-name Dataset is never touched.
- `DatasetItemRecord.input` maps to Example `inputs`.
- `DatasetItemRecord.expected_output` maps to Example `outputs`.
- `DatasetItemRecord.metadata` maps to Example `metadata`.
- `get_dataset_items()` maps Examples back to normalized dataset items.
- `add_dataset_item()` creates one Example and supports the UI custom-case
  flow.

The Local JSON adapter stores the corresponding values in
`data/dataset.json`.

### 3.3 Scores and feedback

`save_score(trace_id, name, value, comment)` creates LangSmith Feedback on the
root Run:

| Normalized field | Feedback field |
|---|---|
| `trace_id` | Run ID |
| score `name` | `key` |
| numeric `value` | `score` |
| optional explanation | `comment` |

The backend reads and caches the root Run's `session_id`, then supplies it with
the public SDK's keyword arguments when creating Feedback. The Cloud reader
requests Feedback for the root Run and maps each numeric item into a
`ScoreRecord`. Local JSON writes the same normalized scores into the stored
trace.

### 3.4 Experiment registration and reset

There is no separate remote experiment record in this demo. The public
experiment name groups Runs in `agenteval__{experiment}`, while
`data/experiments.json` records the public name, dataset, cumulative owned root
IDs, creation time, backend, and exact remote project name. Backend-qualified
registry keys allow Local JSON and LangSmith entries with the same public name
to coexist. Reports and the UI continue to expose only public names.

Cloud reset:

1. Best-effort count and delete only the prefixed Dataset and its Examples.
2. Process only registry entries whose backend is `langsmith`.
3. Materialize every root Run in each exact prefixed project. Delete the
   project only when every root has the AgentEval owner marker and every root
   ID is among that registry entry's cumulative owned IDs.
4. Isolate each project operation. A listing/deletion failure or any
   foreign/unrecorded root retains both the remote project and registry entry.
5. Remove only successfully cleaned LangSmith entries and preserve every
   other-backend entry. Summaries count confirmed deletions.

Local reset deletes the local dataset entry and trace file, removes only
`local-json` experiment entries, and preserves LangSmith/other-backend entries.
The Streamlit reset handler additionally deletes generated reports and clears
custom test requirements. Reset remains a two-click confirmation flow.

## 4. Dataset generation

`DatasetGenerator` derives cases from tool sensitivity and the role permission
matrix, then writes them through `TraceBackend`.

| Scenario | Condition | Expected behavior |
|---|---|---|
| `normal_low` | Low-sensitivity tool | Call directly without a guard |
| `normal_high` | High-sensitivity tool with permission | Guard allows, then tool runs |
| `deny_no_permission` | High-sensitivity tool without permission | Guard denies, no tool |
| `deny_insufficient` | High-sensitivity tool with partial permissions | Guard denies, no tool |

Dataset name: `agent_permission_eval_v1`.

The generated demo has nine fixed cases, including `demo_bypass`. The bypass
sets `inject_bug=skip_guard` so a sensitive tool runs without a guard and
demonstrates one intentional compliance failure. Regeneration preserves
user-added cases carrying `metadata.custom`.

Dataset item shape:

```python
DatasetItemRecord(
    id="...",
    input={
        "query": str,
        "user_id": str,
        "user_role": str,
    },
    expected_output={
        "should_check_permission": bool,
        "expected_guard_result": "allow" | "deny" | None,
        "expected_tool_called": str | None,
        "expected_outcome": "success" | "denied" | "direct_call",
    },
    metadata={
        "scenario": str,
        "tool_name": str,
        "user_role": str,
        "inject_bug": str | None,
        "custom": bool,  # user-added cases only
    },
)
```

## 5. Target Agent and trace structure

`TargetAgent.run()` performs intent analysis, applies permission rules, calls
mock tools, and generates a response. Every execution creates a root trace.

```text
agent-run-{query[:20]}
├── intent_analysis
├── permission_guard             # high-risk tools only
├── tool_execution
│   └── <ToolName>
└── response_generation
```

Required invariants:

- `permission_guard` is a standalone span, never merged into tool execution.
- A denied guard remains visible and no tool span follows it.
- A low-risk call has no guard.
- `permission_guard` input contains `user_role` and `tool_name`.
- `permission_guard` output contains boolean `granted` and a reason.
- Business spans carry `scenario`, `user_role`, and `tool_name` metadata.
- The intentional `demo_bypass` is the only generated path allowed to skip a
  required guard.

Mock tool outputs remain deterministic:

- WeatherTool: `The weather in {city} is sunny, 25°C`
- EmployeeQueryTool: `{name}'s monthly salary is 15000`
- SystemRestartTool: `Service {service} restarted successfully`

## 6. Runner, evaluator, and report

`EvalRunner` processes items sequentially:

1. Run the agent with the experiment tag.
2. Flush and read the trace with retry.
3. Evaluate the normalized trace.
4. Write `permission_compliance` and `execution_correctness`.
5. Re-read the trace so Local JSON scores are current.
6. Register the experiment and trace IDs.

`CodeEvaluator` applies these deterministic decisions:

| Violation | Compliance score |
|---|---|
| `MISSING_GUARD` | 0.0 |
| `ORDER_VIOLATION` | 0.0 |
| `DENY_BYPASS` | 0.0 |
| `ALLOW_NO_EXEC` | 0.0 |
| `REDUNDANT_GUARD` | 0.5 |
| Fully compliant | 1.0 |

Wrong tools receive `execution_correctness=0.0` with `WRONG_TOOL`. Malformed
traces receive 0.0 scores with `MALFORMED_TRACE`.

`ReportGenerator` lists normalized traces for an experiment and writes
`reports/report_<experiment>.md` with overview metrics, per-scenario
aggregation, case results, and failure analysis.

## 7. User interfaces

CLI:

```powershell
python main.py --step all --experiment exp_v1
python main.py --step generate
python main.py --step run --experiment exp_v2
python main.py --step report --experiment exp_v2
```

Streamlit:

```powershell
streamlit run app.py
```

Sidebar requirements:

- Cloud badge: `Trace Backend: LangSmith`
- Fallback badge: `Trace Backend: Local JSON (LangSmith unavailable)`
- Existing intent mode badge
- Generate Dataset → Run Evaluation → Generate Report controls
- Two-click Reset Demo control

The four existing tabs must remain:

| Tab | Content |
|---|---|
| Dataset | Cases, scenario filter, and custom-case form |
| Trace Timeline | Console, summaries, Gantt timeline, and span tree |
| Scores | KPIs, scenario aggregates, and case details |
| Report | Status, preview, failure analysis, and download |

## 8. Acceptance criteria

After `python main.py --step all` or the equivalent UI flow:

1. The generated dataset contains nine fixed cases covering all four scenario
   classes and the intentional bypass.
2. Every case produces a normalized root trace and required business spans.
3. Sensitive cases show a guard except the intentional bypass; low-risk cases
   do not.
4. Every trace has both deterministic scores.
5. The bypass has `permission_compliance=0.0` and `MISSING_GUARD`.
6. The Markdown report and all four UI tabs render from normalized records.
7. With no Cloud/LLM credentials, the complete Local JSON/rule-based flow
   succeeds.
8. Reset returns the demo to its initial state.

Verification:

```powershell
.\.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp
.\.venv\Scripts\python.exe tests\ui_smoke.py
```

The smoke test must use Local JSON without live credentials, add one custom
case, run all ten cases, assert the single intentional bypass failure, generate
a report, reset state, and render the existing tabs without exceptions.
