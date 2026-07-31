"""LangSmith trace writer and normalized trace reader.

The adapter uses only the LangSmith SDK's native ``Client`` API, keeping
LangChain out of the runtime dependency graph.  Client injection makes the
same boundary usable with an in-memory fake in tests.
"""
from __future__ import annotations

import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from ..models import ScoreRecord, SpanRecord, TraceRecord
from ..settings import Settings


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _client_from(settings: Settings):
    from langsmith import Client

    options: dict[str, str] = {}
    if settings.langsmith_api_key:
        options["api_key"] = settings.langsmith_api_key
    if settings.langsmith_endpoint:
        options["api_url"] = settings.langsmith_endpoint
    if settings.langsmith_workspace_id:
        options["workspace_id"] = settings.langsmith_workspace_id
    return Client(**options)


class _SpanHandle:
    def __init__(self):
        self.output: dict | None = None

    def set_output(self, output: dict) -> None:
        self.output = output


class LangsmithTracer:
    """Create native LangSmith runs while maintaining a thread-local tree."""

    def __init__(self, client):
        self._client = client
        self._local = threading.local()

    def _stack(self) -> list[uuid.UUID]:
        stack = getattr(self._local, "stack", None)
        if stack is None:
            stack = []
            self._local.stack = stack
        return stack

    @contextmanager
    def start_trace(
        self,
        name: str,
        *,
        user_id: str,
        tags: list[str],
        metadata: dict,
    ):
        run_id = uuid.uuid4()
        project_name = tags[0] if tags else name
        start_time = _now()
        root_metadata = dict(metadata)
        root_metadata["user_id"] = user_id
        self._local.stack = []
        self._local.trace_id = run_id
        self._local.project_name = project_name
        self._local.last_trace_id = str(run_id)
        self._client.create_run(
            name,
            {},
            "chain",
            id=run_id,
            trace_id=run_id,
            project_name=project_name,
            start_time=start_time,
            tags=list(tags),
            extra={"metadata": root_metadata},
        )

        error: str | None = None
        try:
            yield SimpleNamespace(trace_id=str(run_id))
        except BaseException as exc:
            error = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            self._client.update_run(
                run_id,
                end_time=_now(),
                error=error,
            )
            self._local.stack = []

    @contextmanager
    def span(
        self,
        name: str,
        *,
        input: dict | None = None,
        metadata: dict | None = None,
    ):
        trace_id = getattr(self._local, "trace_id", None)
        if trace_id is None:
            raise RuntimeError("span() requires an active LangSmith trace")

        stack = self._stack()
        parent_id = stack[-1] if stack else trace_id
        run_id = uuid.uuid4()
        self._client.create_run(
            name,
            input or {},
            "chain",
            id=run_id,
            trace_id=trace_id,
            parent_run_id=parent_id,
            project_name=self._local.project_name,
            start_time=_now(),
            extra={"metadata": dict(metadata or {})},
        )
        stack.append(run_id)
        handle = _SpanHandle()
        error: str | None = None
        try:
            yield handle
        except BaseException as exc:
            error = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            update: dict[str, Any] = {"end_time": _now(), "error": error}
            if handle.output is not None:
                update["outputs"] = handle.output
            self._client.update_run(run_id, **update)
            if stack and stack[-1] == run_id:
                stack.pop()
            elif run_id in stack:
                stack.remove(run_id)

    def flush(self) -> None:
        flush = getattr(self._client, "flush", None)
        if callable(flush):
            flush()
            return
        queue = getattr(self._client, "tracing_queue", None)
        drain = getattr(queue, "join", None)
        if callable(drain):
            drain()

    def last_trace_id(self) -> str | None:
        return getattr(self._local, "last_trace_id", None)


def _value(item, name: str, default=None):
    if isinstance(item, dict):
        return item.get(name, default)
    return getattr(item, name, default)


def _metadata(run) -> dict:
    extra = _value(run, "extra", {}) or {}
    if isinstance(extra, dict) and isinstance(extra.get("metadata"), dict):
        return dict(extra["metadata"])
    return dict(_value(run, "metadata", {}) or {})


def _datetime(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value


class LangsmithBackend:
    def __init__(self, settings: Settings, client=None):
        self._settings = settings
        self._client = client if client is not None else _client_from(settings)
        self.tracer = LangsmithTracer(self._client)


class LangsmithStore:
    def __init__(self, settings: Settings, client=None):
        self._settings = settings
        self._client = client if client is not None else _client_from(settings)

    def get_trace(self, trace_id: str, *, retry: bool = True) -> TraceRecord:
        del retry
        root = self._client.read_run(trace_id)
        root_id = str(_value(root, "id"))
        runs = list(self._client.list_runs(trace_id=trace_id))
        metadata = _metadata(root)
        user_id = _value(root, "user_id")
        if user_id is None:
            user_id = metadata.pop("user_id", None)

        spans = [
            SpanRecord(
                id=str(_value(run, "id")),
                parent_id=(
                    str(_value(run, "parent_run_id"))
                    if _value(run, "parent_run_id") is not None
                    else None
                ),
                name=_value(run, "name", "") or "",
                start_time=_datetime(_value(run, "start_time")),
                end_time=_datetime(_value(run, "end_time")),
                input=_value(run, "inputs"),
                output=_value(run, "outputs"),
                metadata=_metadata(run),
            )
            for run in runs
            if str(_value(run, "id")) != root_id
        ]
        feedback = self._client.list_feedback(run_ids=[root_id])
        scores = [
            ScoreRecord(
                name=_value(item, "key", "") or "",
                value=float(_value(item, "score")),
                comment=_value(item, "comment"),
            )
            for item in feedback
            if _value(item, "score") is not None
        ]
        return TraceRecord(
            trace_id=root_id,
            name=_value(root, "name", "") or "",
            user_id=user_id,
            tags=list(_value(root, "tags", []) or []),
            metadata=metadata,
            spans=spans,
            scores=scores,
        )

    def list_traces(self, *, tag: str) -> list[TraceRecord]:
        roots = self._client.list_runs(project_name=tag, is_root=True)
        return [
            self.get_trace(str(_value(root, "id")), retry=False)
            for root in roots
        ]

    def get_trace_url(self, trace_id: str) -> str:
        get_run_url = getattr(self._client, "get_run_url", None)
        if callable(get_run_url):
            try:
                run = self._client.read_run(trace_id)
                project_name = _value(run, "session_name")
                url = get_run_url(run=run, project_name=project_name)
                if url:
                    return str(url)
            except Exception:
                pass
        endpoint = (
            self._settings.langsmith_endpoint
            or "https://api.smith.langchain.com"
        )
        return f"{endpoint.rstrip('/')}/runs/{trace_id}"
