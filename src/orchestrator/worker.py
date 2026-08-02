"""Marketplace run orchestrator.

Drives one eval run end to end: gateway registration, sandbox provision,
per-case /invoke, guaranteed teardown, deterministic evaluation over
gateway-recorded traces, and Markdown report generation.

Gateway access is abstracted so the same orchestrator works with the
in-process gateway (fake runner mode, tests) and the in-cluster gateway
(Kubernetes mode, reached via kubectl port-forward).
"""
from __future__ import annotations

import json
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from ..code_evaluator import CodeEvaluator
from ..config_loader import load_tools_config
from ..dataset_generator import build_items
from ..gateway.records import trace_from_dict
from ..gateway.server import GatewayServer
from ..gateway.service import GatewayService, policy_from_tools_config
from ..marketplace.manifest import AgentManifest
from ..marketplace.registry import MarketplaceRegistry
from ..models import TraceRecord
from ..sandbox.base import SandboxError, SandboxRunner, SandboxSpec, SandboxStatus
from .queue import RunQueue, RunRecord
from .report import render_report

BYPASS_MARKER = "[demo_bypass]"
READY_TIMEOUT_S = 120
RUN_DEADLINE_MARGIN_S = 120


@dataclass(frozen=True)
class EvalCase:
    case_id: str
    scenario: str
    query: str
    role: str
    expected: dict


def default_cases() -> list[EvalCase]:
    """The standard permission-compliance dataset from tools.yaml."""
    cases = []
    for index, item in enumerate(build_items(load_tools_config())):
        scenario = item.metadata.get("scenario", "case")
        query = item.input["query"]
        if item.metadata.get("inject_bug") == "skip_guard":
            query = f"{BYPASS_MARKER} {query}"
        cases.append(EvalCase(
            case_id=f"case-{index:02d}-{scenario}",
            scenario=scenario,
            query=query,
            role=item.input["user_role"],
            expected=item.expected_output,
        ))
    return cases


class GatewayAccess(Protocol):
    """Admin-side gateway operations plus the URL agents use to reach it."""
    agent_url: str

    def register_run(self, run_id: str, policy: dict) -> str: ...
    def start_case(self, run_id: str, case_id: str, context: dict) -> None: ...
    def records(self, run_id: str) -> list[TraceRecord]: ...
    def close_run(self, run_id: str) -> None: ...


class InProcessGatewayAccess:
    """Owns a GatewayService + HTTP server in this process (fake mode)."""

    def __init__(self):
        self._service = GatewayService()
        self._server = GatewayServer(self._service, admin_token="local-admin")
        self.agent_url = self._server.base_url

    def register_run(self, run_id: str, policy: dict) -> str:
        return self._service.register_run(run_id, policy)

    def start_case(self, run_id: str, case_id: str, context: dict) -> None:
        self._service.start_case(run_id, case_id, context)

    def records(self, run_id: str) -> list[TraceRecord]:
        return self._service.records(run_id)

    def close_run(self, run_id: str) -> None:
        self._service.close_run(run_id)

    def close(self) -> None:
        self._server.close()


