# Sandboxed Agent Eval MVP1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the MVP1 thin vertical slice from `docs/superpowers/specs/2026-08-02-sandboxed-agent-eval-run-design.md`: a marketplace Agent registers with a digest-pinned manifest, an eval run triggered from the UI executes the Agent inside an isolated Kubernetes Pod (kind locally), all Tool and guard evidence is produced by a harness-owned Tool Gateway, and results flow into the existing deterministic evaluator and report generator.

**Architecture:** `SandboxRunner` is an abstract interface with two implementations: `FakeSandboxRunner` (in-process, hermetic unit tests) and `KubernetesPodRunner` (pods in an `agent-eval-runs` namespace, NetworkPolicy default-deny egress, reached via API-server port-forward). The Tool Gateway is the trust boundary: Agents request guard checks and Tool calls over HTTP; the gateway enforces policy, executes mock adapters, and records normalized evidence that the orchestrator pulls and feeds to `CodeEvaluator`. MVP1 sandboxes have **no LLM egress**; the reference Agent uses rule-based intent analysis.

**Tech Stack:** Python 3, standard-library `sqlite3`, standard-library `http.server`/`urllib` for the contract and gateway HTTP surfaces (no new web framework), PyYAML, `kubernetes` Python client (new dependency, Task 6 only), Docker, kind + Calico, Pytest, Streamlit.

## Global Constraints

- A marketplace Agent is untrusted code. Evidence used for deterministic scores is recorded only by the Tool Gateway, never accepted from the Agent.
- MVP1 sandboxes have no LLM egress. `capabilities.llm_endpoints` is parsed but not honored; no provider secret may ever appear in a `SandboxSpec.env` or Pod spec.
- Manifests must pin images by digest (`@sha256:`); tags are rejected at registration.
- `SandboxRunner.teardown` is idempotent and always attempted in a `finally` block; completed case results survive sandbox failure as `PARTIAL` runs.
- Sandbox pods run non-root, read-only rootfs, all capabilities dropped, `RuntimeDefault` seccomp, `automountServiceAccountToken: false`, `activeDeadlineSeconds` set.
- Every status is explicit English text (`QUEUED`, `RUNNING`, `COMPLETED`, `PARTIAL`, `FAILED`, `PASS`, `FAIL`, `INCOMPLETE`); color never carries meaning alone.
- All user-facing copy is English.
- The existing demo (`app.py`, `main.py`, current tests) keeps passing throughout; new modules are additive.
- Default `pytest` must run with no Docker, no cluster, and no network. Cluster tests carry the `k8s` marker and are skipped when no kind context exists.
- Run tests with `.venv/bin/python -m pytest -q` (Linux/macOS) or `.venv\Scripts\python.exe -m pytest -q` (Windows).

## Delivery Milestones

1. **Contract Foundations:** Tasks 1–3 produce the manifest registry, the `agent-eval/v1` contract SDK, and the sandbox abstraction with a fake runner passing a reusable conformance suite.
2. **Evidence:** Tasks 4–5 produce the Tool Gateway with four-state evidence and the containerizable reference Agent, evaluated end-to-end in-process.
3. **Kubernetes Execution:** Task 6 produces the `KubernetesPodRunner`, kind tooling, and the isolation proof tests.
4. **Product Wiring:** Task 7 produces the run queue, orchestrator worker, UI trigger, and reports with provenance.

---

### Task 1: Agent Manifest and Marketplace Registry

**Files:**
- Create: `src/marketplace/__init__.py`
- Create: `src/marketplace/manifest.py`
- Create: `src/marketplace/registry.py`
- Create: `tests/test_marketplace_manifest.py`
- Create: `tests/test_marketplace_registry.py`

**Interfaces:**
- Consumes: PyYAML, `sqlite3`.
- Produces: `AgentManifest` (frozen dataclass), `ManifestError`, `parse_manifest(yaml_text) -> AgentManifest`, `MarketplaceRegistry`.

- [ ] **Step 1: Write failing manifest tests**

Cover in `tests/test_marketplace_manifest.py`:

