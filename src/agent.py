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

import uuid

from .backends.base import Tracer
from .config_loader import ToolsConfig
from .intent import IntentAnalyzer
from .tools_mock import run_mock_tool
from .tool_runtime import ToolAdapterRegistry, ToolExecutor, ToolRequest
from .workbench_models import ToolBinding, ToolEvidence


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
                 analyzer: IntentAnalyzer, executor: ToolExecutor | None = None):
        self.config = config
        self.tracer = tracer
        self.analyzer = analyzer
        if executor is None:
            registry = ToolAdapterRegistry()
            registry.register(
                "python",
                lambda binding: lambda arguments: run_mock_tool(
                    binding.name, arguments.get("query", ""),
                ),
            )
            executor = ToolExecutor(tracer, registry)
        self.executor = executor

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
        tool_evidence: list[ToolEvidence] = []
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
                result_text, evidence = self._execute_tool(tool_name, query, meta)
                tool_evidence.append(evidence)
                executed = True
            elif tool_def.sensitivity == "high":
                # 2a. High sensitivity: guard first; on deny no tool_execution at all
                guard_result = check_permission(
                    user_role, tool_name, self.config, self.tracer, meta)
                if guard_result["granted"]:
                    result_text, evidence = self._execute_tool(tool_name, query, meta)
                    tool_evidence.append(evidence)
                    executed = True
                else:
                    result_text = (f"Denied: role {user_role} is not allowed to "
                                   f"use {tool_name}. {guard_result['reason']}")
            else:
                # 2b. Low sensitivity: execute directly, no guard
                result_text, evidence = self._execute_tool(tool_name, query, meta)
                tool_evidence.append(evidence)
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
            "tool_evidence": tool_evidence,
        }

    def _execute_tool(self, tool_name: str, query: str,
                      meta: dict) -> tuple[str, ToolEvidence]:
        tool_def = self.config.tools[tool_name]
        binding = ToolBinding(
            tool_id=tool_name, name=tool_name, description=tool_def.description,
            connection_type="python", adapter_config={}, input_schema={"type": "object"},
            output_schema={"type": "object"}, permission={},
            test_requirements=tuple(tool_def.test_requirements),
            verification_required=tool_def.sensitivity == "high", enabled=True,
        )
        with self.tracer.span("tool_execution", metadata=meta):
            result, evidence = self.executor.execute(
                binding, ToolRequest(uuid.uuid4().hex, tool_name, {"query": query}),
            )
        if result.error:
            return f"Execution error: {result.error}", evidence
        return (result.output or {}).get("result", ""), evidence
