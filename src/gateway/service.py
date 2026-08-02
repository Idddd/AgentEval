"""Tool Gateway core: the trust boundary between untrusted Agents and tools.

The Agent under evaluation never executes tools itself. It asks the gateway,
which enforces the permission policy, executes the (mock) adapter, and
records every guard verdict and tool attempt as spans shaped exactly like the
ones `CodeEvaluator` scores:

- ``permission_guard`` span with ``output {"granted": bool}``;
- ``tool_execution`` span with a child span named after the tool.

Refused attempts (no prior allow, or after an explicit deny) are recorded as
``tool_execution`` spans with ``metadata {"refused": True, "reason": ...}``
and no adapter execution — the deterministic evaluator then scores
MISSING_GUARD / DENY_BYPASS from the trace structure.

Case context (the requester role) is registered by the orchestrator, not the
Agent, so an Agent cannot claim a different role than the test case defines.
"""
from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from ..models import SpanRecord, TraceRecord
from ..tools_mock import run_mock_tool

MAX_TOOL_CALLS_PER_CASE = 20

REASON_NO_GUARD_ALLOW = "NO_GUARD_ALLOW"
REASON_AFTER_DENY = "AFTER_DENY"
REASON_CALL_LIMIT = "CALL_LIMIT"
REASON_UNKNOWN_CASE = "UNKNOWN_CASE"


class GatewayAuthError(Exception):
    """Missing or invalid run token."""


class UnknownRunError(KeyError):
    """The run_id is not registered."""


@dataclass
class _CaseState:
    context: dict[str, Any]
    verdicts: dict[str, bool] = field(default_factory=dict)  # tool -> last verdict
    tool_calls: int = 0


@dataclass
class _RunState:
    run_id: str
    token: str
    policy: dict[str, Any]
    cases: dict[str, _CaseState] = field(default_factory=dict)
    traces: dict[str, TraceRecord] = field(default_factory=dict)
    closed: bool = False


def _now() -> datetime:
    return datetime.now(timezone.utc)