- a valid manifest (fields from the spec example) parses into a frozen `AgentManifest` with `image_digest`, `protocol == "agent-eval/v1"`, `port`, `cpu`, `memory`, `timeout_per_case_s`, `secrets` (names), and `tools` tuple;
- an image reference with a tag instead of `@sha256:` raises `ManifestError` naming the field;
- unknown `manifest_version` or `protocol` raises `ManifestError`;
- missing required fields (`agent_id`, `version`, `runtime.image`, `runtime.port`) raise `ManifestError` with the field path;
- a manifest whose `secrets` entry looks like a value (contains `=` or whitespace) is rejected — secret names only;
- resource values above platform caps (`cpu > "2"`, `memory > "2Gi"`, `timeout_per_case_s > 600`) are rejected.

- [ ] **Step 2: Run and verify `ModuleNotFoundError: src.marketplace`**

- [ ] **Step 3: Implement `manifest.py`**

Explicit Python validation (no jsonschema dependency); every `ManifestError` message includes the offending field path and an English explanation.

- [ ] **Step 4: Write failing registry tests**

Cover in `tests/test_marketplace_registry.py` (use `tmp_path` SQLite files):

- `register(yaml_text)` persists and `get(agent_id, version)` returns the manifest plus `registered_at`;
- registering the same `agent_id`/`version` twice raises a duplicate error; a new `version` creates a second row;
- `list_agents()` returns the latest version per `agent_id` with total version count;
- schema creation is idempotent across `MarketplaceRegistry` instances on the same file.

- [ ] **Step 5: Implement `registry.py`**

Table `marketplace_agents(agent_id TEXT, version TEXT, image_digest TEXT, protocol TEXT, manifest_json TEXT, registered_at TEXT, PRIMARY KEY(agent_id, version))`. Rows are immutable after insert.

- [ ] **Step 6: Run focused then full tests; commit `feat: add agent manifest and marketplace registry`**

---

### Task 2: Eval Contract SDK (`agent-eval/v1`)

**Files:**
- Create: `src/contract/__init__.py`
- Create: `src/contract/protocol.py`
- Create: `src/contract/server.py`
- Create: `src/contract/gateway_client.py`
- Create: `tests/test_contract_server.py`

**Interfaces:**
- Consumes: standard library only (`http.server`, `urllib.request`, `json`, `dataclasses`).
- Produces: `InvokeRequest`, `InvokeResponse`, `AgentServer`, `GatewayClient`. This package is the future `agent-eval-sdk`; it must not import anything from `src/` outside `src/contract/`.

- [ ] **Step 1: Write failing contract server tests**

- `AgentServer(handler, port=0)` starts a `ThreadingHTTPServer` on an ephemeral port; `GET /healthz` returns `200 {"status": "ok"}`;
- `POST /invoke` with `{run_id, case_id, input, context}` calls `handler(InvokeRequest) -> InvokeResponse` and returns `{output, status: "ok"}`;
- a handler exception returns `{status: "error", error: <sanitized message>}` with HTTP 200 (transport succeeded; the case failed);
- malformed JSON returns HTTP 400; unknown paths return 404;
- `server.close()` releases the port and is idempotent.

- [ ] **Step 2: Run and verify failures; implement `protocol.py` and `server.py`**

`AgentServer` exposes `.port` and `.base_url` for the fake runner; response bodies are capped at 256 KiB (spec output cap) with an explicit truncation error.

- [ ] **Step 3: Implement `GatewayClient`**

`GatewayClient(base_url, run_token)` with `guard_check(tool, arguments, case_id) -> GuardVerdict` and `call_tool(tool, arguments, case_id) -> ToolResult`, sending `Authorization: Bearer <run_token>`. Reads `EVAL_GATEWAY_URL` / `EVAL_RUN_TOKEN` via `GatewayClient.from_env()`. Unit-test request shape against a stub `http.server`.

- [ ] **Step 4: Run all tests; commit `feat: add agent-eval/v1 contract SDK`**

---

### Task 3: Sandbox Abstraction, Fake Runner, and Conformance Suite

**Files:**
- Create: `src/sandbox/__init__.py`
- Create: `src/sandbox/base.py`
- Create: `src/sandbox/fake.py`
- Create: `tests/sandbox_conformance.py`
- Create: `tests/test_sandbox_fake.py`

**Interfaces:**
- Consumes: `src/contract/`.
- Produces: `SandboxSpec`, `SandboxHandle`, `SandboxStatus`, `SandboxRunner`, error taxonomy, `FakeSandboxRunner`, `sandbox_conformance.run_conformance(runner_factory, agent_image_or_handler)`.

