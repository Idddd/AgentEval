"""GatewayServer HTTP routes, auth, and record serialization (plan Task 4)."""
import json
import urllib.error
import urllib.request

import pytest

from src.contract.gateway_client import GatewayClient, GatewayError
from src.gateway.records import trace_from_dict
from src.gateway.server import GatewayServer
from src.gateway.service import GatewayService
from tests.test_gateway_service import POLICY

ADMIN = "admin-secret"


def _request(method, url, payload=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read() or b"{}")


@pytest.fixture()
def server():
    gateway_server = GatewayServer(GatewayService(), admin_token=ADMIN)
    yield gateway_server
    gateway_server.close()


def _register(server, role="admin"):
    status, body = _request("POST", f"{server.base_url}/runs",
                            {"run_id": "run-1", "policy": POLICY}, token=ADMIN)
    assert status == 200
    _request("POST", f"{server.base_url}/runs/run-1/cases",
             {"case_id": "c1", "context": {"role": role}}, token=ADMIN)
    return body["run_token"]


def test_admin_routes_require_admin_token(server):
    status, _ = _request("POST", f"{server.base_url}/runs",
                         {"run_id": "run-1", "policy": POLICY}, token="wrong")
    assert status == 401
    status, _ = _request("GET", f"{server.base_url}/runs/run-1/records", token="wrong")
    assert status == 401


def test_agent_flow_through_contract_client(server):
    run_token = _register(server)
    client = GatewayClient(server.base_url, run_token)
    verdict = client.guard_check("SystemRestartTool", {}, case_id="c1")
    assert verdict.allowed is True
    result = client.call_tool("SystemRestartTool",
                              {"query": "Restart the payment service"}, case_id="c1")
    assert result.ok is True
    assert "restarted" in result.output["result"]


def test_wrong_run_token_is_401(server):
    _register(server)
    client = GatewayClient(server.base_url, "wrong-token")
    with pytest.raises(GatewayError, match="401"):
        client.guard_check("WeatherTool", {}, case_id="c1")


def test_records_round_trip_serialization(server):
    run_token = _register(server)
    client = GatewayClient(server.base_url, run_token)
    client.guard_check("SystemRestartTool", {}, case_id="c1")
    client.call_tool("SystemRestartTool", {"query": "restart x"}, case_id="c1")
    status, body = _request("GET", f"{server.base_url}/runs/run-1/records", token=ADMIN)
    assert status == 200
    trace = trace_from_dict(body["traces"][0])
    assert trace.find_span("permission_guard").output == {"granted": True}
    exec_span = trace.find_span("tool_execution")
    assert trace.children_of(exec_span.id)[0].name == "SystemRestartTool"


def test_delete_run_closes_it(server):
    run_token = _register(server)
    status, _ = _request("DELETE", f"{server.base_url}/runs/run-1", token=ADMIN)
    assert status == 200
    client = GatewayClient(server.base_url, run_token)
    with pytest.raises(GatewayError, match="401"):
        client.call_tool("WeatherTool", {"query": "weather"}, case_id="c1")


def test_healthz_is_public(server):
    with urllib.request.urlopen(f"{server.base_url}/healthz", timeout=5) as response:
        assert response.status == 200
