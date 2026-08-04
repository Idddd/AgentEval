from streamlit.testing.v1 import AppTest


def _visible(app: AppTest, kind: str) -> str:
    return "\n".join(str(node.value) for node in app.get(kind))


def test_overview_renders_target_scoped_metrics():
    script = '''
from src.ui.observations import render_observation_overview
from src.workbench_models import TraceSummary

class Repository:
    def list_traces(self, agent_id):
        assert agent_id == "agent-1"
        return [
            TraceSummary("t1", "r1", "c1", agent_id, "PASS", "2026-08-04", 12.0, 3, 0.01),
            TraceSummary("t2", "r2", "c2", agent_id, "FAIL", "2026-08-04", 8.0, 2, 0.02),
        ]

render_observation_overview(Repository(), "agent-1")
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert [metric.value for metric in app.metric] == ["2", "5", "1", "$0.0300"]


def test_overview_and_trace_list_render_empty_states():
    script = '''
from src.ui.observations import render_observation_overview, render_trace_module

class Repository:
    def list_traces(self, agent_id):
        return []

render_observation_overview(Repository(), "agent-1")
render_trace_module(Repository(), "agent-1")
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert len(app.info) == 2
    assert "Run an evaluation" in _visible(app, "info")


def test_trace_list_renders_persisted_summary_columns():
    script = '''
from src.ui.observations import render_trace_module
from src.workbench_models import TraceSummary

class Repository:
    def list_traces(self, agent_id):
        assert agent_id == "agent-1"
        return [
            TraceSummary(
                "trace-1", "run-1", "case-1", agent_id, "PASS",
                "2026-08-04T01:00:00+00:00", 15.5, 4, 0.0123,
            )
        ]

render_trace_module(Repository(), "agent-1")
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    table = app.dataframe[0].value
    assert list(table.columns) == [
        "Trace",
        "Case",
        "Status",
        "Started",
        "Observations",
        "Latency (ms)",
        "Cost",
        "View",
    ]
    assert table.iloc[0].to_dict() == {
        "Trace": "trace-1",
        "Case": "case-1",
        "Status": "PASS",
        "Started": "2026-08-04T01:00:00+00:00",
        "Observations": 4,
        "Latency (ms)": 15.5,
        "Cost": 0.0123,
        "View": "View",
    }