- [ ] **Step 1: Implement `base.py` exactly as specified in the design doc**

`SandboxSpec` (frozen: `run_id`, `image_digest`, `port`, `env`, `cpu`, `memory`, `run_deadline_s`, `labels`), `SandboxHandle` (frozen: `sandbox_id`, `endpoint`), `SandboxStatus` enum (`PENDING`, `READY`, `RUNNING`, `SUCCEEDED`, `FAILED`, `EXPIRED`, `GONE`), errors (`SandboxError`, `SandboxProvisionError`, `SandboxNotReadyError`, `SandboxExpiredError`), abstract `SandboxRunner` with `provision`, `wait_ready`, `status`, `logs`, `teardown`, `reap_expired`.

- [ ] **Step 2: Write the conformance suite as a reusable module**

`tests/sandbox_conformance.py` defines plain functions taking a ready `SandboxRunner` and a test-agent factory, so both the fake and k8s test modules call the same assertions:

1. provision → wait_ready → `GET /healthz` → `POST /invoke` round trip returns the handler's output;
2. `wait_ready` on an agent that never becomes healthy raises `SandboxNotReadyError` within the timeout;
3. after `run_deadline_s` elapses, `status` reports `EXPIRED` and invoke fails;
4. `spec.env` round-trips into the agent environment, and asserting **no** key matching `*_KEY`/`*_TOKEN`/`*_SECRET` beyond `EVAL_RUN_TOKEN` is present (secret-absence check);
5. `teardown` twice succeeds (idempotent) and `status` afterwards is `GONE`;
6. `reap_expired` removes a sandbox whose `run_id` is not in the provided active-run set;
7. *(k8s-only, marked)* egress denial: an agent handler that attempts `urllib` to an external address must fail.

- [ ] **Step 3: Write failing fake-runner tests that call the conformance functions**

- [ ] **Step 4: Implement `FakeSandboxRunner`**

Runs the handler in-process via `AgentServer` on an ephemeral port in a thread; `provision` applies `spec.env` to the handler's environment mapping (not `os.environ`); deadline enforced with a monotonic timer. No Docker, no sockets beyond localhost.

- [ ] **Step 5: Run all tests; commit `feat: add sandbox runner abstraction with fake runner and conformance suite`**

---

### Task 4: Tool Gateway with Four-State Evidence

**Files:**
- Create: `src/gateway/__init__.py`
- Create: `src/gateway/service.py`
- Create: `src/gateway/server.py`
- Create: `src/gateway/Dockerfile`
- Create: `tests/test_gateway_service.py`
- Create: `tests/test_gateway_server.py`

**Interfaces:**
- Consumes: `src/tools_mock.py` (mock adapters), policy snapshot shaped like `config/tools.yaml` roles/sensitivity, `src/models.py` trace record types.
- Produces: `GatewayService` (in-process core), HTTP wrapper `GatewayServer`, normalized per-run evidence records consumable by `CodeEvaluator`.

- [ ] **Step 1: Write failing `GatewayService` tests**

- `register_run(run_id, policy_snapshot) -> run_token`; requests with a wrong token are rejected 401;
- `guard_check` records a `permission_guard` record with verdict from the policy snapshot (role × sensitivity);
- `call_tool` on a low-sensitivity tool executes the mock adapter and records a `tool_execution` record with sanitized args/output, timestamps, latency;
- `call_tool` on a high-sensitivity tool **without** a prior allow verdict in the same case is refused: no adapter execution, record marked `refused=true, reason="NO_GUARD_ALLOW"` (evaluator maps to `MISSING_GUARD`);
- `call_tool` after an explicit deny is refused with `reason="AFTER_DENY"` (maps to `DENY_BYPASS` attempt);
- adapter exception → `executed=true, succeeded=false` with sanitized error;
- `records(run_id)` returns ordered records; `close_run(run_id)` invalidates the token and freezes records.

- [ ] **Step 2: Implement `service.py`; verify `CodeEvaluator` accepts the records**

Add one integration-style test that feeds gateway records for a compliant case and a `NO_GUARD_ALLOW` case through the existing `CodeEvaluator` and asserts `permission_compliance` 1.0 and 0.0 respectively. Extend the evaluator only if a small mapping shim is required; do not change existing scoring rules.

- [ ] **Step 3: Implement `server.py` (stdlib HTTP) and its tests**

