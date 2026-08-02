# Sandboxed Agent Eval Run Design

**Date:** 2026-08-02

**Status:** Approved for MVP1 planning

**MVP1 scope decision (2026-08-02):** MVP1 is a thin vertical slice — manifest
registry, `SandboxRunner` (fake + Kubernetes), Tool Gateway, reference Agent,
wired to the existing deterministic evaluator and report generator. The full
modular-platform features (LLM Judge, revision UI, report comparison) and the
LLM egress proxy follow in MVP2. MVP1 sandboxes have **no LLM egress at
all**; the reference Agent runs rule-based intent analysis, keeping tests and
CI hermetic.

**Audience:** Product and engineering

**Depends on:** `2026-07-30-modular-agent-evaluation-platform-design.md`

## Goal

Extend the modular evaluation platform so that externally registered
marketplace Agents can be evaluated. A marketplace Agent is not our code: it is
registered with metadata, packaged as a container image, and implements a
published runtime/eval contract. The platform triggers an evaluation from the
UI, executes the Agent inside a restricted and isolated environment, collects
trustworthy evidence, and produces the same immutable Eval Runs and Reports
defined in the platform design.

Three new subsystems are introduced:

1. **Agent Manifest and Registry** — how a marketplace Agent registers.
2. **Eval Contract (`agent-eval/v1`)** — the runtime interface every Agent
   implements.
3. **Sandbox Runner** — an abstract execution layer. The first concrete
   implementation is a **Kubernetes Pod runner**; local development and tests
   use a **kind** cluster.

The evaluation pipeline downstream of the sandbox — deterministic evaluators,
LLM-as-a-Judge, SQLite snapshots, Langfuse observations, Reports, and
comparisons — is unchanged from the platform design.

## Trust Model

The central design rule: **an Agent under evaluation is untrusted code.**

- The Agent never executes Tools itself. It requests Tool calls through a
  harness-owned Tool Gateway, which enforces permission policy, executes the
  adapter, and records the `tool` and `guardrail` observations. Evidence that
  feeds deterministic scores is always produced by harness infrastructure,
  never self-reported by the Agent.
- The Agent never receives real provider secrets. In MVP1 the sandbox has no
  LLM egress at all. From MVP2, LLM traffic leaves the sandbox only through
  an egress proxy that injects credentials server-side and records
  `generation` observations with usage.
- The sandbox denies all other network egress, enforces resource and time
  limits, and is destroyed after every run.
- Agent-emitted telemetry (optional OTel spans) is supplemental display data
  only; it never feeds deterministic scores.
- Agent output is treated as data when passed to the LLM Judge (delimited,
  with anti-injection instructions). Deterministic failures continue to
  override Judge scores.

## Agent Manifest and Registry

A marketplace Agent registers by submitting a manifest plus a container image
reference. Registration validates the manifest schema, resolves the image tag
to a digest, and creates an immutable Agent Revision pinned to that digest.

```yaml
manifest_version: 1
agent_id: acme/travel-planner
version: 1.4.0
display_name: Travel Planner
description: Plans multi-leg trips.
runtime:
  image: registry.local/acme/travel-planner@sha256:abc123...
  protocol: agent-eval/v1
  port: 8080
  resources:
    cpu: "1"
    memory: 1Gi
  timeout_per_case_s: 120
capabilities:
  llm_endpoints: [anthropic]      # egress allowed only via the proxy
  secrets: [ANTHROPIC_AUTH_TOKEN] # names only; values never registered
tools:
  - name: book_flight
    sensitivity: high
    input_schema: { ... }
    verification_required: true
```

Registry storage adds one table, `marketplace_agents` (manifest JSON, image
digest, contract version, registration time), layered on the existing
`agents` / `agent_revisions` tables. Re-registering a new version creates a
new Agent Revision; existing runs keep referencing the old one.

## Eval Contract (`agent-eval/v1`)

The contract has three parts. A thin `agent-eval-sdk` Python package wraps all
three so a conforming Agent is small.

### Invocation

The Agent container exposes an HTTP API on the manifest port:

- `GET /healthz` — readiness; the runner polls this before the run starts.
- `POST /invoke` — one call per test case. Request:
  `{run_id, case_id, input, context}`. Response:
  `{output, status: "ok" | "error", error?}`.

The orchestrator drives the dataset loop; the Agent handles exactly one case
per call and holds no cross-case state guarantees.

### Tool Gateway

Injected into the sandbox as environment variables `EVAL_GATEWAY_URL` and
`EVAL_RUN_TOKEN` (a per-run bearer token). Endpoints:

- `POST /guard/check` — permission check for a named tool; records a
  `guardrail` observation and returns the verdict.
- `POST /tools/{name}` — executes the Tool adapter (or mock), records the
  `tool` observation with sanitized arguments/output, and returns the result.
  Calls for high-sensitivity tools without a prior allow verdict are refused
  and recorded — this is what makes `MISSING_GUARD` and `DENY_BYPASS`
  detectable for third-party Agents.

