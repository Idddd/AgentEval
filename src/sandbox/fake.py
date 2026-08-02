"""In-process SandboxRunner for hermetic tests.

Serves registered handler factories through the real contract AgentServer on
an ephemeral localhost port — no Docker, no cluster. A factory receives the
sandbox env mapping (only what SandboxSpec.env provides; the host process
environment is never leaked) and returns an invoke handler.
"""
from __future__ import annotations

import threading
import time
import uuid
from typing import Callable, Collection, Mapping

from ..contract.protocol import InvokeRequest, InvokeResponse
from ..contract.server import AgentServer
from .base import (
    SandboxHandle,
    SandboxNotReadyError,
    SandboxProvisionError,
    SandboxRunner,
    SandboxSpec,
    SandboxStatus,
)

HandlerFactory = Callable[[Mapping[str, str]], Callable[[InvokeRequest], InvokeResponse]]

NEVER_READY = "__never_ready__"


class _FakeSandbox:
    def __init__(self, spec: SandboxSpec, server: AgentServer | None):
        self.spec = spec
        self.server = server
        self.deadline = time.monotonic() + spec.run_deadline_s
        self.gone = False
        self.log_lines: list[str] = [f"provisioned image {spec.image_digest}"]
        self.timer: threading.Timer | None = None


class FakeSandboxRunner(SandboxRunner):
    def __init__(self, images: Mapping[str, HandlerFactory | str]):
        self._images = dict(images)
        self._sandboxes: dict[str, _FakeSandbox] = {}

    def provision(self, spec: SandboxSpec) -> SandboxHandle:
        # "*" registers a fallback handler for any digest (worker fake mode).
        factory = self._images.get(spec.image_digest) or self._images.get("*")
        if factory is None:
            raise SandboxProvisionError(
                f"Image {spec.image_digest} is not available to the fake runner")
        sandbox_id = f"fake-{spec.run_id}-{uuid.uuid4().hex[:8]}"
        if factory == NEVER_READY:
            sandbox = _FakeSandbox(spec, server=None)
        else:
            handler = factory(dict(spec.env))
            server = AgentServer(handler)
            sandbox = _FakeSandbox(spec, server=server)
            sandbox.timer = threading.Timer(spec.run_deadline_s, server.close)
            sandbox.timer.daemon = True
            sandbox.timer.start()
        self._sandboxes[sandbox_id] = sandbox
        endpoint = sandbox.server.base_url if sandbox.server else "http://127.0.0.1:0"
        return SandboxHandle(sandbox_id=sandbox_id, endpoint=endpoint)

    def _get(self, handle: SandboxHandle) -> _FakeSandbox:
        return self._sandboxes[handle.sandbox_id]

    def wait_ready(self, handle: SandboxHandle, timeout_s: int = 60) -> None:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            if self._get(handle).server is not None:
                return
            time.sleep(0.05)
        raise SandboxNotReadyError(
            f"Sandbox {handle.sandbox_id} did not become healthy within {timeout_s}s")

    def status(self, handle: SandboxHandle) -> SandboxStatus:
        sandbox = self._sandboxes.get(handle.sandbox_id)
        if sandbox is None or sandbox.gone:
            return SandboxStatus.GONE
        if time.monotonic() > sandbox.deadline:
            return SandboxStatus.EXPIRED
        if sandbox.server is None:
            return SandboxStatus.PENDING
        return SandboxStatus.READY

    def logs(self, handle: SandboxHandle, tail: int = 500) -> str:
        sandbox = self._sandboxes.get(handle.sandbox_id)
        return "\n".join(sandbox.log_lines[-tail:]) if sandbox else ""

    def teardown(self, handle: SandboxHandle) -> None:
        sandbox = self._sandboxes.get(handle.sandbox_id)
        if sandbox is None or sandbox.gone:
            return
        if sandbox.timer is not None:
            sandbox.timer.cancel()
        if sandbox.server is not None:
            sandbox.server.close()
        sandbox.gone = True
        sandbox.log_lines.append("teardown complete")

    def reap_expired(self, active_run_ids: Collection[str]) -> list[str]:
        reaped = []
        for sandbox_id, sandbox in list(self._sandboxes.items()):
            if not sandbox.gone and sandbox.spec.run_id not in active_run_ids:
                self.teardown(SandboxHandle(sandbox_id=sandbox_id, endpoint=""))
                reaped.append(sandbox_id)
        return reaped