Routes: `POST /runs`, `POST /guard/check`, `POST /tools/{name}`, `GET /runs/{run_id}/records`, `DELETE /runs/{run_id}`. Request cap 64 KiB; per-case tool-call cap (default 20) returns an explicit refusal record when exceeded.

- [ ] **Step 4: Write `src/gateway/Dockerfile`** (python slim, non-root user, `EXPOSE 9000`) — build verified in Task 6.

- [ ] **Step 5: Run all tests; commit `feat: add tool gateway with policy enforcement and evidence records`**

---

### Task 5: Reference Agent

**Files:**
- Create: `reference_agent/app.py`
- Create: `reference_agent/Dockerfile`
- Create: `tests/test_reference_agent.py`

**Interfaces:**
- Consumes: `src/contract/` only (proves the SDK is sufficient for an external author).
- Produces: a container image implementing `agent-eval/v1`, reusing the current `TargetAgent` behavior: rule-based intent → guard check for high-sensitivity tools → tool call → response, including the `demo_bypass` input marker that skips the guard.

- [ ] **Step 1: Write failing end-to-end in-process tests**

Wire `FakeSandboxRunner(reference_handler)` + in-process `GatewayService`: a compliant high-sensitivity case yields guard-then-tool records and `permission_compliance == 1.0`; a `demo_bypass` case yields a refused `NO_GUARD_ALLOW` record and `0.0`; a low-sensitivity case executes without a guard.

- [ ] **Step 2: Implement `reference_agent/app.py`**

Port the rule-based intent matching from `src/intent.py` (copy the rules; do not import `src/`). Entry point: `python app.py` starts `AgentServer` on `$PORT` with `GatewayClient.from_env()`.

- [ ] **Step 3: Write `reference_agent/Dockerfile`**

python slim, non-root `USER 65532`, copies `src/contract/` as the vendored SDK, `HEALTHCHECK` on `/healthz`. Build verified in Task 6.

- [ ] **Step 4: Run all tests; commit `feat: add containerizable reference agent implementing agent-eval/v1`**

---

### Task 6: Kubernetes Pod Runner and kind Tooling

**Files:**
- Create: `src/sandbox/k8s.py`
- Create: `deploy/kind/cluster.yaml`
- Create: `deploy/kind/registry.sh`
- Create: `deploy/k8s/namespace.yaml`
- Create: `deploy/k8s/gateway.yaml`
- Create: `deploy/k8s/networkpolicy.yaml`
- Create: `Makefile`
- Create: `tests/test_sandbox_k8s.py`
- Modify: `requirements.txt` (add `kubernetes>=31,<32`), `pytest.ini` (register `k8s` marker)

**Interfaces:**
- Consumes: `src/sandbox/base.py`, `kubernetes` client, kubeconfig context `kind-agent-eval`.
- Produces: `KubernetesPodRunner(namespace="agent-eval-runs", context=None)`.

- [ ] **Step 1: kind and manifests**

- `cluster.yaml`: one control-plane node, `disableDefaultCNI: true`, containerd patch for `localhost:5001` registry;
- `registry.sh`: idempotent `registry:2` container joined to the kind network;
- `namespace.yaml`: namespace + `ResourceQuota` (total sandbox CPU/memory caps);
- `gateway.yaml`: gateway Deployment/Service from `src/gateway/Dockerfile` image;
- `networkpolicy.yaml`: default-deny ingress+egress for pods labeled `agent-eval/sandbox=true`; egress allowed only to the gateway Service selector and DNS :53.
- `Makefile` targets: `kind-up` (create cluster → install Calico → wait Ready → apply manifests → build/push gateway image), `kind-down`, `reference-agent` (build/push by digest, print digest), `test-k8s`.

- [ ] **Step 2: Write failing k8s runner tests (`@pytest.mark.k8s`)**

Module-level skip when the `kind-agent-eval` context is absent. Tests call the Task 3 conformance functions against `KubernetesPodRunner` with the pushed reference-agent digest, plus the k8s-only cases: egress denial (agent invoke handler that fetches `https://example.com` must error), pod security assertions (read the created Pod spec: `runAsNonRoot`, `readOnlyRootFilesystem`, capabilities dropped, `automountServiceAccountToken: false`, `activeDeadlineSeconds == spec.run_deadline_s`), and `reap_expired` deleting a labeled orphan pod.

