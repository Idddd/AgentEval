"""Trace backend abstraction: write side (Tracer/TraceBackend) and read side
(TraceStore).

Agent business code depends only on the Protocols here and never imports
langfuse; the two implementations (Langfuse Cloud / local JSON) are
interchangeable.
"""
from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Iterator, Protocol, runtime_checkable

from ..models import DatasetItemRecord, TraceRecord


class ObservationHandle(Protocol):
    """Handle yielded by an observation context manager."""

    @property
    def observation_id(self) -> str | None: ...

    def set_output(self, output: dict) -> None: ...

    def set_usage(self, usage_details: dict[str, int],
                  cost_details: dict[str, float] | None = None) -> None: ...

    def set_error(self, message: str) -> None: ...


SpanHandle = ObservationHandle


@runtime_checkable
class Tracer(Protocol):
    def start_trace(self, name: str, *, user_id: str, tags: list[str],
                    metadata: dict) -> AbstractContextManager: ...
    """Enter the top-level trace; yields an object with a trace_id attribute."""

    def span(self, name: str, *, input: dict | None = None,
             metadata: dict | None = None) -> AbstractContextManager: ...
    """Enter a child span; nesting creates parent/child links. Yields a SpanHandle."""

    def observation(self, name: str, *, as_type: str = "span",
                    input: dict | None = None, metadata: dict | None = None,
                    model: str | None = None) -> AbstractContextManager: ...

    def flush(self) -> None: ...

    def last_trace_id(self) -> str | None: ...


@runtime_checkable
class TraceBackend(Protocol):
    """Write side: dataset / score / experiment records."""

    tracer: Tracer

    def create_dataset(self, name: str, items: list[DatasetItemRecord],
                       replace: bool = True) -> None: ...

    def get_dataset_items(self, name: str) -> list[DatasetItemRecord]: ...

    def add_dataset_item(self, dataset_name: str,
                         item: DatasetItemRecord) -> None:
        """Append a single item to an existing dataset (UI custom case)."""
        ...

    def save_score(self, trace_id: str, name: str, value: float,
                   comment: str | None = None) -> None: ...

    def register_experiment(self, name: str, dataset: str,
                            trace_ids: list[str]) -> None: ...

    def reset(self, dataset_name: str) -> dict:
        """Wipe all demo state (dataset, traces, scores, experiment records).
        Returns a small summary dict for UI display."""
        ...


@runtime_checkable
class TraceStore(Protocol):
    """Read side: shared by Evaluator / Report / UI."""

    def get_trace(self, trace_id: str, *, retry: bool = True) -> TraceRecord: ...

    def list_traces(self, *, tag: str) -> list[TraceRecord]: ...

    def list_experiments(self) -> list[dict]: ...


_cached: tuple[TraceBackend, TraceStore] | None = None


def get_backend(refresh: bool = False) -> tuple[TraceBackend, TraceStore]:
    """Return the Langfuse or LocalJson pair based on settings.langfuse_enabled
    (process-wide singleton)."""
    global _cached
    if _cached is not None and not refresh:
        return _cached

    from ..settings import load_settings

    settings = load_settings()
    if settings.langfuse_enabled:
        from .langfuse_backend import LangfuseBackend, LangfuseStore

        backend = LangfuseBackend(settings)
        store = LangfuseStore(settings)
    else:
        from .local_backend import LocalJsonBackend, LocalJsonStore

        backend = LocalJsonBackend(settings.data_dir)
        store = LocalJsonStore(settings.data_dir)
    _cached = (backend, store)
    return _cached
