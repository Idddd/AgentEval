"""Normalized data models — the only input of Evaluator / Report / UI,
fully decoupled from the storage backend."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class SpanRecord:
    id: str
    parent_id: str | None
    name: str
    start_time: datetime
    end_time: datetime | None = None
    input: dict | None = None
    output: dict | None = None
    metadata: dict = field(default_factory=dict)
    observation_type: str = "span"
    level: str = "DEFAULT"
    status_message: str | None = None
    model: str | None = None
    usage_details: dict[str, int] = field(default_factory=dict)
    cost_details: dict[str, float] = field(default_factory=dict)


@dataclass
class ScoreRecord:
    name: str
    value: float
    comment: str | None = None


@dataclass
class TraceRecord:
    trace_id: str
    name: str
    user_id: str | None = None
    tags: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    spans: list[SpanRecord] = field(default_factory=list)
    scores: list[ScoreRecord] = field(default_factory=list)

    def find_span(self, name: str) -> SpanRecord | None:
        return next((s for s in self.spans if s.name == name), None)

    def find_spans(self, name: str) -> list[SpanRecord]:
        return [s for s in self.spans if s.name == name]

    def children_of(self, span_id: str) -> list[SpanRecord]:
        return sorted(
            (s for s in self.spans if s.parent_id == span_id),
            key=lambda s: s.start_time,
        )

    def roots(self) -> list[SpanRecord]:
        ids = {s.id for s in self.spans}
        return sorted(
            (s for s in self.spans if s.parent_id is None or s.parent_id not in ids),
            key=lambda s: s.start_time,
        )

    def get_score(self, name: str) -> float | None:
        s = next((x for x in self.scores if x.name == name), None)
        return s.value if s else None


@dataclass
class DatasetItemRecord:
    id: str
    input: dict
    expected_output: dict
    metadata: dict = field(default_factory=dict)
