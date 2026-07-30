"""Langfuse Cloud backend (Python SDK v3, OpenTelemetry style).

Verified v3 APIs:
- get_client() / auth_check()
- start_as_current_span(name) context manager + span.update(input/output/metadata)
- update_current_trace(name/user_id/tags/metadata) / get_current_trace_id()
- create_score(trace_id, name, value, data_type="NUMERIC", comment)
- create_dataset / create_dataset_item / get_dataset
- Read trace: api.trace.get(trace_id)  (v3 removed fetch_trace/fetch_traces)
- api.trace.list(tags=[...]) to pull traces of an experiment tag
"""
from __future__ import annotations

import json
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from ..models import DatasetItemRecord, ScoreRecord, SpanRecord, TraceRecord
from ..settings import PROJECT_ROOT, Settings


class _LangfuseObservationHandle:
    def __init__(self, observation):
        self._observation = observation

    @property
    def observation_id(self) -> str | None:
        return getattr(self._observation, "id", None)

    def set_output(self, output: dict) -> None:
        self._observation.update(output=output)

    def set_usage(self, usage_details: dict[str, int],
                  cost_details: dict[str, float] | None = None) -> None:
        self._observation.update(
            usage_details=usage_details, cost_details=cost_details or {},
        )

    def set_error(self, message: str) -> None:
        self._observation.update(level="ERROR", status_message=message)


class LangfuseTracer:
    def __init__(self, client):
        self._lf = client
        self._last_trace_id: str | None = None

    @contextmanager
    def start_trace(self, name: str, *, user_id: str, tags: list[str],
                    metadata: dict):
        with self._lf.start_as_current_observation(
                name="agent_root", as_type="agent") as root:
            self._lf.update_current_trace(
                name=name, user_id=user_id, tags=tags, metadata=metadata,
            )
            self._last_trace_id = self._lf.get_current_trace_id()
            yield SimpleNamespace(trace_id=self._last_trace_id)

    @contextmanager
    def span(self, name: str, *, input: dict | None = None,
             metadata: dict | None = None):
        with self.observation(name, as_type="span", input=input,
                              metadata=metadata) as handle:
            yield handle

    @contextmanager
    def observation(self, name: str, *, as_type: str = "span",
                    input: dict | None = None, metadata: dict | None = None,
                    model: str | None = None):
        with self._lf.start_as_current_observation(
            name=name, as_type=as_type, input=input, metadata=metadata or {}, model=model,
        ) as observation:
            yield _LangfuseObservationHandle(observation)

    def flush(self) -> None:
        self._lf.flush()

    def last_trace_id(self) -> str | None:
        return self._last_trace_id


# Telemetry noise the Langfuse server/OTel SDK injects into metadata —
# filtered out so the UI shows only business metadata.
_NOISE_KEYS = {"resourceAttributes", "scope"}


def _clean_meta(m) -> dict:
    return {k: v for k, v in (m or {}).items() if k not in _NOISE_KEYS}


def _to_trace_record(t) -> TraceRecord:
    spans = [
        SpanRecord(
            id=o.id,
            parent_id=getattr(o, "parent_observation_id", None),
            name=o.name,
            start_time=o.start_time,
            end_time=getattr(o, "end_time", None),
            input=getattr(o, "input", None),
            output=getattr(o, "output", None),
            metadata=_clean_meta(getattr(o, "metadata", None)),
            observation_type=getattr(o, "type", "span") or "span",
            level=getattr(o, "level", "DEFAULT") or "DEFAULT",
            status_message=getattr(o, "status_message", None),
            model=getattr(o, "model", None),
            usage_details=getattr(o, "usage_details", None) or {},
            cost_details=getattr(o, "cost_details", None) or {},
        )
        for o in (getattr(t, "observations", None) or [])
    ]
    scores = [
        ScoreRecord(name=s.name, value=s.value,
                    comment=getattr(s, "comment", None))
        for s in (getattr(t, "scores", None) or [])
    ]
    return TraceRecord(
        trace_id=t.id,
        name=getattr(t, "name", "") or "",
        user_id=getattr(t, "user_id", None),
        tags=list(getattr(t, "tags", None) or []),
        metadata=_clean_meta(getattr(t, "metadata", None)),
        spans=spans,
        scores=scores,
    )


