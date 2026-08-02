"""KubernetesPodRunner conformance + isolation tests (plan Task 6).

Requires `make kind-up` and `make reference-agent`; skipped automatically
when the kind cluster or reference image is unavailable.
Run with: make test-k8s   (or: pytest -m k8s)
"""
import os
from pathlib import Path

import pytest

from src.sandbox.base import SandboxSpec, SandboxStatus
from tests import sandbox_conformance as conformance

pytestmark = pytest.mark.k8s

KIND_CONTEXT = "kind-agent-eval"
NAMESPACE = "agent-eval-runs"
DIGEST_FILE = Path("deploy/kind/.reference-agent-image")
BROKEN_IMAGE = "localhost:5001/agent-eval-broken@sha256:" + "0" * 64


@pytest.fixture(scope="module")
def runner():
    pytest.importorskip("kubernetes")
    from src.sandbox.k8s import KubernetesPodRunner

    try:
        pod_runner = KubernetesPodRunner(namespace=NAMESPACE, context=KIND_CONTEXT)
        pod_runner.reap_expired(active_run_ids=set())  # clean slate + connectivity probe
    except Exception as error:
        pytest.skip(f"kind cluster unavailable: {error}")
    return pod_runner


@pytest.fixture(scope="module")
def ref_image():
    image = os.environ.get("REFERENCE_AGENT_IMAGE", "").strip()
    if not image and DIGEST_FILE.exists():
        image = DIGEST_FILE.read_text().strip()
    if not image:
        pytest.skip("reference agent image not built; run `make reference-agent`")
    return image


def _spec(ref_image, run_id="k8s-conf", deadline=120, port=8080):
    return SandboxSpec(
        run_id=run_id, image_digest=ref_image, port=port,
        env={"EVAL_GATEWAY_URL": "http://agent-eval-gateway:9000",
             "EVAL_RUN_TOKEN": "conformance-dummy"},
        cpu="0.5", memory="256Mi", run_deadline_s=deadline,
    )


def test_round_trip(runner, ref_image):
    conformance.check_round_trip(runner, _spec(ref_image))


def test_not_ready_on_unpullable_image(runner):
    spec = SandboxSpec(
        run_id="k8s-broken", image_digest=BROKEN_IMAGE, port=8080,
        env={"EVAL_GATEWAY_URL": "http://agent-eval-gateway:9000",
             "EVAL_RUN_TOKEN": "x"},
        cpu="0.5", memory="256Mi", run_deadline_s=120)
    conformance.check_not_ready(runner, spec, timeout_s=90)


def test_deadline_expiry(runner, ref_image):
    conformance.check_deadline_expiry(runner, _spec(ref_image, deadline=10))


def test_env_round_trip_and_secret_absence(runner, ref_image):
    conformance.check_env_and_secret_absence(runner, _spec(ref_image))


def test_teardown_idempotent(runner, ref_image):
    conformance.check_teardown_idempotent(runner, _spec(ref_image))


def test_reap_expired_removes_orphans(runner, ref_image):
    conformance.check_reaping(runner, _spec(ref_image, run_id="k8s-orphan"))


def test_egress_is_denied_by_networkpolicy(runner, ref_image):
    conformance.check_egress_denied(runner, _spec(ref_image, run_id="k8s-egress"))


def test_pod_hardening_fields(runner, ref_image):
    spec = _spec(ref_image, run_id="k8s-hardening", deadline=90)
    handle = runner.provision(spec)
    try:
        pod = runner.read_pod_spec(handle)
        assert pod.spec.automount_service_account_token is False
        assert pod.spec.active_deadline_seconds == 90
        assert pod.spec.restart_policy == "Never"
        assert pod.spec.security_context.run_as_non_root is True
        assert pod.spec.security_context.seccomp_profile.type == "RuntimeDefault"
        container = pod.spec.containers[0]
        assert container.security_context.read_only_root_filesystem is True
        assert container.security_context.allow_privilege_escalation is False
        assert container.security_context.capabilities.drop == ["ALL"]
        assert container.resources.limits["memory"] == "256Mi"
        assert pod.metadata.labels["agent-eval/sandbox"] == "true"
    finally:
        runner.teardown(handle)
