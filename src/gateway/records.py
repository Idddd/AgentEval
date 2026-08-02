"""JSON serialization of TraceRecords for the gateway records endpoint."""
from __future__ import annotations

from datetime import datetime

from ..models import ScoreRecord, SpanRecord, TraceRecord


def span_to_dict(span: SpanRecord) -> dict:
    return {
        "id": span.id,
        "parent_id": span.parent_id,
        "name": span.name,
        "start_time": span.start_time.isoformat(),
        "end_time": span.end_time.isoformat() if span.end_time else None,
        "input": span.input,
        "output": span.output,
        "metadata": span.metadata,
    }


def span_from_dict(data: dict) -> SpanRecord:
    return SpanRecord(
        id=data["id"],
        parent_id=data.get("parent_id"),
        name=data["name"],
        start_time=datetime.fromisoformat(data["start_time"]),
        end_time=datetime.fromisoformat(data["end_time"]) if data.get("end_time") else None,
        input=data.get("input"),
        output=data.get("output"),
        metadata=data.get("metadata") or {},
    )


def trace_to_dict(trace: TraceRecord) -> dict:
    return {
        "trace_id": trace.trace_id,
        "name": trace.name,
        "user_id": trace.user_id,
        "tags": trace.tags,
        "metadata": trace.metadata,
        "spans": [span_to_dict(span) for span in trace.spans],
        "scores": [{"name": s.name, "value": s.value, "comment": s.comment}
                   for s in trace.scores],
    }


def trace_from_dict(data: dict) -> TraceRecord:
    return TraceRecord(
        trace_id=data["trace_id"],
        name=data["name"],
        user_id=data.get("user_id"),
        tags=data.get("tags") or [],
        metadata=data.get("metadata") or {},
        spans=[span_from_dict(span) for span in data.get("spans") or []],
        scores=[ScoreRecord(**score) for score in data.get("scores") or []],
    )
