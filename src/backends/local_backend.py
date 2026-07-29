"""Local JSON backend: fallback when no Langfuse credentials are available.

Traces are persisted with the same shape as Langfuse TraceWithFullDetails:
data/traces.jsonl holds one complete trace per line (flat spans + scores).
"""
from __future__ import annotations

import json
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from ..models import DatasetItemRecord, ScoreRecord, SpanRecord, TraceRecord


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


# ---------- Serialization ----------

def trace_to_dict(t: TraceRecord) -> dict:
    return {
        "trace_id": t.trace_id,
        "name": t.name,
        "user_id": t.user_id,
        "tags": t.tags,
        "metadata": t.metadata,
        "spans": [
            {
                "id": s.id,
                "parent_id": s.parent_id,
                "name": s.name,
                "start_time": s.start_time.isoformat(),
                "end_time": s.end_time.isoformat() if s.end_time else None,
                "input": s.input,
                "output": s.output,
                "metadata": s.metadata,
            }
            for s in t.spans
        ],
        "scores": [
            {"name": sc.name, "value": sc.value, "comment": sc.comment}
            for sc in t.scores
        ],
    }


def trace_from_dict(d: dict) -> TraceRecord:
    return TraceRecord(
        trace_id=d["trace_id"],
        name=d.get("name", ""),
        user_id=d.get("user_id"),
        tags=d.get("tags", []),
        metadata=d.get("metadata", {}),
        spans=[
            SpanRecord(
                id=s["id"],
                parent_id=s.get("parent_id"),
                name=s["name"],
                start_time=_dt(s["start_time"]),
                end_time=_dt(s["end_time"]) if s.get("end_time") else None,
                input=s.get("input"),
                output=s.get("output"),
                metadata=s.get("metadata", {}),
            )
            for s in d.get("spans", [])
        ],
        scores=[
            ScoreRecord(name=sc["name"], value=sc["value"], comment=sc.get("comment"))
            for sc in d.get("scores", [])
        ],
    )


# ---------- Tracer ----------

class _LocalSpanHandle:
    def __init__(self, span: SpanRecord):
        self._span = span

    def set_output(self, output: dict) -> None:
        self._span.output = output


class LocalTracer:
    """Thread-local span stack builds the tree; on root exit the whole trace is
    serialized and appended to traces.jsonl."""

    def __init__(self, traces_path: Path):
        self._path = traces_path
        self._local = threading.local()

    def _stack(self) -> list[SpanRecord]:
        if not hasattr(self._local, "stack"):
            self._local.stack = []
        return self._local.stack

    def _state(self) -> dict:
        return self._local.state

    @contextmanager
    def start_trace(self, name: str, *, user_id: str, tags: list[str],
                    metadata: dict):
        trace_id = uuid.uuid4().hex
        self._local.state = {
            "trace_id": trace_id, "name": name, "user_id": user_id,
            "tags": list(tags), "metadata": dict(metadata),
        }
        self._local.stack = []
        self._local.root_spans = []
        try:
            yield SimpleNamespace(trace_id=trace_id)
        finally:
            state = self._local.state
            trace = TraceRecord(
                trace_id=trace_id,
                name=state["name"],
                user_id=state["user_id"],
                tags=state["tags"],
                metadata=state["metadata"],
                spans=list(self._local.root_spans),
            )
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with self._path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(trace_to_dict(trace), ensure_ascii=False) + "\n")

    @contextmanager
    def span(self, name: str, *, input: dict | None = None,
             metadata: dict | None = None):
        stack = self._stack()
        span = SpanRecord(
            id=uuid.uuid4().hex,
            parent_id=stack[-1].id if stack else None,
            name=name,
            start_time=_now(),
            input=input,
            metadata=dict(metadata or {}),
        )
        self._local.root_spans.append(span)
        stack.append(span)
        try:
            yield _LocalSpanHandle(span)
        finally:
            span.end_time = _now()
            stack.pop()

    def flush(self) -> None:  # local mode writes synchronously; nothing to do
        pass

    def last_trace_id(self) -> str | None:
        return getattr(self._local, "state", {}).get("trace_id")


# ---------- Backend / Store ----------