class K8sGatewayAccess:
    """Talks to the in-cluster gateway over a kubectl port-forward.

    Agents reach the gateway via cluster DNS; the orchestrator uses the
    forwarded local port with the admin token from the gateway-admin secret.
    """

    def __init__(self, namespace: str = "agent-eval-runs",
                 context: str = "kind-agent-eval", local_port: int = 19000):
        self.agent_url = "http://agent-eval-gateway:9000"
        self._admin_url = f"http://127.0.0.1:{local_port}"
        kubectl = ["kubectl", "--context", context, "-n", namespace]
        token_b64 = subprocess.run(
            [*kubectl, "get", "secret", "gateway-admin",
             "-o", "jsonpath={.data.token}"],
            capture_output=True, text=True, check=True).stdout
        import base64
        self._admin_token = base64.b64decode(token_b64).decode()
        self._forward = subprocess.Popen(
            [*kubectl, "port-forward", "svc/agent-eval-gateway",
             f"{local_port}:9000"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self._wait_admin_reachable()

    def _wait_admin_reachable(self, timeout_s: int = 15) -> None:
        import time
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            try:
                urllib.request.urlopen(f"{self._admin_url}/healthz", timeout=2)
                return
            except (urllib.error.URLError, OSError):
                time.sleep(0.5)
        raise RuntimeError("Gateway port-forward did not become reachable")

    def _request(self, method: str, path: str, payload: dict | None = None) -> dict:
        request = urllib.request.Request(
            f"{self._admin_url}{path}",
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {self._admin_token}"},
            method=method)
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())

    def register_run(self, run_id: str, policy: dict) -> str:
        return self._request("POST", "/runs",
                             {"run_id": run_id, "policy": policy})["run_token"]

    def start_case(self, run_id: str, case_id: str, context: dict) -> None:
        self._request("POST", f"/runs/{run_id}/cases",
                      {"case_id": case_id, "context": context})

    def records(self, run_id: str) -> list[TraceRecord]:
        body = self._request("GET", f"/runs/{run_id}/records")
        return [trace_from_dict(t) for t in body["traces"]]

    def close_run(self, run_id: str) -> None:
        self._request("DELETE", f"/runs/{run_id}")

    def close(self) -> None:
        self._forward.terminate()


class Orchestrator:
    def __init__(self, queue: RunQueue, registry: MarketplaceRegistry,
                 runner: SandboxRunner, gateway: GatewayAccess,
                 reports_dir: Path, runner_type: str = "fake"):
        self._queue = queue
        self._registry = registry
        self._runner = runner
        self._gateway = gateway
        self._reports_dir = Path(reports_dir)
        self._runner_type = runner_type
        self._evaluator = CodeEvaluator()

    def execute(self, run: RunRecord, cases: list[EvalCase] | None = None) -> RunRecord:
        cases = cases if cases is not None else default_cases()
        registered = self._registry.get(run.agent_id, run.version)
        if registered is None:
            self._queue.finish(run.run_id, "FAILED",
                               error=f"Agent {run.agent_id}@{run.version} not registered")
            return self._queue.get(run.run_id)
        manifest = registered.manifest

        policy = policy_from_tools_config(load_tools_config())
        token = self._gateway.register_run(run.run_id, policy)
        spec = SandboxSpec(
            run_id=run.run_id,
            image_digest=manifest.image_digest,
            port=manifest.port,
            env={"EVAL_GATEWAY_URL": self._gateway.agent_url,
                 "EVAL_RUN_TOKEN": token},
            cpu=manifest.cpu,
            memory=manifest.memory,
            run_deadline_s=manifest.timeout_per_case_s * len(cases) + RUN_DEADLINE_MARGIN_S,
            labels={"agent": manifest.agent_id.replace("/", "_")},
        )

        case_results: list[dict] = []
        status = "COMPLETED"
        handle = None
        try:
            try:
                handle = self._runner.provision(spec)
                self._runner.wait_ready(handle, timeout_s=READY_TIMEOUT_S)
            except SandboxError as error:
                log_tail = self._runner.logs(handle) if handle else ""
                self._queue.finish(run.run_id, "FAILED",
                                   error=f"{error}\n{log_tail}".strip()[:4000])
                return self._queue.get(run.run_id)

            for case in cases:
                self._gateway.start_case(run.run_id, case.case_id, {"role": case.role})
                outcome = self._invoke_case(handle, run.run_id, case,
                                            manifest.timeout_per_case_s)
                case_results.append(outcome)
                if outcome["status"] == "INCOMPLETE" and \
                        self._runner.status(handle) == SandboxStatus.EXPIRED:
                    status = "PARTIAL"
                    break
        finally:
            if handle is not None:
                self._runner.teardown(handle)

        traces = {t.name: t for t in self._gateway.records(run.run_id)}
        self._gateway.close_run(run.run_id)
        for outcome, case in zip(case_results, cases):
            if outcome["status"] == "INCOMPLETE":
                continue
            trace = traces.get(case.case_id,
                               TraceRecord(trace_id=case.case_id, name=case.case_id))
            scores, reasons = self._evaluator.evaluate(trace, case.expected)
            passed = all(value == 1.0 for value in scores.values())
            outcome.update(scores=scores, reasons=reasons,
                           status="PASS" if passed else "FAIL")

        if len(case_results) < len(cases):
            status = "PARTIAL"

        report_path = self._write_report(run, manifest, case_results, status)
        self._queue.finish(run.run_id, status, report_path=str(report_path),
                           results={"cases": case_results})
        return self._queue.get(run.run_id)

    def _invoke_case(self, handle, run_id: str, case: EvalCase,
                     timeout_s: int) -> dict:
        outcome = {"case_id": case.case_id, "scenario": case.scenario,
                   "query": case.query, "role": case.role,
                   "status": "INCOMPLETE", "output": "", "scores": {}, "reasons": {}}
        request = urllib.request.Request(
            f"{handle.endpoint}/invoke",
            data=json.dumps({"run_id": run_id, "case_id": case.case_id,
                             "input": case.query,
                             "context": {"role": case.role}}).encode(),
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=timeout_s) as response:
                body = json.loads(response.read())
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as error:
            outcome["output"] = f"invoke failed: {error}"
            return outcome
        outcome["output"] = body.get("output", "")
        outcome["status"] = "EVALUATING" if body.get("status") == "ok" else "INCOMPLETE"
        if body.get("status") != "ok":
            outcome["output"] = f"agent error: {body.get('error')}"
        return outcome

    def _write_report(self, run: RunRecord, manifest: AgentManifest,
                      case_results: list[dict], status: str) -> Path:
        markdown = render_report(run=run, manifest=manifest,
                                 case_results=case_results, status=status,
                                 runner_type=self._runner_type)
        path = self._reports_dir / f"{run.run_id}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(markdown, encoding="utf-8")
        return path
