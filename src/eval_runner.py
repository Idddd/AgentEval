"""Eval Runner: iterate the dataset → run the agent → wait for the trace →
score → write scores back."""
from __future__ import annotations

from typing import Callable

from .agent import TargetAgent
from .backends.base import TraceBackend, TraceStore
from .code_evaluator import CodeEvaluator
from .config_loader import ToolsConfig
from .intent import IntentAnalyzer


class EvalRunner:
    def __init__(self, dataset_name: str, experiment_name: str,
                 backend: TraceBackend, store: TraceStore,
                 config: ToolsConfig, analyzer: IntentAnalyzer):
        self.dataset_name = dataset_name
        self.experiment_name = experiment_name
        self.backend = backend
        self.store = store
        self.agent = TargetAgent(config, backend.tracer, analyzer)
        self.evaluator = CodeEvaluator()

    async def run(self, progress: Callable[[int, int, str], None] | None = None
                  ) -> list[dict]:
        items = self.backend.get_dataset_items(self.dataset_name)
        results: list[dict] = []
        trace_ids: list[str] = []

        for i, item in enumerate(items):
            scenario = item.metadata.get("scenario", "unknown")
            total = len(items)
            if progress:
                progress(i, total,
                         f"▶ [{i+1}/{total}] {scenario} | "
                         f"{item.input['user_role']} | {item.input['query']}")

            # 1. Run the agent (trace carries the experiment tag for aggregation)
            result = await self.agent.run(
                query=item.input["query"],
                user_id=item.input["user_id"],
                user_role=item.input["user_role"],
                scenario=scenario,
                tags=[self.experiment_name],
                inject_bug=item.metadata.get("inject_bug"),
            )
            trace_id = result["trace_id"]
            trace_ids.append(trace_id)

            # 2. Flush + wait until the trace is readable (Langfuse writes are
            #    async; local mode is readable immediately)
            self.backend.tracer.flush()
            trace = self.store.get_trace(trace_id, retry=True)

            # 3. Score and write back
            scores, reasons = self.evaluator.evaluate(trace, item.expected_output)
            for name, value in scores.items():
                reason = reasons.get(name, "")
                comment = f"Scenario: {scenario}" + (f" | {reason}" if reason else "")
                self.backend.save_score(trace_id, name, value, comment=comment)

            # Local mode updates scores in place; refetch to keep data fresh
            trace = self.store.get_trace(trace_id, retry=False)
            results.append({
                "item": item, "trace_id": trace_id,
                "scores": scores, "reasons": reasons,
                "response": result["response"],
            })

            if progress:
                c = scores["permission_compliance"]
                e = scores["execution_correctness"]
                ok = c == 1.0 and e == 1.0
                reason = next((r for r in reasons.values() if r), None)
                line = (f"  └ {'✅' if ok else '❌'} compliance={c} "
                        f"execution={e}")
                if reason:
                    line += f"  ({reason})"
                progress(i + 1, total, line)

        self.backend.tracer.flush()
        self.backend.register_experiment(
            self.experiment_name, self.dataset_name, trace_ids)
        if progress:
            progress(len(items), len(items),
                     f"—— done: {len(items)}/{len(items)} cases scored ——")
        return results
