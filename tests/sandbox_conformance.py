"""Reusable conformance assertions every SandboxRunner must satisfy.

Callers (fake and k8s test modules) provide a runner plus SandboxSpecs whose
image implements the conformance probe protocol over `/invoke` input:

- ``__conformance_echo:<text>``  -> output ``echo:<text>``
- ``__conformance_env``          -> output = JSON object of the agent's env
- ``__conformance_egress:<url>`` -> attempts an HTTP GET to <url>; output
  ``egress:ok`` on success, ``egress:blocked:<reason>`` on failure

The reference agent implements the same probes, so one image serves both the
demo and this suite.
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request

import pytest

from src.sandbox.base import (
    SandboxHandle,
    SandboxNotReadyError,
    SandboxRunner,
    SandboxSpec,
    SandboxStatus,
)

SECRET_ENV_PATTERN = re.compile(r"(_KEY|_TOKEN|_SECRET|_PASSWORD)$")
ALLOWED_SECRET_LIKE = {"EVAL_RUN_TOKEN"}


def invoke(handle: SandboxHandle, input_text: str, timeout_s: float = 30.0) -> dict:
    request = urllib.request.Request(
        f"{handle.endpoint}/invoke",
        data=json.dumps({"run_id": "conf", "case_id": "c1", "input": input_text}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout_s) as response:
        return json.loads(response.read())


def check_round_trip(runner: SandboxRunner, spec: SandboxSpec) -> None:
    handle = runner.provision(spec)
    try:
        runner.wait_ready(handle, timeout_s=60)
        assert runner.status(handle) == SandboxStatus.READY
        body = invoke(handle, "__conformance_echo:hello")
        assert body["status"] == "ok"
        assert body["output"] == "echo:hello"
    finally:
        runner.teardown(handle)


def check_not_ready(runner: SandboxRunner, broken_spec: SandboxSpec,
                    timeout_s: int = 3) -> None:
    handle = runner.provision(broken_spec)
    try:
        with pytest.raises(SandboxNotReadyError):
            runner.wait_ready(handle, timeout_s=timeout_s)
    finally:
        runner.teardown(handle)


def check_deadline_expiry(runner: SandboxRunner, short_deadline_spec: SandboxSpec) -> None:
    assert short_deadline_spec.run_deadline_s <= 5, "test spec must expire quickly"
    handle = runner.provision(short_deadline_spec)
    try:
        runner.wait_ready(handle, timeout_s=60)
        time.sleep(short_deadline_spec.run_deadline_s + 1)
        assert runner.status(handle) == SandboxStatus.EXPIRED
        with pytest.raises((urllib.error.URLError, AssertionError, OSError)):
            invoke(handle, "__conformance_echo:late", timeout_s=5)
    finally:
        runner.teardown(handle)


def check_env_and_secret_absence(runner: SandboxRunner, spec: SandboxSpec) -> None:
    assert "EVAL_GATEWAY_URL" in spec.env and "EVAL_RUN_TOKEN" in spec.env
    handle = runner.provision(spec)
    try:
        runner.wait_ready(handle, timeout_s=60)
        env = json.loads(invoke(handle, "__conformance_env")["output"])
        assert env.get("EVAL_GATEWAY_URL") == spec.env["EVAL_GATEWAY_URL"]
        assert env.get("EVAL_RUN_TOKEN") == spec.env["EVAL_RUN_TOKEN"]
        leaked = [key for key in env
                  if SECRET_ENV_PATTERN.search(key) and key not in ALLOWED_SECRET_LIKE]
        assert leaked == [], f"secret-like env leaked into sandbox: {leaked}"
    finally:
        runner.teardown(handle)


def check_teardown_idempotent(runner: SandboxRunner, spec: SandboxSpec) -> None:
    handle = runner.provision(spec)
    runner.wait_ready(handle, timeout_s=60)
    runner.teardown(handle)
    runner.teardown(handle)
    assert runner.status(handle) == SandboxStatus.GONE


def check_reaping(runner: SandboxRunner, spec: SandboxSpec) -> None:
    handle = runner.provision(spec)
    runner.wait_ready(handle, timeout_s=60)
    reaped = runner.reap_expired(active_run_ids=set())
    assert handle.sandbox_id in reaped
    assert runner.status(handle) == SandboxStatus.GONE


def check_egress_denied(runner: SandboxRunner, spec: SandboxSpec,
                        external_url: str = "https://example.com") -> None:
    """k8s-only: the sandbox must not reach arbitrary external hosts."""
    handle = runner.provision(spec)
    try:
        runner.wait_ready(handle, timeout_s=60)
        body = invoke(handle, f"__conformance_egress:{external_url}", timeout_s=60)
        assert body["output"].startswith("egress:blocked"), (
            f"sandbox reached {external_url}; NetworkPolicy is not enforced "
            f"(is Calico installed?): {body}")
    finally:
        runner.teardown(handle)
