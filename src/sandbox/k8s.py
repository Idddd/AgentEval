"""Kubernetes Pod implementation of SandboxRunner.

Each sandbox is one hardened Pod in the `agent-eval-runs` namespace:
non-root, read-only rootfs, all capabilities dropped, RuntimeDefault seccomp,
no service-account token, resource limits, and `activeDeadlineSeconds` so the
cluster enforces the run wall clock even if the orchestrator dies. Network
isolation comes from the NetworkPolicy in deploy/k8s/networkpolicy.yaml.

Pod lifecycle uses the official kubernetes client; the orchestrator reaches
the pod's /invoke endpoint through `kubectl port-forward` (spawned once the
pod is ready on a local port reserved at provision time), which works
identically on kind and remote clusters and never exposes the pod.
"""
from __future__ import annotations

import re
import socket
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from typing import Collection

from .base import (
    SandboxHandle,
    SandboxNotReadyError,
    SandboxProvisionError,
    SandboxRunner,
    SandboxSpec,
    SandboxStatus,
)

SANDBOX_LABEL = "agent-eval/sandbox"
RUN_ID_LABEL = "agent-eval/run-id"

_FATAL_WAITING_REASONS = {"ErrImagePull", "ImagePullBackOff", "InvalidImageName",
                          "CreateContainerConfigError", "CreateContainerError"}


def _sanitize_label(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9\-_.]", "-", value)
    return cleaned[:63].strip("-_.") or "x"


def _reserve_local_port() -> int:
    probe = socket.socket()
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
    probe.close()
    return port


@dataclass
class _PodState:
    pod_name: str
    spec: SandboxSpec
    local_port: int
    forward: subprocess.Popen | None = None
    log_notes: list[str] = field(default_factory=list)