### LLM Egress Proxy (MVP2)

`EVAL_LLM_PROXY_URL` fronts the providers listed in the manifest
`capabilities.llm_endpoints`. The proxy injects real credentials, forwards the
request, and records a `generation` observation with token usage and cost.
The Agent-side SDK simply sets the provider base URL to the proxy.

In MVP1 this component does not exist: `capabilities.llm_endpoints` is
accepted in the manifest but not honored, the sandbox NetworkPolicy allows
egress only to the Tool Gateway and DNS, and the reference Agent uses its
rule-based intent analyzer.

## Sandbox Runner Abstraction

The sandbox layer is defined by an abstract interface so the execution
substrate can change without touching the orchestrator, gateway, or
evaluators. The first release ships two implementations:

- `KubernetesPodRunner` — the production path; used against kind locally.
- `FakeSandboxRunner` — in-process fake for fast unit tests.

Docker-only, gVisor, Firecracker, or remote-cluster runners can be added later
behind the same interface.

### Interface

```python
# src/sandbox/base.py

@dataclass(frozen=True)
class SandboxSpec:
    run_id: str
    image_digest: str          # full pinned reference, never a tag
    port: int
    env: Mapping[str, str]     # non-secret contract env (gateway URL, token)
    cpu: str                   # e.g. "1"
    memory: str                # e.g. "1Gi"
    run_deadline_s: int        # wall clock for the whole run
    labels: Mapping[str, str]  # run_id, agent_id, revision for cleanup/audit

@dataclass(frozen=True)
class SandboxHandle:
    sandbox_id: str            # runner-scoped identifier (e.g. pod name)
    endpoint: str              # base URL the orchestrator uses for /invoke

class SandboxError(Exception): ...          # base
class SandboxProvisionError(SandboxError): ...  # image pull, quota, scheduling
class SandboxNotReadyError(SandboxError): ...   # readiness deadline exceeded
class SandboxExpiredError(SandboxError): ...    # run deadline exceeded

class SandboxRunner(ABC):
    @abstractmethod
    def provision(self, spec: SandboxSpec) -> SandboxHandle: ...
    @abstractmethod
    def wait_ready(self, handle: SandboxHandle, timeout_s: int) -> None: ...
    @abstractmethod
    def status(self, handle: SandboxHandle) -> SandboxStatus: ...
    @abstractmethod
    def logs(self, handle: SandboxHandle, tail: int = 500) -> str: ...
    @abstractmethod
    def teardown(self, handle: SandboxHandle) -> None: ...
    @abstractmethod
    def reap_expired(self) -> list[str]: ...  # crash-recovery cleanup
```

Lifecycle: `provision → wait_ready → (orchestrator drives /invoke per case)
→ teardown`. `teardown` is idempotent and always attempted in a `finally`
block. `reap_expired` runs at orchestrator startup and deletes any sandbox
whose `run_id` label refers to a run no longer `RUNNING` — this recovers from
orchestrator crashes without leaking pods.

Error mapping to run states: `SandboxProvisionError` and
`SandboxNotReadyError` fail the run as `FAILED` with the sandbox reason and
log tail; `SandboxExpiredError` mid-run produces `PARTIAL`, preserving
completed case results. Per-case `/invoke` timeouts mark only that case
`INCOMPLETE` and continue.

## Kubernetes Pod Runner

`KubernetesPodRunner` (`src/sandbox/k8s.py`, using the official
`kubernetes` Python client) runs each sandbox as a single Pod in a dedicated
namespace (default `agent-eval-runs`).

### Pod specification

- One container from `spec.image_digest`; image pull policy `IfNotPresent`.
- `securityContext`: `runAsNonRoot`, fixed non-zero `runAsUser`,
  `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`,
  capabilities `drop: [ALL]`, `seccompProfile: RuntimeDefault`.
- An `emptyDir` mounted at `/tmp` (with `sizeLimit`) as the only writable
  path.
- `resources.requests`/`limits` from `SandboxSpec` (platform-level maximum
  caps applied before manifest values are accepted).
- `activeDeadlineSeconds: spec.run_deadline_s` — the cluster itself enforces
  the run wall clock even if the orchestrator dies.
- `automountServiceAccountToken: false`; a dedicated service account with no
  RBAC grants.
- `restartPolicy: Never`; labels from `SandboxSpec` for selection and reaping.
- Readiness probe on `GET /healthz`.

### Network isolation

A `NetworkPolicy` in the run namespace selects sandbox pods and enforces:

- **Ingress:** only from the orchestrator/gateway (see reachability below).
- **Egress:** only to (a) the Tool Gateway service, (b) cluster DNS on
  port 53, and (from MVP2) (c) the LLM egress proxy service. Everything
  else — internet, Langfuse, SQLite host, other pods — is denied.