class LangfuseBackend:
    def __init__(self, settings: Settings):
        from langfuse import get_client

        self._settings = settings
        self._lf = get_client()
        self.tracer = LangfuseTracer(self._lf)
        self._experiments_path = PROJECT_ROOT / "data" / "experiments.json"

    # ---------- Dataset ----------

    def create_dataset(self, name: str, items: list[DatasetItemRecord],
                       replace: bool = True) -> None:
        if replace:
            self._delete_dataset_if_exists(name)
        self._lf.create_dataset(name=name, description="Agent 权限合规评估用例集")
        for it in items:
            self._lf.create_dataset_item(
                dataset_name=name,
                input=it.input,
                expected_output=it.expected_output,
                metadata=it.metadata,
            )
        self._lf.flush()

    def _delete_dataset_if_exists(self, name: str) -> None:
        try:
            self._lf.api.datasets.delete(dataset_name=name)
            return
        except Exception:
            pass
        # fallback: archive items one by one when no stable delete API exists
        try:
            dataset = self._lf.get_dataset(name)
        except Exception:
            return
        for item in dataset.items:
            try:
                self._lf.create_dataset_item(
                    dataset_name=name, id=item.id,
                    input=item.input, status="ARCHIVED",
                )
            except Exception:
                pass
        self._lf.flush()

    def get_dataset_items(self, name: str) -> list[DatasetItemRecord]:
        try:
            dataset = self._lf.get_dataset(name)
        except Exception as e:
            raise KeyError(
                f"dataset '{name}' not found; run --step generate first"
            ) from e
        return [
            DatasetItemRecord(
                id=it.id,
                input=it.input,
                expected_output=it.expected_output or {},
                metadata=it.metadata or {},
            )
            for it in dataset.items
            if getattr(it, "status", None) != "ARCHIVED"
        ]

    def add_dataset_item(self, dataset_name: str,
                         item: DatasetItemRecord) -> None:
        self._lf.create_dataset_item(
            dataset_name=dataset_name,
            input=item.input,
            expected_output=item.expected_output,
            metadata=item.metadata,
        )
        self._lf.flush()

    # ---------- Score ----------

    def save_score(self, trace_id: str, name: str, value: float,
                   comment: str | None = None) -> None:
        self._lf.create_score(
            trace_id=trace_id, name=name, value=value,
            data_type="NUMERIC", comment=comment,
        )
        self._lf.flush()

    # ---------- Experiment (no Langfuse write API; recorded locally) ----------

    def register_experiment(self, name: str, dataset: str,
                            trace_ids: list[str]) -> None:
        self._experiments_path.parent.mkdir(parents=True, exist_ok=True)
        exps = {}
        if self._experiments_path.exists():
            exps = json.loads(self._experiments_path.read_text(encoding="utf-8"))
        exps[name] = {
            "dataset": dataset,
            "trace_ids": trace_ids,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "backend": "langfuse",
        }
        self._experiments_path.write_text(
            json.dumps(exps, ensure_ascii=False, indent=2), encoding="utf-8",
        )

    # ---------- Reset ----------

    def reset(self, dataset_name: str) -> dict:
        summary = {"dataset_items": 0, "traces": 0, "traces_deleted": 0,
                   "experiments": 0}

        # Dataset (remote)
        try:
            summary["dataset_items"] = len(self.get_dataset_items(dataset_name))
        except KeyError:
            pass
        self._delete_dataset_if_exists(dataset_name)

        # Traces: best-effort per-id delete (Langfuse trace deletion support
        # is limited; failures are tolerated and reported)
        try:
            resp = self._lf.api.trace.list(limit=100)
            traces = getattr(resp, "data", []) or []
            summary["traces"] = len(traces)
            for t in traces:
                try:
                    self._lf.api.trace.delete(t.id)
                    summary["traces_deleted"] += 1
                except Exception:
                    pass
        except Exception:
            pass

        # Experiment records (local registry file)
        exps = {}
        if self._experiments_path.exists():
            exps = json.loads(self._experiments_path.read_text(encoding="utf-8"))
            summary["experiments"] = len(exps)
            self._experiments_path.unlink()
        return summary


class LangfuseStore:
    def __init__(self, settings: Settings):
        from langfuse import get_client

        self._settings = settings
        self._lf = get_client()
        self._experiments_path = PROJECT_ROOT / "data" / "experiments.json"

    def get_trace(self, trace_id: str, *, retry: bool = True) -> TraceRecord:
        # Langfuse ingestion is async: poll after flush for the trace to appear
        attempts = 20 if retry else 1
        last_err: Exception | None = None
        for _ in range(attempts):
            try:
                t = self._lf.api.trace.get(trace_id)
                if t is not None:
                    return _to_trace_record(t)
            except Exception as e:
                last_err = e
            time.sleep(0.5)
        raise KeyError(f"trace '{trace_id}' not available after polling") from last_err

    def list_traces(self, *, tag: str) -> list[TraceRecord]:
        resp = self._lf.api.trace.list(tags=[tag], limit=100)
        out = []
        for t in getattr(resp, "data", []) or []:
            try:
                out.append(self.get_trace(t.id, retry=False))
            except Exception:
                pass
        return out

    def list_experiments(self) -> list[dict]:
        if not self._experiments_path.exists():
            return []
        exps = json.loads(self._experiments_path.read_text(encoding="utf-8"))
        return [{"name": k, **v} for k, v in exps.items()]

    def get_trace_url(self, trace_id: str) -> str:
        try:
            return self._lf.get_trace_url(trace_id=trace_id)
        except Exception:
            return f"{self._settings.langfuse_host} (trace_id={trace_id})"