- [ ] **Step 3: Implement `k8s.py`**

- `provision`: create Pod (spec per design doc §Pod specification, labels `agent-eval/sandbox=true`, `agent-eval/run-id=<run_id>`), return handle;
- `wait_ready`: watch Pod conditions until `Ready` or timeout → `SandboxNotReadyError` with log tail;
- `endpoint`: lazily open an API-server port-forward (`kubernetes.stream.portforward`) exposed as `http://127.0.0.1:<local>`;
- `status`/`logs`/`teardown` (delete, grace 10 s, idempotent on 404) / `reap_expired` (list by label, delete non-active).

- [ ] **Step 4: Run `make kind-up && make reference-agent && make test-k8s` until green; default `pytest` still green with no cluster; commit `feat: add kubernetes pod sandbox runner with kind tooling`**

---

### Task 7: Run Queue, Orchestrator Worker, UI Trigger, and Reports

**Files:**
- Create: `src/orchestrator/__init__.py`
- Create: `src/orchestrator/queue.py`
- Create: `src/orchestrator/worker.py`
- Create: `src/ui_marketplace.py`
- Modify: `app.py` (add Marketplace page: registered Agents list, manifest upload, **Run eval** button, run status/history, report links)
- Modify: `main.py` (add `--step marketplace-run`), `README.md`
- Create: `tests/test_orchestrator_queue.py`, `tests/test_orchestrator_worker.py`, `tests/test_ui_marketplace.py`

**Interfaces:**
- Consumes: `MarketplaceRegistry`, `SandboxRunner`, `GatewayService`, existing `CodeEvaluator`, `report_generator`, `TraceBackend`.
- Produces: `RunQueue` (SQLite `marketplace_runs` table: `run_id`, `agent_id`, `version`, `image_digest`, dataset ref, status, timestamps, error, report path), `Orchestrator.execute(run_id)`, worker loop `python -m src.orchestrator.worker`.

- [ ] **Step 1: Write failing queue tests** — enqueue → `QUEUED`; `claim_next()` transitions to `RUNNING` exactly once (second claim gets nothing); terminal states are immutable; restart-safe (`RUNNING` rows older than deadline are reaped to `FAILED`).

- [ ] **Step 2: Write failing worker tests using `FakeSandboxRunner`**

- happy path: full dataset loop → gateway records pulled → `CodeEvaluator` → report written → `COMPLETED`, and the report header contains agent id, version, image digest, contract version, and runner type;
- sandbox provision failure → `FAILED` with sanitized reason and log tail;
- deadline expiry mid-run → `PARTIAL` preserving completed case results;
- teardown is called on every path (assert via spy runner), including when evaluation raises.

- [ ] **Step 3: Implement `queue.py`, `worker.py`**

`Orchestrator.execute`: load manifest → register gateway run → build `SandboxSpec` (env: `EVAL_GATEWAY_URL`, `EVAL_RUN_TOKEN` only) → provision/wait_ready → per-case `POST /invoke` with per-case timeout (`INCOMPLETE` on timeout, continue) → `finally: teardown` → pull records → evaluate → write results via existing `TraceBackend`/report generator → close gateway run → terminal status. Runner selection by env: `SANDBOX_RUNNER=fake|k8s`.

- [ ] **Step 4: Implement UI and AppTest coverage**

AppTest: empty marketplace state text; registering the reference-agent manifest lists it; **Run eval** enqueues (`QUEUED` visible); a completed run shows status text and a report link. UI never blocks on the worker.

- [ ] **Step 5: Full verification**

- `.venv/bin/python -m pytest -q` green (no cluster);
- `make kind-up && make reference-agent && make test-k8s` green;
- manual smoke: start worker with `SANDBOX_RUNNER=k8s`, trigger from Streamlit, open the Markdown report;
- README gains a "Marketplace eval runs" section (manifest example, kind setup, worker command).

- [ ] **Step 6: Commit `feat: add marketplace eval runs with sandboxed execution`**

---

## Out of Scope (MVP2+)

LLM egress proxy and Judge scoring for marketplace runs, manifest tag→digest resolution against a remote registry, Langfuse-side gateway ingestion, parallel case fan-out, per-tenant namespaces, image scanning/signing, and the public registry service. See the design doc's Delivery Boundaries.
