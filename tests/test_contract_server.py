"""agent-eval/v1 contract SDK: AgentServer and GatewayClient (plan Task 2)."""
import json
import socket
import urllib.error
import urllib.request

import pytest

from src.contract.gateway_client import GatewayClient
from src.contract.protocol import InvokeRequest, InvokeResponse
from src.contract.server import MAX_RESPONSE_BYTES, AgentServer


def _post(url: str, payload: dict | str) -> tuple[int, dict]:
    body = payload if isinstance(payload, str) else json.dumps(payload)
    request = urllib.request.Request(
        url, data=body.encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, {}


def _get_status(url: str) -> tuple[int, dict]:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, {}


@pytest.fixture()
def echo_server():
    def handler(request: InvokeRequest) -> InvokeResponse:
        if request.input == "boom":
            raise RuntimeError("secret handler detail")
        if request.input == "huge":
            return InvokeResponse(output="x" * (MAX_RESPONSE_BYTES + 1))
        return InvokeResponse(output=f"echo:{request.input}:{request.case_id}")

    server = AgentServer(handler)
    yield server
    server.close()


def test_healthz_returns_ok(echo_server):
    status, body = _get_status(f"{echo_server.base_url}/healthz")
    assert (status, body) == (200, {"status": "ok"})


def test_invoke_round_trip(echo_server):
    status, body = _post(f"{echo_server.base_url}/invoke", {
        "run_id": "r1", "case_id": "c1", "input": "hello", "context": {"role": "admin"}})
    assert status == 200
    assert body == {"output": "echo:hello:c1", "status": "ok", "error": None}


def test_handler_exception_becomes_error_response(echo_server):
    status, body = _post(f"{echo_server.base_url}/invoke",
                         {"run_id": "r1", "case_id": "c1", "input": "boom"})
    assert status == 200
    assert body["status"] == "error"
    assert "secret handler detail" in body["error"]


def test_oversized_output_is_replaced_with_truncation_error(echo_server):
    status, body = _post(f"{echo_server.base_url}/invoke",
                         {"run_id": "r1", "case_id": "c1", "input": "huge"})
    assert status == 200
    assert body["status"] == "error"
    assert "256" in body["error"]


def test_malformed_json_is_400_and_unknown_path_404(echo_server):
    status, _ = _post(f"{echo_server.base_url}/invoke", "{not json")
    assert status == 400
    status, _ = _post(f"{echo_server.base_url}/nope", {})
    assert status == 404
    status, _ = _get_status(f"{echo_server.base_url}/nope")
    assert status == 404


def test_close_releases_port_and_is_idempotent():
    server = AgentServer(lambda request: InvokeResponse(output="ok"))
    port = server.port
    server.close()
    server.close()
    probe = socket.socket()
    probe.bind(("127.0.0.1", port))
    probe.close()


class _StubGateway:
    """Records the request the client sends and returns a canned response."""

    def __init__(self, response: dict):
        self.response = response
        self.seen: dict = {}

        stub = self

        def handler(request: InvokeRequest) -> InvokeResponse:  # pragma: no cover
            raise NotImplementedError

        import http.server
        import threading

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", 0))
                stub.seen = {
                    "path": self.path,
                    "auth": self.headers.get("Authorization"),
                    "body": json.loads(self.rfile.read(length)),
                }
                payload = json.dumps(stub.response).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *args):
                pass

        self._server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        self.base_url = f"http://127.0.0.1:{self._server.server_address[1]}"

    def close(self):
        self._server.shutdown()
        self._server.server_close()


def test_gateway_client_guard_check_request_shape():
    stub = _StubGateway({"allowed": False, "reason": "role lacks permission"})
    try:
        client = GatewayClient(stub.base_url, "token-123")
        verdict = client.guard_check("SystemRestartTool", {"service": "pay"}, case_id="c9")
        assert (verdict.allowed, verdict.reason) == (False, "role lacks permission")
        assert stub.seen["path"] == "/guard/check"
        assert stub.seen["auth"] == "Bearer token-123"
        assert stub.seen["body"] == {"tool": "SystemRestartTool",
                                     "arguments": {"service": "pay"}, "case_id": "c9"}
    finally:
        stub.close()


def test_gateway_client_call_tool_request_shape():
    stub = _StubGateway({"ok": True, "output": {"restarted": True}, "error": None})
    try:
        client = GatewayClient(stub.base_url, "token-123")
        result = client.call_tool("SystemRestartTool", {"service": "pay"}, case_id="c9")
        assert (result.ok, result.output, result.error) == (True, {"restarted": True}, None)
        assert stub.seen["path"] == "/tools/SystemRestartTool"
    finally:
        stub.close()


def test_gateway_client_from_env(monkeypatch):
    monkeypatch.setenv("EVAL_GATEWAY_URL", "http://gateway:9000")
    monkeypatch.setenv("EVAL_RUN_TOKEN", "tok")
    client = GatewayClient.from_env()
    assert client.base_url == "http://gateway:9000"
    assert client.run_token == "tok"
