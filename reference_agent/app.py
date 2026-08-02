"""Reference Agent implementing the agent-eval/v1 contract.

This is the executable example for marketplace authors and the conformance
fixture. It depends ONLY on the contract SDK: in the container the SDK is
vendored as `contract/`; in the repository it resolves to `src.contract`.

Behavior (ported from the original in-process TargetAgent):
- rule-based intent matching picks a tool from keywords;
- high-sensitivity tools require a gateway guard check first;
- the literal input marker ``[demo_bypass]`` reproduces the demo's injected
  bug: the guard step is skipped, so the gateway refuses the call and every
  demo run shows one real MISSING_GUARD failure;
- ``__conformance_*`` probe inputs implement tests/sandbox_conformance.py.
"""
from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.request
from typing import Callable, Mapping

try:  # vendored layout inside the container image
    from contract.gateway_client import GatewayClient
    from contract.protocol import InvokeRequest, InvokeResponse
    from contract.server import AgentServer
except ImportError:  # repository layout (tests)
    from src.contract.gateway_client import GatewayClient
    from src.contract.protocol import InvokeRequest, InvokeResponse
    from src.contract.server import AgentServer

BYPASS_MARKER = "[demo_bypass]"

KEYWORDS: dict[str, list[str]] = {
    "WeatherTool": ["weather", "temperature", "rain", "sunny"],
    "EmployeeQueryTool": ["salary", "wage", "performance", "employee"],
    "SystemRestartTool": ["restart", "service"],
}

HIGH_SENSITIVITY = {"EmployeeQueryTool", "SystemRestartTool"}


def _match_tool(query: str) -> str | None:
    lowered = query.lower()
    for tool_name, keywords in KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return tool_name
    return None


def _conformance_probe(text: str, env: Mapping[str, str]) -> InvokeResponse | None:
    if text.startswith("__conformance_echo:"):
        return InvokeResponse(output="echo:" + text.split(":", 1)[1])
    if text == "__conformance_env":
        return InvokeResponse(output=json.dumps(dict(env)))
    if text.startswith("__conformance_egress:"):
        url = text.split(":", 1)[1]
        try:
            urllib.request.urlopen(url, timeout=5)
            return InvokeResponse(output="egress:ok")
        except (urllib.error.URLError, OSError) as error:
            return InvokeResponse(output=f"egress:blocked:{error}")
    if text.startswith("__conformance_tcp:"):
        # Raw TCP reachability probe. Used to prove NetworkPolicy enforcement
        # against in-cluster addresses, which (unlike the internet) do not
        # depend on the environment having outbound connectivity.
        _, host, port = text.split(":", 2)
        probe = socket.socket()
        probe.settimeout(5)
        try:
            probe.connect((host, int(port)))
            return InvokeResponse(output="tcp:ok")
        except OSError as error:
            return InvokeResponse(output=f"tcp:blocked:{error}")
        finally:
            probe.close()
    return None


def handler_factory(env: Mapping[str, str]) -> Callable[[InvokeRequest], InvokeResponse]:
    gateway = GatewayClient(env["EVAL_GATEWAY_URL"], env["EVAL_RUN_TOKEN"])

    def handler(request: InvokeRequest) -> InvokeResponse:
        probe = _conformance_probe(request.input, env)
        if probe is not None:
            return probe

        query = request.input.replace(BYPASS_MARKER, "").strip()
        skip_guard = BYPASS_MARKER in request.input
        tool = _match_tool(query)
        if tool is None:
            return InvokeResponse(output="No matching tool for this request.")

        if tool in HIGH_SENSITIVITY and not skip_guard:
            verdict = gateway.guard_check(tool, {"query": query}, case_id=request.case_id)
            if not verdict.allowed:
                return InvokeResponse(
                    output=f"Request denied by permission policy: {verdict.reason}")

        result = gateway.call_tool(tool, {"query": query}, case_id=request.case_id)
        if not result.ok:
            return InvokeResponse(output=f"Tool call failed: {result.error}")
        return InvokeResponse(output=str(result.output.get("result", result.output)))

    return handler


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    server = AgentServer(handler_factory(os.environ), port=port, host="0.0.0.0")
    print(f"[reference-agent] listening on :{server.port}", flush=True)
    import time
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        server.close()


if __name__ == "__main__":
    main()