The Tool Gateway (and, from MVP2, the LLM proxy) runs as an in-cluster
Deployment/Service in the same namespace (`deploy/k8s/gateway.yaml`). These
are the only pods with outbound internet egress and the only place provider
secrets exist (as a Kubernetes Secret mounted into the gateway pod, mirroring
the platform rule that secret values are never stored in product records).

> **Constraint:** NetworkPolicy is enforced by the CNI. kind's default CNI
> (kindnet) does **not** enforce NetworkPolicy, so the local cluster must
> install Calico (or Cilium). The conformance suite includes a test that
> proves egress denial, so a cluster that silently ignores the policy fails
> tests instead of passing insecurely.

### Reaching the Agent

The orchestrator runs outside the cluster (alongside Streamlit). It reaches
the sandbox pod's `/invoke` endpoint via the Kubernetes API using
`portforward` from the Python client. This works identically on kind and on
any remote cluster, requires no NodePorts or ingress, and keeps the pod
unreachable from anything except an authenticated API-server client. The
gateway service is reached the same way for run setup/teardown calls.

### Cleanup

`teardown` deletes the pod (grace period 10 s, then force). `reap_expired`
lists pods by the `agent-eval/run-id` label and deletes any whose run is not
`RUNNING` in SQLite. Namespace-level `ResourceQuota` bounds total sandbox
CPU/memory so a stuck reaper cannot exhaust the cluster.

## Local Development and Testing with kind

`deploy/kind/` contains everything needed to run the Kubernetes path locally:

- `cluster.yaml` — kind config: one control-plane node,
  `disableDefaultCNI: true` (Calico installed after create), and
  `containerdConfigPatches` wiring a local registry.
- `registry.sh` — starts a `registry:2` container on `localhost:5001`
  connected to the kind network, so locally built Agent images are pushed
  once and pulled by digest like a real registry. (`kind load docker-image`
  remains a fallback but does not exercise digest pinning.)
- Make targets:
  - `make kind-up` — create cluster, install Calico, wait for CNI ready,
    create namespace, apply `deploy/k8s/gateway.yaml`.
  - `make kind-down` — delete cluster and registry.
  - `make reference-agent` — build and push the reference Agent image.
  - `make test-k8s` — run the `k8s`-marked pytest suite against the cluster.

### Reference Agent

The current in-process `TargetAgent` (`src/agent.py`) is ported into a
containerized **reference Agent** that implements `agent-eval/v1` via the
SDK, including its intentional `demo_bypass` behavior. It serves three
purposes: the contract's executable example for marketplace authors, the
fixture for the conformance suite, and the demo content for local runs.

### Test tiers

1. **Unit (default `pytest`)** — everything above the sandbox interface uses
   `FakeSandboxRunner`, which serves the reference Agent in-process (thread +
   ephemeral port). No cluster, no Docker; runs in milliseconds.
2. **Runner conformance suite** — one parametrized suite executed against any
   `SandboxRunner` implementation. Cases: provision/ready/invoke round trip;
   readiness timeout on a broken image; per-case timeout → `INCOMPLETE`;
   run deadline → `PARTIAL`; **egress denial** (Agent attempts an external
   HTTP call and must fail); gateway reachability; secret absence (contract
   env contains no provider keys); idempotent teardown; `reap_expired`
   removes an orphaned pod. The fake runner runs it in-process; the
   Kubernetes runner runs it under the `k8s` marker.
3. **Integration (`-m k8s`)** — requires `make kind-up`; exercises the real
   Pod runner, NetworkPolicy, gateway Deployment, and port-forwarding, ending
   with one full Eval Run producing a Report. CI runs this tier in a kind
   cluster job; it is skipped automatically when no cluster context exists.

## Orchestration Integration

The UI **Run eval** action inserts a `QUEUED` run as in the platform design.
The orchestrator worker executes:

1. Load Agent Revision (manifest, digest) and Dataset Revision.
2. Register the run with the Tool Gateway (policy snapshot, per-run token).
3. `provision` + `wait_ready` the sandbox.
4. Loop cases: `POST /invoke`, with the gateway concurrently recording
   guard/tool/generation observations for that `case_id`.
5. `teardown` (always), then run deterministic evaluators and the Judge over
   the normalized `TraceRecord`s exactly as today.
6. Snapshot results, aggregate the run, generate the Report.

Reports gain a provenance header: marketplace `agent_id`, version, image
digest, contract version, and sandbox runner type.

## Delivery Boundaries

MVP1 intentionally excludes: the LLM egress proxy (no sandbox LLM access at
all), the fixed LLM Judge, Agent revision management UI, report comparison,
multi-tenant cluster isolation and per-tenant namespaces, gVisor/Firecracker
runtimes, autoscaling or parallel case fan-out across pods, arbitrary
agent-declared egress, image vulnerability scanning and signature
verification, and a public registry service. The `SandboxRunner` interface, manifest
`capabilities` block, and namespace-scoped policy design are chosen so these
can be added without breaking the contract.
