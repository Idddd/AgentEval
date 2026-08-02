"""Marketplace orchestrator worker loop.

    SANDBOX_RUNNER=fake .venv/bin/python -m src.orchestrator   # in-process demo
    SANDBOX_RUNNER=k8s  .venv/bin/python -m src.orchestrator   # kind cluster

Fake mode serves every registered image with the in-process reference agent
handler — it exists for demos and tests, not real third-party evaluation.
"""
from __future__ import annotations

import os
import time

from ..marketplace.registry import MarketplaceRegistry
from ..settings import PROJECT_ROOT
from .queue import RunQueue
from .worker import InProcessGatewayAccess, K8sGatewayAccess, Orchestrator

DB_PATH = PROJECT_ROOT / "data" / "marketplace.db"
REPORTS_DIR = PROJECT_ROOT / "reports" / "marketplace"


def build_orchestrator(runner_type: str) -> Orchestrator:
    queue = RunQueue(DB_PATH)
    registry = MarketplaceRegistry(DB_PATH)
    if runner_type == "k8s":
        from ..sandbox.k8s import KubernetesPodRunner

        runner = KubernetesPodRunner(context=os.environ.get(
            "KUBE_CONTEXT", "kind-agent-eval"))
        gateway = K8sGatewayAccess(context=os.environ.get(
            "KUBE_CONTEXT", "kind-agent-eval"))
    else:
        from reference_agent.app import handler_factory
        from ..sandbox.fake import FakeSandboxRunner

        runner = FakeSandboxRunner({"*": handler_factory})
        gateway = InProcessGatewayAccess()
    return Orchestrator(queue=queue, registry=registry, runner=runner,
                        gateway=gateway, reports_dir=REPORTS_DIR,
                        runner_type=runner_type)


def main() -> None:
    runner_type = os.environ.get("SANDBOX_RUNNER", "fake")
    orchestrator = build_orchestrator(runner_type)
    queue = RunQueue(DB_PATH)
    stale = queue.reap_stale()
    if stale:
        print(f"[worker] marked stale runs FAILED: {stale}", flush=True)
    if runner_type == "k8s":
        orphans = orchestrator._runner.reap_expired(
            {run.run_id for run in queue.list_runs() if run.status == "RUNNING"})
        if orphans:
            print(f"[worker] reaped orphan sandboxes: {orphans}", flush=True)
    print(f"[worker] runner={runner_type}; polling for runs…", flush=True)
    while True:
        run = queue.claim_next()
        if run is None:
            time.sleep(2)
            continue
        print(f"[worker] executing {run.run_id} ({run.agent_id}@{run.version})",
              flush=True)
        try:
            finished = orchestrator.execute(run)
            print(f"[worker] {run.run_id} -> {finished.status}", flush=True)
        except Exception as error:
            try:
                queue.finish(run.run_id, "FAILED", error=str(error)[:4000])
            except ValueError:
                pass
            print(f"[worker] {run.run_id} FAILED: {error}", flush=True)


if __name__ == "__main__":
    main()
