"""Stdlib HTTP wrapper around GatewayService.

Agent-side routes (Bearer run token):
    POST /guard/check           {tool, arguments, case_id}
    POST /tools/{name}          {tool, arguments, case_id}

Harness-side routes (Bearer admin token):
    POST   /runs                {run_id, policy}         -> {run_token}
    POST   /runs/{id}/cases     {case_id, context}
    GET    /runs/{id}/records                            -> {traces: [...]}
    DELETE /runs/{id}
"""
from __future__ import annotations

import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .records import trace_to_dict
from .service import GatewayAuthError, GatewayService, UnknownRunError

MAX_REQUEST_BYTES = 64 * 1024

_TOOLS_RE = re.compile(r"^/tools/([A-Za-z0-9_\-]+)$")
_CASES_RE = re.compile(r"^/runs/([^/]+)/cases$")
_RECORDS_RE = re.compile(r"^/runs/([^/]+)/records$")
_RUN_RE = re.compile(r"^/runs/([^/]+)$")


class GatewayServer:
    def __init__(self, service: GatewayService, admin_token: str,
                 port: int = 0, host: str = "127.0.0.1"):
        self._service = service
        self._admin_token = admin_token
        self._http = ThreadingHTTPServer((host, port), self._make_handler())
        self._thread = threading.Thread(target=self._http.serve_forever, daemon=True)
        self._thread.start()
        self._closed = False

    @property
    def port(self) -> int:
        return self._http.server_address[1]

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._http.shutdown()
        self._http.server_close()

    def _make_handler(self):
        service = self._service
        admin_token = self._admin_token

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args) -> None:
                pass

            def _token(self) -> str:
                header = self.headers.get("Authorization", "")
                return header.removeprefix("Bearer ").strip()

            def _send(self, status: int, payload: dict) -> None:
                body = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def _body(self) -> dict | None:
                length = int(self.headers.get("Content-Length", 0))
                if length > MAX_REQUEST_BYTES:
                    self._send(400, {"error": "Request body too large"})
                    return None
                try:
                    return json.loads(self.rfile.read(length) or b"{}")
                except (json.JSONDecodeError, UnicodeDecodeError):
                    self._send(400, {"error": "Request body is not valid JSON"})
                    return None

            def _require_admin(self) -> bool:
                if self._token() != admin_token:
                    self._send(401, {"error": "Admin token required"})
                    return False
                return True

            def do_POST(self) -> None:
                data = self._body()
                if data is None:
                    return
                if self.path == "/guard/check" or _TOOLS_RE.match(self.path):
                    tool_match = _TOOLS_RE.match(self.path)
                    tool = tool_match.group(1) if tool_match else str(data.get("tool", ""))
                    method = service.call_tool if tool_match else service.guard_check
                    try:
                        result = method(self._token(), str(data.get("case_id", "")),
                                        tool, data.get("arguments") or {})
                    except GatewayAuthError:
                        self._send(401, {"error": "Invalid or expired run token"})
                        return
                    self._send(200, result)
                    return
                if self.path == "/runs":
                    if not self._require_admin():
                        return
                    try:
                        token = service.register_run(str(data["run_id"]),
                                                     data.get("policy") or {})
                    except ValueError as error:
                        self._send(409, {"error": str(error)})
                        return
                    self._send(200, {"run_token": token})
                    return
                cases = _CASES_RE.match(self.path)
                if cases:
                    if not self._require_admin():
                        return
                    try:
                        service.start_case(cases.group(1), str(data["case_id"]),
                                           data.get("context") or {})
                    except UnknownRunError:
                        self._send(404, {"error": "Unknown run"})
                        return
                    self._send(200, {"ok": True})
                    return
                self._send(404, {"error": f"Unknown path {self.path}"})

            def do_GET(self) -> None:
                if self.path == "/healthz":
                    self._send(200, {"status": "ok"})
                    return
                records = _RECORDS_RE.match(self.path)
                if records:
                    if not self._require_admin():
                        return
                    try:
                        traces = service.records(records.group(1))
                    except UnknownRunError:
                        self._send(404, {"error": "Unknown run"})
                        return
                    self._send(200, {"traces": [trace_to_dict(t) for t in traces]})
                    return
                self._send(404, {"error": f"Unknown path {self.path}"})

            def do_DELETE(self) -> None:
                run = _RUN_RE.match(self.path)
                if run:
                    if not self._require_admin():
                        return
                    try:
                        self._service_close(run.group(1))
                    except UnknownRunError:
                        self._send(404, {"error": "Unknown run"})
                        return
                    self._send(200, {"ok": True})
                    return
                self._send(404, {"error": f"Unknown path {self.path}"})

            def _service_close(self, run_id: str) -> None:
                service.close_run(run_id)

        return Handler
