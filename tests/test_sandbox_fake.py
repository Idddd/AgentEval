"""FakeSandboxRunner runs the shared conformance suite (plan Task 3)."""
import json
import socket
import urllib.error
import urllib.request

import pytest

from src.contract.protocol import InvokeRequest, InvokeResponse
from src.sandbox.base import SandboxProvisionError, SandboxSpec
from src.sandbox.fake import NEVER_READY, FakeSandboxRunner
from tests import sandbox_conformance as conformance

GOOD_IMAGE = "fake.local/conformance@sha256:" + "b" * 64
BROKEN_IMAGE = "fake.local/broken@sha256:" + "c" * 64


def conformance_handler_factory(env):
    """In-process twin of the reference agent's conformance probes."""

    def handler(request: InvokeRequest) -> InvokeResponse:
        text = request.input
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
        return InvokeResponse(output=f"unhandled:{text}")

    return handler


@pytest.fixture()
def runner():
    return FakeSandboxRunner({GOOD_IMAGE: conformance_handler_factory,
                              BROKEN_IMAGE: NEVER_READY})


def _spec(run_id="run-1", image=GOOD_IMAGE, deadline=60, env=None):
    return SandboxSpec(
        run_id=run_id, image_digest=image, port=8080,
        env=env or {"EVAL_GATEWAY_URL": "http://gateway:9000", "EVAL_RUN_TOKEN": "tok"},
        run_deadline_s=deadline,
    )


def test_round_trip(runner):
    conformance.check_round_trip(runner, _spec())


def test_not_ready(runner):
    conformance.check_not_ready(runner, _spec(image=BROKEN_IMAGE))


def test_deadline_expiry(runner):
    conformance.check_deadline_expiry(runner, _spec(deadline=1))


def test_env_round_trip_and_secret_absence(runner):
    conformance.check_env_and_secret_absence(runner, _spec())


def test_teardown_idempotent(runner):
    conformance.check_teardown_idempotent(runner, _spec())


def test_reap_expired_removes_orphans(runner):
    conformance.check_reaping(runner, _spec())


def test_unknown_image_raises_provision_error(runner):
    with pytest.raises(SandboxProvisionError):
        runner.provision(_spec(image="fake.local/missing@sha256:" + "d" * 64))
