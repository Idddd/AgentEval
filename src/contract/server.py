"""HTTP surface an Agent exposes to the eval harness: /healthz and /invoke."""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable

from .protocol import InvokeRequest, InvokeResponse

MAX_RESPONSE_BYTES = 256 * 1024
MAX_REQUEST_BYTES = 256 * 1024

Handler = Callable[[InvokeRequest], InvokeResponse]


class AgentServer:
    """Serves an Agent handler on 127.0.0.1 (or a given host) in a thread."""

    def __init__(self, handler: Handler, port: int = 0, host: str = "127.0.0.1"):
        self._handler = handler
        self._http = ThreadingHTTPServer((host, port), self._make_request_handler())
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

    def _make_request_handler(self):
        agent_handler = self._handler

        class RequestHandler(BaseHTTPRequestHandler):
            def log_message(self, *args) -> None:
                pass

            def _send_json(self, status: int, payload: dict) -> None:
                body = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self) -> None:
                if self.path == "/healthz":
                    self._send_json(200, {"status": "ok"})
                else:
                    self._send_json(404, {"error": f"Unknown path {self.path}"})

            def do_POST(self) -> None:
                if self.path != "/invoke":
                    self._send_json(404, {"error": f"Unknown path {self.path}"})
                    return
                length = int(self.headers.get("Content-Length", 0))
                if length > MAX_REQUEST_BYTES:
                    self._send_json(400, {"error": "Request body too large"})
                    return
                try:
                    data = json.loads(self.rfile.read(length))
                except (json.JSONDecodeError, UnicodeDecodeError):
                    self._send_json(400, {"error": "Request body is not valid JSON"})
                    return
                request = InvokeRequest(
                    run_id=str(data.get("run_id", "")),
                    case_id=str(data.get("case_id", "")),
                    input=str(data.get("input", "")),
                    context=data.get("context") or {},
                )
                try:
                    response = agent_handler(request)
                except Exception as error:
                    response = InvokeResponse(status="error", error=f"{type(error).__name__}: {error}")
                if len(response.output.encode()) > MAX_RESPONSE_BYTES:
                    response = InvokeResponse(
                        status="error",
                        error=f"Agent output exceeded the {MAX_RESPONSE_BYTES // 1024} KiB "
                              f"(256 KiB) response limit")
                self._send_json(200, {"output": response.output,
                                      "status": response.status,
                                      "error": response.error})

        return RequestHandler