class KubernetesPodRunner(SandboxRunner):
    def __init__(self, namespace: str = "agent-eval-runs",
                 context: str | None = None, kubectl: str = "kubectl"):
        from kubernetes import client, config

        config.load_kube_config(context=context)
        self._core = client.CoreV1Api()
        self._client = client
        self._namespace = namespace
        self._context = context
        self._kubectl = kubectl
        self._pods: dict[str, _PodState] = {}

    # ---------- SandboxRunner API ----------

    def provision(self, spec: SandboxSpec) -> SandboxHandle:
        run_label = _sanitize_label(spec.run_id)
        pod_name = _sanitize_label(f"sbx-{run_label}-{uuid.uuid4().hex[:8]}").lower()
        env = [self._client.V1EnvVar(name=k, value=v) for k, v in spec.env.items()]
        env.append(self._client.V1EnvVar(name="PORT", value=str(spec.port)))

        pod = self._client.V1Pod(
            metadata=self._client.V1ObjectMeta(
                name=pod_name,
                labels={SANDBOX_LABEL: "true", RUN_ID_LABEL: run_label,
                        **{k: _sanitize_label(v) for k, v in spec.labels.items()}},
            ),
            spec=self._client.V1PodSpec(
                restart_policy="Never",
                automount_service_account_token=False,
                active_deadline_seconds=spec.run_deadline_s,
                security_context=self._client.V1PodSecurityContext(
                    run_as_non_root=True,
                    run_as_user=65532,
                    seccomp_profile=self._client.V1SeccompProfile(type="RuntimeDefault"),
                ),
                volumes=[self._client.V1Volume(
                    name="tmp",
                    empty_dir=self._client.V1EmptyDirVolumeSource(size_limit="256Mi"))],
                containers=[self._client.V1Container(
                    name="agent",
                    image=spec.image_digest,
                    image_pull_policy="IfNotPresent",
                    env=env,
                    ports=[self._client.V1ContainerPort(container_port=spec.port)],
                    security_context=self._client.V1SecurityContext(
                        read_only_root_filesystem=True,
                        allow_privilege_escalation=False,
                        capabilities=self._client.V1Capabilities(drop=["ALL"]),
                    ),
                    resources=self._client.V1ResourceRequirements(
                        requests={"cpu": spec.cpu, "memory": spec.memory},
                        limits={"cpu": spec.cpu, "memory": spec.memory},
                    ),
                    volume_mounts=[self._client.V1VolumeMount(
                        name="tmp", mount_path="/tmp")],
                    readiness_probe=self._client.V1Probe(
                        http_get=self._client.V1HTTPGetAction(
                            path="/healthz", port=spec.port),
                        period_seconds=2, failure_threshold=3),
                )],
            ),
        )
        try:
            self._core.create_namespaced_pod(self._namespace, pod)
        except Exception as error:
            raise SandboxProvisionError(
                f"Failed to create sandbox pod: {error}") from error

        local_port = _reserve_local_port()
        self._pods[pod_name] = _PodState(pod_name=pod_name, spec=spec,
                                         local_port=local_port)
        return SandboxHandle(sandbox_id=pod_name,
                             endpoint=f"http://127.0.0.1:{local_port}")

    def wait_ready(self, handle: SandboxHandle, timeout_s: int = 60) -> None:
        state = self._pods[handle.sandbox_id]
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            pod = self._read_pod(handle.sandbox_id)
            if pod is not None:
                reason = self._fatal_waiting_reason(pod)
                if reason:
                    raise SandboxNotReadyError(
                        f"Sandbox {handle.sandbox_id} cannot start: {reason}")
                if self._is_ready(pod):
                    self._start_port_forward(state)
                    return
            time.sleep(1)
        raise SandboxNotReadyError(
            f"Sandbox {handle.sandbox_id} not healthy within {timeout_s}s; "
            f"log tail:\n{self.logs(handle, tail=20)}")

    def status(self, handle: SandboxHandle) -> SandboxStatus:
        pod = self._read_pod(handle.sandbox_id)
        if pod is None:
            return SandboxStatus.GONE
        phase = pod.status.phase
        if phase == "Failed":
            if (pod.status.reason or "") == "DeadlineExceeded":
                return SandboxStatus.EXPIRED
            return SandboxStatus.FAILED
        if phase == "Succeeded":
            return SandboxStatus.SUCCEEDED
        if self._is_ready(pod):
            return SandboxStatus.READY
        return SandboxStatus.PENDING

    def logs(self, handle: SandboxHandle, tail: int = 500) -> str:
        try:
            return self._core.read_namespaced_pod_log(
                handle.sandbox_id, self._namespace, tail_lines=tail)
        except Exception:
            return ""

    def teardown(self, handle: SandboxHandle) -> None:
        state = self._pods.get(handle.sandbox_id)
        if state is not None and state.forward is not None:
            state.forward.terminate()
            state.forward = None
        try:
            self._core.delete_namespaced_pod(
                handle.sandbox_id, self._namespace, grace_period_seconds=10)
        except Exception as error:
            if getattr(error, "status", None) != 404:
                # Anything other than "already gone" should surface.
                if "404" not in str(error):
                    raise

    def reap_expired(self, active_run_ids: Collection[str]) -> list[str]:
        active_labels = {_sanitize_label(r) for r in active_run_ids}
        pods = self._core.list_namespaced_pod(
            self._namespace, label_selector=f"{SANDBOX_LABEL}=true")
        reaped = []
        for pod in pods.items:
            run_label = (pod.metadata.labels or {}).get(RUN_ID_LABEL, "")
            if run_label not in active_labels:
                self.teardown(SandboxHandle(sandbox_id=pod.metadata.name, endpoint=""))
                reaped.append(pod.metadata.name)
        return reaped

    # ---------- helpers ----------

    def read_pod_spec(self, handle: SandboxHandle):
        """Expose the live pod object for hardening assertions in tests."""
        return self._read_pod(handle.sandbox_id)

    def _read_pod(self, pod_name: str):
        try:
            return self._core.read_namespaced_pod(pod_name, self._namespace)
        except Exception:
            return None

    @staticmethod
    def _is_ready(pod) -> bool:
        for status in pod.status.container_statuses or []:
            if status.ready:
                return True
        return False

    @staticmethod
    def _fatal_waiting_reason(pod) -> str | None:
        for status in pod.status.container_statuses or []:
            waiting = status.state and status.state.waiting
            if waiting and waiting.reason in _FATAL_WAITING_REASONS:
                return f"{waiting.reason}: {waiting.message or ''}"
        return None

    def _start_port_forward(self, state: _PodState) -> None:
        if state.forward is not None and state.forward.poll() is None:
            return
        command = [self._kubectl]
        if self._context:
            command += ["--context", self._context]
        command += ["-n", self._namespace, "port-forward",
                    f"pod/{state.pod_name}",
                    f"{state.local_port}:{state.spec.port}"]
        state.forward = subprocess.Popen(
            command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if state.forward.poll() is not None:
                raise SandboxNotReadyError(
                    f"kubectl port-forward exited for {state.pod_name}")
            probe = socket.socket()
            probe.settimeout(0.5)
            try:
                probe.connect(("127.0.0.1", state.local_port))
                probe.close()
                return
            except OSError:
                time.sleep(0.3)
            finally:
                probe.close()
        raise SandboxNotReadyError(
            f"port-forward to {state.pod_name} did not become reachable")
