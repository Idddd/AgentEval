"""Target Agent + Permission Guard (spec 3.2).

Trace structure (identical under both backends):
  Trace: agent-run-{query[:20]}
  ├── intent_analysis
  ├── permission_guard        # high-sensitivity tools only; kept even on deny
  ├── tool_execution          # only on guard-allow or low-sensitivity tools
  │   └── {ToolName}
  └── response_generation
"""
from __future__ import annotations

from .backends.base import Tracer
from .config_loader import ToolsConfig
from .intent import IntentAnalyzer
from .tools_mock import run_mock_tool


def check_permission(user_role: str, tool_name: str, config: ToolsConfig,
                     tracer: Tracer, meta: dict) -> dict:
    """Permission Guard: standalone span; input/output follow spec 4.1 strictly."""
    with tracer.span("permission_guard",
                     input={"user_role": user_role, "tool_name": tool_name},
                     metadata=meta) as span:
        granted = config.has_permission(user_role, tool_name)
        reason = (
            f"Role {user_role} has permission to use {tool_name}"
            if granted
            else f"Role {user_role} lacks permission to use {tool_name}"
        )
        out = {"granted": granted, "reason": reason}
        span.set_output(out)
        return out


class TargetAgent:
    def __init__(self, config: ToolsConfig, tracer: Tracer,
                 analyzer: IntentAnalyzer):
        self.config = config
        self.tracer = tracer
        self.analyzer = analyzer

    async def run(self, query: str, user_id: str, user_role: str, *,
                  scenario: str = "unknown", tags: list[str] | None = None,
                  inject_bug: str | None = None) -> dict:
        meta = {"scenario": scenario, "user_role": user_role, "tool_name": ""}
        if inject_bug:
            meta["inject_bug"] = inject_bug
        with self.tracer.start_trace(f"agent-run-{query[:20]}",
                                     user_id=user_id,
                                     tags=tags or [],
                                     metadata=meta):
            return self._run_inner(query, user_role, meta, inject_bug)

    def _run_inner(self, query: str, user_role: str, meta: dict,
                   inject_bug: str | None) -> dict:
        guard_result, executed, tool_name, result_text = None, False, None, ""
        try:
            # 1. Intent analysis
            with self.tracer.span("intent_analysis", metadata=meta) as s:
                tool_name = self.analyzer.identify(query, self.config.tools)
                meta["tool_name"] = tool_name or ""
                s.set_output({"identified_tool": tool_name})

            tool_def = self.config.tools.get(tool_name) if tool_name else None
            if tool_def is None:
                result_text = "Unrecognized request: no matching tool."
            elif tool_def.sensitivity == "high" and inject_bug == "skip_guard":
                # Injected misbehavior for the demo failing case: a rogue
                # agent that executes sensitive tools WITHOUT the guard.
                result_text = self._execute_tool(tool_name, query, meta)
                executed = True
            elif tool_def.sensitivity == "high":
                # 2a. High sensitivity: guard first; on deny no tool_execution at all
                guard_result = check_permission(
                    user_role, tool_name, self.config, self.tracer, meta)
                if guard_result["granted"]:
                    result_text = self._execute_tool(tool_name, query, meta)
                    executed = True
                else:
                    result_text = (f"Denied: role {user_role} is not allowed to "
                                   f"use {tool_name}. {guard_result['reason']}")
            else:
                # 2b. Low sensitivity: execute directly, no guard
                result_text = self._execute_tool(tool_name, query, meta)
                executed = True
        except Exception as e:  # spec 4.4: trace must stay complete on errors
            result_text = f"Execution error: {e}"

        # 3. Final response
        with self.tracer.span("response_generation", metadata=meta) as s:
            s.set_output({"response": result_text})

        return {
            "response": result_text,
            "tool_called": tool_name if executed else None,
            "guard_result": guard_result,
            "trace_id": self.tracer.last_trace_id(),
        }

    def _execute_tool(self, tool_name: str, query: str, meta: dict) -> str:
        with self.tracer.span("tool_execution", metadata=meta):
            with self.tracer.span(tool_name,
                                  input={"query": query},
                                  metadata=meta) as s:
                out = run_mock_tool(tool_name, query)
                s.set_output(out)
                return out["result"]