class LocalJsonBackend:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._traces_path = self.data_dir / "traces.jsonl"
        self._dataset_path = self.data_dir / "dataset.json"
        self._experiments_path = self.data_dir / "experiments.json"
        self.tracer = LocalTracer(self._traces_path)

    def create_dataset(self, name: str, items: list[DatasetItemRecord],
                       replace: bool = True) -> None:
        datasets = self._read_json(self._dataset_path, default={})
        if name in datasets and not replace:
            raise ValueError(f"dataset '{name}' already exists")
        datasets[name] = [
            {"id": it.id, "input": it.input,
             "expected_output": it.expected_output, "metadata": it.metadata}
            for it in items
        ]
        self._write_json(self._dataset_path, datasets)

    def get_dataset_items(self, name: str) -> list[DatasetItemRecord]:
        datasets = self._read_json(self._dataset_path, default={})
        raw = datasets.get(name)
        if raw is None:
            raise KeyError(f"dataset '{name}' not found; run --step generate first")
        return [
            DatasetItemRecord(id=it["id"], input=it["input"],
                              expected_output=it["expected_output"],
                              metadata=it.get("metadata", {}))
            for it in raw
        ]

    def add_dataset_item(self, dataset_name: str,
                         item: DatasetItemRecord) -> None:
        datasets = self._read_json(self._dataset_path, default={})
        if dataset_name not in datasets:
            raise KeyError(f"dataset '{dataset_name}' not found")
        datasets[dataset_name].append(
            {"id": item.id, "input": item.input,
             "expected_output": item.expected_output, "metadata": item.metadata})
        self._write_json(self._dataset_path, datasets)

    def save_score(self, trace_id: str, name: str, value: float,
                   comment: str | None = None) -> None:
        if not self._traces_path.exists():
            raise KeyError(f"trace '{trace_id}' not found")
        lines = self._traces_path.read_text(encoding="utf-8").splitlines()
        out, found = [], False
        for line in lines:
            d = json.loads(line)
            if d["trace_id"] == trace_id:
                d.setdefault("scores", [])
                d["scores"] = [s for s in d["scores"] if s["name"] != name]
                d["scores"].append({"name": name, "value": value, "comment": comment})
                found = True
            out.append(json.dumps(d, ensure_ascii=False))
        if not found:
            raise KeyError(f"trace '{trace_id}' not found")
        self._traces_path.write_text("\n".join(out) + "\n", encoding="utf-8")

    def register_experiment(self, name: str, dataset: str,
                            trace_ids: list[str]) -> None:
        exps = self._read_json(self._experiments_path, default={})
        exps[name] = {
            "dataset": dataset,
            "trace_ids": trace_ids,
            "created_at": _now().isoformat(),
            "backend": "local-json",
        }
        self._write_json(self._experiments_path, exps)

    def reset(self, dataset_name: str) -> dict:
        summary = {"dataset_items": 0, "traces": 0, "experiments": 0}
        datasets = self._read_json(self._dataset_path, default={})
        summary["dataset_items"] = len(datasets.get(dataset_name, []))
        datasets.pop(dataset_name, None)
        self._write_json(self._dataset_path, datasets)

        if self._traces_path.exists():
            summary["traces"] = len(
                self._traces_path.read_text(encoding="utf-8").splitlines())
            self._traces_path.unlink()

        exps = self._read_json(self._experiments_path, default={})
        summary["experiments"] = len(exps)
        if self._experiments_path.exists():
            self._experiments_path.unlink()
        return summary

    @staticmethod
    def _read_json(path: Path, default):
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return default

    @staticmethod
    def _write_json(path: Path, data) -> None:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                        encoding="utf-8")


class LocalJsonStore:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self._traces_path = self.data_dir / "traces.jsonl"
        self._experiments_path = self.data_dir / "experiments.json"

    def _all_traces(self) -> list[TraceRecord]:
        if not self._traces_path.exists():
            return []
        return [
            trace_from_dict(json.loads(line))
            for line in self._traces_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

    def get_trace(self, trace_id: str, *, retry: bool = True) -> TraceRecord:
        for t in self._all_traces():
            if t.trace_id == trace_id:
                return t
        raise KeyError(f"trace '{trace_id}' not found")

    def list_traces(self, *, tag: str) -> list[TraceRecord]:
        return [t for t in self._all_traces() if tag in t.tags]

    def list_experiments(self) -> list[dict]:
        if not self._experiments_path.exists():
            return []
        exps = json.loads(self._experiments_path.read_text(encoding="utf-8"))
        return [{"name": k, **v} for k, v in exps.items()]
