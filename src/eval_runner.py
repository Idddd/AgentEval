"""Eval Runner: iterate the dataset → run the agent → wait for the trace →
score → write scores back."""
from __future__ import annotations

from typing import Callable

from .agent import TargetAgent
from .agent_adapter import AgentAdapter
from .backends.base import TraceBackend, TraceStore
from .code_evaluator import CodeEvaluator
from .config_loader import ToolsConfig
from .intent import IntentAnalyzer
from .llm_judge import JudgeIncompleteError
from .workbench_models import CaseResult, EvalRun, RunStatus, TestCase
from .workbench_repository import WorkbenchRepository


class EvalRunner:
    def __init__(self, *args):
        if len(args) == 4 and hasattr(args[0], "create_run"):
            repository, adapter, evaluator, judge = args
            self.repository: WorkbenchRepository = repository
            self.agent_adapter: AgentAdapter = adapter
            self.evaluator = evaluator
            self.judge = judge
            self._legacy = False
            return
        if len(args) == 6:
            dataset_name, experiment_name, backend, store, config, analyzer = args
            self.dataset_name: str = dataset_name
            self.experiment_name: str = experiment_name
            self.backend: TraceBackend = backend
            self.store: TraceStore = store
            self.agent = TargetAgent(config, backend.tracer, analyzer)
            self.evaluator = CodeEvaluator()
            self._legacy = True
            return
        raise TypeError(
            "EvalRunner expects (repository, agent_adapter, evaluator, judge) "
            "or the deprecated six-argument CLI constructor"
        )

    @staticmethod
    def _required_deterministic_failure(case: TestCase,
                                        scores: dict[str, float]) -> bool:
        required = {"permission_compliance", "execution_correctness"}
        required.update(case.expected_output.get("required_deterministic_scores", ()))
        return any(name not in scores or scores[name] < 1.0 for name in required)

    async def run_revision(
        self,
        agent_revision_id: str,
        dataset_revision_id: str,
        progress: Callable[[int, int, str], None] | None = None,
    ) -> EvalRun:
        if self._legacy:
            raise RuntimeError("run_revision is unavailable on the deprecated CLI runner")
        self.repository.get_agent_revision(agent_revision_id)
        dataset_revision = self.repository.get_dataset_revision(dataset_revision_id)
        run = self.repository.create_run(agent_revision_id, dataset_revision_id)
        results: list[CaseResult] = []
        usable_results = 0
        total = len(dataset_revision.cases)

        for index, case in enumerate(dataset_revision.cases):
            if progress:
                progress(index, total, f"[{index + 1}/{total}] {case.case_id}")
            response = ""
            trace_id = ""
            evidence = ()
            usage_costs = ()
            scores: dict[str, float] = {}
            reasons: dict[str, str] = {}
            judge_result = None
            status = "INCOMPLETE"
            try:
                adapter_result = await self.agent_adapter.run(case, run.run_id)
                response = adapter_result.response
                trace_id = adapter_result.trace_id
                evidence = adapter_result.tool_evidence
                usage_costs = adapter_result.usage_costs
                scores, reasons = self.evaluator.evaluate(
                    adapter_result.trace, case.expected_output,
                )
                usable_results += 1
                deterministic_failed = self._required_deterministic_failure(case, scores)
                try:
                    judge_result = self.judge.evaluate(case, response, evidence, scores)
                except JudgeIncompleteError as error:
                    reasons = {**reasons, "judge": f"JUDGE_INCOMPLETE: {error}"}
                except Exception as error:
                    reasons = {
                        **reasons,
                        "judge": f"JUDGE_ERROR: {type(error).__name__}: {error}",
                    }

                if deterministic_failed:
                    status = "FAIL"
                elif judge_result is not None and not judge_result.passed:
                    status = "FAIL"
                else:
                    status = "PASS"
                if judge_result is not None and judge_result.usage_cost is not None:
                    usage_costs = (*usage_costs, judge_result.usage_cost)
            except Exception as error:
                reasons = {
                    **reasons,
                    "runner": f"CASE_INCOMPLETE: {type(error).__name__}: {error}",
                }

            case_result = CaseResult(
                case_id=case.case_id,
                trace_id=trace_id,
                response=response,
                deterministic_scores=scores,
                deterministic_reasons=reasons,
                tool_evidence=tuple(evidence),
                judge=judge_result,
                usage_costs=tuple(usage_costs),
                status=status,
            )
            self.repository.save_case_result(run.run_id, case_result)
            results.append(case_result)
            if progress:
                progress(index + 1, total, f"{case.case_id}: {status}")

        if usable_results == 0:
            final_status = RunStatus.FAILED
        elif any(result.status == "INCOMPLETE" for result in results):
            final_status = RunStatus.PARTIAL
        else:
            final_status = RunStatus.COMPLETED
        return self.repository.finish_run(run.run_id, final_status)

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
