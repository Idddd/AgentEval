"""Client for the harness-owned Tool Gateway (guard checks and tool calls)."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from .protocol import GATEWAY_URL_ENV, RUN_TOKEN_ENV, GuardVerdict, ToolResult


class GatewayError(RuntimeError):
    """The gateway rejected the request at the transport/auth level."""


class GatewayClient:
    def __init__(self, base_url: str, run_token: str, timeout_s: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.run_token = run_token
        self._timeout_s = timeout_s

    @classmethod
    def from_env(cls) -> "GatewayClient":
        url = os.environ.get(GATEWAY_URL_ENV, "")
        token = os.environ.get(RUN_TOKEN_ENV, "")
        if not url or not token:
            raise GatewayError(
                f"{GATEWAY_URL_ENV} and {RUN_TOKEN_ENV} must be set by the eval harness")
        return cls(url, token)

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {self.run_token}"},
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout_s) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            raise GatewayError(f"Gateway returned HTTP {error.code} for {path}") from error
        except urllib.error.URLError as error:
            raise GatewayError(f"Gateway unreachable at {self.base_url}: {error.reason}") from error

    def guard_check(self, tool: str, arguments: dict[str, Any], *, case_id: str) -> GuardVerdict:
        data = self._post("/guard/check",
                          {"tool": tool, "arguments": arguments, "case_id": case_id})
        return GuardVerdict(allowed=bool(data.get("allowed")), reason=str(data.get("reason", "")))

    def call_tool(self, tool: str, arguments: dict[str, Any], *, case_id: str) -> ToolResult:
        data = self._post(f"/tools/{tool}",
                          {"tool": tool, "arguments": arguments, "case_id": case_id})
        return ToolResult(ok=bool(data.get("ok")), output=data.get("output"),
                          error=data.get("error"))
