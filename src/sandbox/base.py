"""Abstract sandbox execution layer.

A SandboxRunner provisions an isolated environment for one untrusted Agent
container, exposes an endpoint for the orchestrator to drive `/invoke`, and
guarantees cleanup. Implementations: FakeSandboxRunner (in-process, tests)
and KubernetesPodRunner (pods). See the 2026-08-02 design spec.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Collection, Mapping


@dataclass(frozen=True)
class SandboxSpec:
    run_id: str
    image_digest: str
    port: int
    env: Mapping[str, str] = field(default_factory=dict)
    cpu: str = "1"
    memory: str = "1Gi"
    run_deadline_s: int = 600
    labels: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class SandboxHandle:
    sandbox_id: str
    endpoint: str


class SandboxStatus(str, Enum):
    PENDING = "PENDING"
    READY = "READY"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"
    GONE = "GONE"


class SandboxError(Exception):
    """Base class for sandbox failures."""


class SandboxProvisionError(SandboxError):
    """Image pull, quota, or scheduling failure while creating the sandbox."""


class SandboxNotReadyError(SandboxError):
    """The Agent did not become healthy within the readiness timeout."""


class SandboxExpiredError(SandboxError):
    """The run wall-clock deadline elapsed."""


class SandboxRunner(ABC):
    @abstractmethod
    def provision(self, spec: SandboxSpec) -> SandboxHandle: ...

    @abstractmethod
    def wait_ready(self, handle: SandboxHandle, timeout_s: int = 60) -> None: ...

    @abstractmethod
    def status(self, handle: SandboxHandle) -> SandboxStatus: ...

    @abstractmethod
    def logs(self, handle: SandboxHandle, tail: int = 500) -> str: ...

    @abstractmethod
    def teardown(self, handle: SandboxHandle) -> None: ...

    @abstractmethod
    def reap_expired(self, active_run_ids: Collection[str]) -> list[str]:
        """Delete sandboxes whose run_id is not active; return their sandbox_ids."""