class GatewayService:
    """In-process gateway core; `gateway.server` wraps it in HTTP."""

    def __init__(self, max_tool_calls_per_case: int = MAX_TOOL_CALLS_PER_CASE):
        self._runs: dict[str, _RunState] = {}
        self._by_token: dict[str, _RunState] = {}
        self._max_tool_calls = max_tool_calls_per_case

    # ---------- harness-side (admin) API ----------

    def register_run(self, run_id: str, policy: dict[str, Any]) -> str:
        """policy: {"tools": {name: {"sensitivity": "low"|"high"}},
                    "roles": {role: [tool names]}}"""
        if run_id in self._runs:
            raise ValueError(f"Run '{run_id}' is already registered")
        token = secrets.token_urlsafe(24)
        state = _RunState(run_id=run_id, token=token, policy=policy)
        self._runs[run_id] = state
        self._by_token[token] = state
        return token

    def start_case(self, run_id: str, case_id: str, context: dict[str, Any]) -> None:
        run = self._require_run(run_id)
        run.cases[case_id] = _CaseState(context=dict(context))
        run.traces[case_id] = TraceRecord(
            trace_id=f"{run_id}/{case_id}", name=case_id,
            metadata={"run_id": run_id, "case_id": case_id})

    def records(self, run_id: str) -> list[TraceRecord]:
        return list(self._require_run(run_id).traces.values())

    def close_run(self, run_id: str) -> None:
        run = self._require_run(run_id)
        run.closed = True
        self._by_token.pop(run.token, None)

    def _require_run(self, run_id: str) -> _RunState:
        if run_id not in self._runs:
            raise UnknownRunError(run_id)
        return self._runs[run_id]

    # ---------- agent-side API (authenticated by run token) ----------

    def guard_check(self, token: str, case_id: str, tool: str,
                    arguments: dict[str, Any]) -> dict[str, Any]:
        run = self._authenticate(token)
        case = run.cases.get(case_id)
        trace = run.traces.get(case_id)
        if case is None or trace is None:
            return {"allowed": False, "reason": REASON_UNKNOWN_CASE}
        role = str(case.context.get("role", ""))
        allowed = tool in run.policy.get("roles", {}).get(role, [])
        reason = "" if allowed else f"role '{role}' has no permission for '{tool}'"
        case.verdicts[tool] = allowed
        start = _now()
        trace.spans.append(SpanRecord(
            id=uuid.uuid4().hex, parent_id=None, name="permission_guard",
            start_time=start, end_time=_now(),
            input={"tool": tool, "role": role, "arguments": arguments},
            output={"granted": allowed},
            metadata={"reason": reason} if reason else {},
        ))
        return {"allowed": allowed, "reason": reason}

    def call_tool(self, token: str, case_id: str, tool: str,
                  arguments: dict[str, Any]) -> dict[str, Any]:
        run = self._authenticate(token)
        case = run.cases.get(case_id)
        trace = run.traces.get(case_id)
        if case is None or trace is None:
            return {"ok": False, "output": None, "error": REASON_UNKNOWN_CASE}

        case.tool_calls += 1
        sensitivity = run.policy.get("tools", {}).get(tool, {}).get("sensitivity", "high")

        refusal: str | None = None
        if case.tool_calls > self._max_tool_calls:
            refusal = REASON_CALL_LIMIT
        elif sensitivity == "high":
            verdict = case.verdicts.get(tool)
            if verdict is None:
                refusal = REASON_NO_GUARD_ALLOW
            elif verdict is False:
                refusal = REASON_AFTER_DENY

        start = _now()
        exec_span_id = uuid.uuid4().hex
        if refusal is not None:
            trace.spans.append(SpanRecord(
                id=exec_span_id, parent_id=None, name="tool_execution",
                start_time=start, end_time=_now(),
                input={"tool": tool, "arguments": arguments},
                output={"error": f"refused: {refusal}"},
                metadata={"refused": True, "reason": refusal},
            ))
            trace.spans.append(SpanRecord(
                id=uuid.uuid4().hex, parent_id=exec_span_id, name=tool,
                start_time=start, end_time=_now(),
                input={"arguments": arguments},
                output={"error": f"refused: {refusal}"},
                metadata={"refused": True, "reason": refusal},
            ))
            return {"ok": False, "output": None,
                    "error": f"Tool call refused by gateway: {refusal}"}

        query = str(arguments.get("query", ""))
        error: str | None = None
        try:
            result = run_mock_tool(tool, query)
        except Exception as exc:
            result = None
            error = f"{type(exc).__name__}: adapter execution failed"
        end = _now()
        trace.spans.append(SpanRecord(
            id=exec_span_id, parent_id=None, name="tool_execution",
            start_time=start, end_time=end,
            input={"tool": tool, "arguments": arguments},
            output=result if error is None else {"error": error},
            metadata={"succeeded": error is None},
        ))
        trace.spans.append(SpanRecord(
            id=uuid.uuid4().hex, parent_id=exec_span_id, name=tool,
            start_time=start, end_time=end,
            input={"arguments": arguments},
            output=result if error is None else {"error": error},
            metadata={"succeeded": error is None},
        ))
        return {"ok": error is None, "output": result, "error": error}

    def _authenticate(self, token: str) -> _RunState:
        run = self._by_token.get(token)
        if run is None or run.closed:
            raise GatewayAuthError("Invalid or expired run token")
        return run


def policy_from_tools_config(config) -> dict[str, Any]:
    """Build a policy snapshot from an existing ToolsConfig (config/tools.yaml)."""
    return {
        "tools": {name: {"sensitivity": tool.sensitivity}
                  for name, tool in config.tools.items()},
        "roles": {role: list(tools) for role, tools in config.roles.items()},
    }
