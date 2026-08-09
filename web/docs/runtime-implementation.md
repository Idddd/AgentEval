# TaskLattice Agent Runtime Implementation

Status: Draft

Version: 0.1

Runtime: NVIDIA NemoClaw

## 1. Purpose

This document defines how TaskLattice creates and operates Agents on NVIDIA NemoClaw and how it fetches, verifies, caches, installs, upgrades, and removes Skills obtained from an HTTP endpoint.

The central implementation decision is:

> TaskLattice fetches a Skill outside the Agent sandbox, verifies it, stores an immutable copy in S3, hydrates a Runtime Host local cache, and then installs the verified local directory through the NemoClaw Skill CLI.

S3 is suitable as the shared persistent Skill cache. It is not the hot runtime cache and must not be mounted directly into the Agent sandbox.

This document specializes the generic Agent and Skill contracts in [technical-implementation.md](./technical-implementation.md) for a NemoClaw runtime.

The local execution proof, version matrix, lifecycle findings, and observability assessment are recorded in [nemoclaw-orbstack-runtime-validation.md](./nemoclaw-orbstack-runtime-validation.md).

## 2. Scope and explicit boundaries

### 2.1 In scope

- Create, observe, stop, restart, and destroy NemoClaw-backed Agent instances.
- Map a TaskLattice Agent Instance to a NemoClaw sandbox.
- Fetch an approved Skill package from an HTTP or HTTPS endpoint.
- Verify Skill identity, digest, package structure, provenance, and policy.
- Cache immutable Skill artifacts in S3 and on Runtime Host local disk.
- Install, update, roll back, and remove Skills from a NemoClaw sandbox.
- Reconcile desired TaskLattice state with observed NemoClaw state.
- Record operations, errors, audit events, metrics, and runtime evidence.
- Keep AI Service credentials and S3 credentials outside the Agent sandbox.

### 2.2 Out of scope

- Onboarding or deploying AI models.
- Creating model-serving instances.
- Running vLLM or another inference server.
- Managing the upstream AI Service Endpoint lifecycle.
- Treating an OpenClaw plugin as a TaskLattice Skill.
- Allowing an Agent to fetch arbitrary packages from the internet.
- Allowing an Agent sandbox to access the S3 bucket directly.
- Promising in-process hot reload for the currently active conversation.

The Agent may call approved AI Service Endpoints through the TaskLattice AI Service Gateway, using its active Quota Grants. That access-plane design remains outside this runtime document.

## 3. NemoClaw facts that shape the design

The implementation must follow the actual NemoClaw runtime rather than introduce a second Agent lifecycle beside it.

### 3.1 Runtime topology

NemoClaw provides a host-side CLI, an OpenShell gateway, and a sandboxed Agent container. The gateway owns sandbox lifecycle coordination, network policy, credential handling, and the L7 proxy. The Agent runs inside the sandbox under the OpenShell security boundary.

The default Docker-driver topology is a host plus Docker containers. The runtime design must not assume that every NemoClaw installation is Kubernetes-based. See the official [NemoClaw architecture](https://docs.nvidia.com/nemoclaw/latest/reference/architecture.html) and [how it works](https://docs.nvidia.com/nemoclaw/latest/about/how-it-works.html).

### 3.2 Skill installation contract

NemoClaw currently exposes these Skill operations:

~~~text
nemoclaw <sandbox> skill install <local-path>
nemoclaw <sandbox> skill remove <skill-name>
~~~

The install command accepts a local Skill directory, or a path to `SKILL.md`. It does not accept the TaskLattice remote HTTP endpoint as its runtime contract. TaskLattice therefore needs a host-side fetch and materialization step before calling NemoClaw.

The current implementation validates the Skill name from `SKILL.md`, uploads the Skill into the sandbox, mirrors it into the Agent-specific load path, refreshes the OpenClaw session index, and verifies installation. The relevant upstream implementation is in:

- [skill-install.ts](https://github.com/NVIDIA/NemoClaw/blob/main/src/lib/actions/sandbox/skill-install.ts)
- [skill-install helper](https://github.com/NVIDIA/NemoClaw/blob/main/src/lib/skill-install.ts)
- [remote Skill operations](https://github.com/NVIDIA/NemoClaw/blob/main/src/lib/skill-remote.ts)

For OpenClaw, the observed installation paths are:

~~~text
/sandbox/.openclaw/skills/<skill-name>
$HOME/.openclaw/skills/<skill-name>
~~~

These paths are NemoClaw implementation details. TaskLattice must use the CLI and its verification result instead of writing these directories directly.

### 3.3 Skill is not plugin

A NemoClaw/OpenClaw Skill is a directory centered on `SKILL.md` that supplies Agent instructions and supporting files. An OpenClaw plugin is executable runtime extension code with a different installation and trust model.

The HTTP artifact in this design is a Skill package. If executable plugins are required later, they need a separate image-build, signing, review, and rollout design.

### 3.4 Reload behavior

OpenClaw caches Skill content by session. After Skill installation, NemoClaw refreshes session discovery so the new Skill can be discovered by a subsequent session. TaskLattice must report this as `AVAILABLE_FOR_NEW_SESSION`, not claim that a Skill has altered the current conversation in place.

For another NemoClaw-supported Agent type, the adapter may need to restart the Agent gateway before the Skill is available. Reload behavior is therefore a capability reported by the runtime adapter, not a property declared only by the Skill publisher.

### 3.5 Version stability

NemoClaw is currently described as alpha software. TaskLattice must pin tested NemoClaw and compatible Agent versions per Runtime Profile, wrap CLI output in an adapter, and run contract tests before a version upgrade. The upstream project is [NVIDIA/NemoClaw](https://github.com/NVIDIA/NemoClaw).

## 4. Target architecture

~~~mermaid
flowchart LR
    USER["Marketplace user"] --> API["TaskLattice Control API"]
    API --> DB[("PostgreSQL")]
    API --> OUTBOX["Transactional outbox"]
    OUTBOX --> WORKER["Runtime Control Worker"]

    subgraph CONTROL["TaskLattice Control Plane"]
        WORKER --> RM["Runtime Manager"]
        RM --> RESOLVER["Skill Artifact Resolver"]
        RESOLVER --> VERIFY["Package Verifier"]
        RM --> ADAPTER["NemoClaw Runtime Adapter"]
    end

    ORIGIN["Approved Skill HTTP Endpoint"] --> RESOLVER
    VERIFY --> S3[("S3 immutable Skill cache")]

    subgraph HOST["NemoClaw Runtime Host"]
        RUNNER["Privileged Host Runner"]
        L2[("Local artifact cache")]
        CLI["Pinned NemoClaw CLI"]
        GATEWAY["OpenShell gateway"]
        SANDBOX["Agent sandbox"]
        INSTALLED["Installed Skill copy"]

        RUNNER --> L2
        RUNNER --> CLI
        CLI --> GATEWAY
        GATEWAY --> SANDBOX
        SANDBOX --> INSTALLED
    end

    ADAPTER --> RUNNER
    S3 --> RUNNER
    SANDBOX --> AISG["TaskLattice AI Service Gateway"]
~~~

### 4.1 Trust boundaries

| Boundary | Trusted responsibility | Must not receive |
|---|---|---|
| Control API | Authorization, desired state, audit request | S3 object bodies, sandbox shell access |
| Runtime Control Worker | Durable orchestration and retries | Long-lived upstream AI credentials |
| Skill Artifact Resolver | HTTP fetch, revalidation, digest resolution | Ability to install into arbitrary sandboxes |
| Package Verifier | Parse and validate untrusted artifact | Runtime Host root access |
| Host Runner | Execute allowlisted NemoClaw operations | Arbitrary user-provided commands |
| Agent sandbox | Run the selected Agent and installed Skills | S3 credentials, origin credentials, host Docker socket |
| S3 | Store immutable verified artifacts | Mutable alias as the only source of truth |

## 5. Runtime components

### 5.1 Control API

The Control API validates authorization and desired configuration, creates a durable Runtime Operation, and returns `202 Accepted`. It never waits for NemoClaw execution in the web request.

Responsibilities:

- Validate project, environment, Runtime Profile, Agent definition, and Skill Binding.
- Ensure the Skill Version is approved and compatible.
- Create or update desired state in one database transaction.
- Write a transactional outbox record.
- Return an operation ID for polling or event streaming.

### 5.2 Runtime Control Worker

The worker consumes outbox events and runs a durable state machine. It owns retries, timeouts, rollback, reconciliation, and operation status.

Only one mutating operation may execute for an Agent Instance at a time. Use a database advisory lock or a lease keyed by `agent_instance_id`.

### 5.3 Runtime Manager

The Runtime Manager is the provider-neutral orchestration layer. It decides what should happen. It does not know NemoClaw filesystem paths or parse CLI text.

~~~text
CreateAgent(instance, revision)
StartAgent(instance)
StopAgent(instance)
DestroyAgent(instance)
InstallSkill(instance, binding, artifact)
RemoveSkill(instance, binding)
ObserveAgent(instance)
ObserveSkills(instance)
~~~

### 5.4 NemoClaw Runtime Adapter

The adapter converts Runtime Manager calls into a small, pinned set of NemoClaw operations. It owns:

- Sandbox-name generation and validation.
- Host selection and routing.
- CLI invocation with hard timeouts.
- Structured interpretation of command results.
- Secret redaction.
- Capability detection for the selected Agent type.
- Post-operation verification.

The adapter must not expose a general-purpose `exec(command)` API to the Control Plane.

### 5.5 Host Runner

The Host Runner runs on each NemoClaw Runtime Host. It is the only TaskLattice component allowed to invoke the NemoClaw CLI on that host.

Recommended deployment properties:

- Run as a dedicated operating-system identity.
- Use a Unix socket or mutual-TLS control channel.
- Accept typed operations, not shell strings.
- Validate sandbox names, paths, digests, and operation IDs.
- Materialize Skills only below an owned cache root.
- Enforce per-command timeout and output-size limits.
- Return exit code, normalized error code, sanitized stderr, and evidence.
- Never expose the Docker socket or Host Runner API to the Agent sandbox.

### 5.6 Skill Artifact Resolver

The resolver turns an approved HTTP Skill source into an immutable verified artifact. It is the only component that calls the source endpoint.

Responsibilities:

- Normalize and authorize the source URL.
- Resolve a concrete version.
- Perform conditional HTTP revalidation.
- Stream the response with size and time limits.
- Calculate SHA-256 while downloading.
- Validate package structure in an isolated process.
- Verify the publisher signature when required.
- Write the verified artifact to S3 using its digest as the key.
- Record the resolved artifact in PostgreSQL.

## 6. Runtime data model

### 6.1 RuntimeProfile

~~~text
id
name
provider                         NEMOCLAW
nemoclaw_version
agent_type                       OPENCLAW | HERMES | DEEP_AGENTS
agent_version
host_pool
reload_capability                NEW_SESSION | RESTART_AGENT
network_policy_ref
resource_policy_json
status
created_at
updated_at
~~~

The version fields are pinned. `latest` is not a valid production value.

### 6.2 AgentInstance runtime fields

~~~text
id
agent_definition_id
runtime_profile_id
runtime_provider                 NEMOCLAW
runtime_host_id
runtime_instance_ref             NemoClaw sandbox name
desired_revision
observed_revision
desired_state
observed_state
runtime_capabilities_json
last_heartbeat_at
last_observed_at
created_at
updated_at
~~~

`runtime_instance_ref` is generated by TaskLattice and is unique per environment. A recommended format is:

~~~text
tasklattice-<environment>-<agent-instance-short-id>
~~~

Do not derive authorization from the sandbox name. The database identity remains authoritative.

### 6.3 SkillArtifact

~~~text
id
skill_version_id
source_url
resolved_url
source_etag
source_last_modified
content_sha256
content_length
media_type
s3_bucket
s3_object_key
s3_version_id
signature_type
signature_value
verification_status
verification_report_json
created_at
last_verified_at
~~~

There is one logical artifact per content digest. Multiple Skill Versions may reference the same artifact when the bytes are identical.

### 6.4 RuntimeOperation

~~~text
id
idempotency_key
agent_instance_id
skill_binding_id                 nullable
operation_type
requested_revision
previous_revision
status
attempt
runtime_host_id
external_operation_ref
error_code
error_message
evidence_json
started_at
heartbeat_at
completed_at
created_at
~~~

Recommended Skill operation statuses:

~~~text
QUEUED
FETCHING
VERIFYING_SOURCE
CACHING
MATERIALIZING
INSTALLING
REFRESHING
VERIFYING_RUNTIME
SUCCEEDED
ROLLING_BACK
ROLLED_BACK
FAILED
CANCELLED
~~~

## 7. HTTP Skill source contract

TaskLattice can integrate an existing endpoint, but a precise response contract prevents ambiguous or mutable installs.

### 7.1 Recommended endpoint

~~~http
GET /v1/skills/{skill-name}/versions/{version}/bundle.tar.zst
Accept: application/vnd.tasklattice.skill+tar+zstd
If-None-Match: "<previous-etag>"
~~~

Successful response:

~~~http
HTTP/1.1 200 OK
Content-Type: application/vnd.tasklattice.skill+tar+zstd
Content-Length: 18342
ETag: "origin-cache-validator"
Digest: sha-256=<base64-digest>
X-TaskLattice-Skill-Name: knowledge-search
X-TaskLattice-Skill-Version: 1.2.0
Cache-Control: private, max-age=300
~~~

An endpoint may instead expose a manifest that contains a signed artifact URL. The resolved artifact URL is still subject to the same host, redirect, size, and digest policy.

The digest covers the exact compressed bundle bytes returned by the source. TaskLattice stores those same bytes in S3 and must not repackage them after verification. Package-structure checks are recorded separately in the verification report.

### 7.2 Required package structure

~~~text
knowledge-search/
├── SKILL.md
├── references/
│   └── usage.md
└── assets/
    └── schema.json
~~~

Requirements:

- Exactly one package root.
- A root `SKILL.md` with valid YAML frontmatter.
- Frontmatter `name` equals the approved TaskLattice Skill identity.
- Skill name contains only characters accepted by the pinned NemoClaw version.
- No absolute paths, `..` traversal, symlinks, hard links, device nodes, sockets, or FIFOs.
- No duplicate normalized paths or case-collision paths.
- No files above configured count, individual-size, and expanded-size limits.
- No dotfiles unless a future explicitly reviewed contract requires them; current NemoClaw upload behavior skips dotfiles.
- The calculated package digest equals the approved `SkillVersion.package_digest`.

The TaskLattice Skill manifest remains the policy and approval record. `SKILL.md` is the Agent-consumable runtime projection. A publisher cannot obtain additional network, secret, or service access merely by writing it into `SKILL.md`.

### 7.3 Mutable source handling

The tuple `(skill name, version, source URL)` is not sufficient for integrity because an endpoint can change bytes without changing the URL.

TaskLattice always resolves it to:

~~~text
Skill Version -> content SHA-256 -> immutable S3 object
~~~

If the source returns different bytes for an already approved version, TaskLattice quarantines the new digest and raises `SOURCE_DIGEST_CHANGED`. It never silently replaces the approved artifact.

`ETag` and `Last-Modified` are freshness validators only. They are not substitutes for SHA-256 or a publisher signature.

## 8. Three-layer Skill cache

### 8.1 Cache roles

| Layer | Location | Purpose | Lifetime |
|---|---|---|---|
| L1 | NemoClaw sandbox | Installed runtime working set | Current sandbox container lifetime; reconcile after start, recover, or rebuild |
| L2 | Runtime Host local disk | Fast materialization for installs and restarts | Bounded LRU/TTL cache |
| L3 | S3 bucket | Shared persistent, immutable artifact cache | Retention policy |

The remote HTTP endpoint remains the origin. S3 becomes the verified internal artifact mirror after the first successful fetch.

### 8.2 Why S3 is appropriate

S3 provides durable shared storage across Runtime Hosts and supports versioning, encryption, lifecycle rules, and conditional writes. It allows a new Runtime Host to install an already verified Skill without depending on the origin endpoint.

S3 is not appropriate as the direct hot cache because every Agent start would add network dependency and latency. Mounting S3 with `s3fs` also weakens the explicit download, digest verification, atomic extraction, and least-privilege boundaries.

### 8.3 S3 object layout

Use a content-addressed prefix:

~~~text
s3://<bucket>/tasklattice-skills/v1/sha256/<first-2>/<full-digest>/bundle.tar.zst
s3://<bucket>/tasklattice-skills/v1/sha256/<first-2>/<full-digest>/manifest.json
s3://<bucket>/tasklattice-skills/v1/sha256/<first-2>/<full-digest>/signature.json
~~~

Example:

~~~text
s3://tasklattice-runtime-artifacts/tasklattice-skills/v1/sha256/7a/7a91...e0/bundle.tar.zst
~~~

Do not use only `skills/<name>/<version>` as the artifact key. A readable name/version index may exist in PostgreSQL, but the object body key is derived from the digest.

### 8.4 S3 write rules

1. The resolver calculates the digest before publishing the artifact.
2. It writes to the digest key with `If-None-Match: *`.
3. If the key already exists, it reads object metadata and verifies digest and size instead of overwriting.
4. An S3 object by itself is not a verified database record. If a previous writer stopped after object upload, the resolver re-reads and verifies the orphan object before adopting it.
5. The database record is committed only after the S3 object is readable and verified.
6. The outbox publishes `SKILL_ARTIFACT_READY` after the database commit.

S3 supports conditional writes that prevent overwriting an existing key. See [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).

### 8.5 S3 bucket configuration

Recommended baseline:

- Block all public access.
- Disable ACL-based access and use IAM and bucket policies.
- Require TLS.
- Enable S3 Versioning for recovery from accidental administrative changes.
- Use SSE-KMS with a customer-managed key when centralized key policy and audit are required; otherwise document the accepted default-encryption policy.
- Use an S3 Bucket Key when appropriate to reduce KMS request volume.
- Enable access logging or CloudTrail data events according to audit requirements.
- Apply lifecycle rules to incomplete multipart uploads and retired artifacts.
- Consider Object Lock in governance mode only when tamper-resistant retention is required; it increases deletion and incident-recovery complexity.
- Prefer an S3 VPC endpoint when Runtime Hosts operate inside AWS networking.

AWS documents [S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html), [Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html), [SSE-KMS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html), and [S3 Lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html).

### 8.6 IAM separation

Use separate identities:

| Identity | Required S3 permissions |
|---|---|
| Skill Resolver writer | `PutObject`, `HeadObject`, optional multipart operations on `tasklattice-skills/v1/sha256/*` |
| Runtime Host reader | `GetObject`, `HeadObject` on the same prefix |
| Cache janitor | Lifecycle administration or narrowly scoped delete, separated from runtime |
| Agent sandbox | None |

The resolver writer should not overwrite an existing digest object. The Runtime Host reader should not upload or delete artifacts. KMS permissions follow the same separation: writer gets the minimum encryption permissions and readers get `kms:Decrypt` only for the relevant key.

### 8.7 Local cache layout

~~~text
/var/lib/tasklattice-runtime/skills/sha256/<full-digest>/
├── bundle.tar.zst
├── expanded/
│   └── <skill-name>/SKILL.md
├── verification.json
└── READY
~~~

Rules:

- Download into a temporary directory on the same filesystem.
- Verify compressed-object digest before extraction.
- Validate every archive entry during extraction.
- Verify the canonical expanded representation.
- Create `READY` last.
- Atomically rename the temporary directory into the digest path.
- Treat a directory without `READY` as incomplete and delete it.
- Use a per-digest file lock to prevent duplicate downloads.
- Evict only entries not referenced by an active operation or installed Agent.

### 8.8 Cache lookup algorithm

~~~text
resolve_artifact(skill_version):
  expected_digest = approved SkillVersion.package_digest

  if database and L3 contain verified object(expected_digest):
      return immutable artifact reference

  fetch approved HTTP source
  verify digest, signature, identity, and package policy
  publish immutable L3 object
  commit SkillArtifact record
  return immutable artifact reference

materialize_on_runtime_host(artifact_reference):
  if L2 contains READY(expected_digest):
      verify local metadata and return L2 path

  download the exact S3 object version to an L2 temp path
  verify SHA-256 and package structure
  atomically publish the L2 entry
  return L2 path
~~~

A corrupt L2 entry is deleted and rehydrated from S3. A corrupt or digest-mismatched S3 object is quarantined and treated as a security incident; TaskLattice must not fall through and install it.

## 9. Agent lifecycle

### 9.1 Create Agent

~~~mermaid
sequenceDiagram
    participant API as TaskLattice Control API
    participant W as Runtime Worker
    participant A as NemoClaw Adapter
    participant H as Host Runner
    participant N as NemoClaw/OpenShell

    API->>W: AGENT_CREATE_REQUESTED
    W->>W: Acquire Agent Instance lock
    W->>A: Create(instance, pinned profile)
    A->>H: CreateSandbox typed request
    H->>N: Invoke pinned NemoClaw onboarding flow
    N-->>H: Sandbox created and Agent ready
    H-->>A: Structured result and evidence
    A->>H: Observe sandbox and runtime capabilities
    H-->>A: Observed state
    A-->>W: RUNNING, runtime_instance_ref
    W->>API: Persist observed revision and status
~~~

The adapter should treat lifecycle completion as successful only after observation confirms:

- the expected sandbox exists;
- the expected Agent type is running;
- the pinned Runtime Profile is reported;
- required network policy is applied;
- the Agent health probe succeeds.

### 9.2 Stop and destroy

Stop is reversible and preserves the TaskLattice Agent Instance identity. It does not guarantee that the next sandbox container retains installed Skills. Start must therefore reconcile required Skill Bindings before the Agent returns to `READY`. Destroy removes the NemoClaw sandbox only after TaskLattice revokes the Agent service identity and records the final observed state.

Destroy is idempotent: an already absent sandbox is success when the database operation owns the expected instance reference.

### 9.3 Reconciliation

Run reconciliation:

- periodically;
- after a worker restart;
- after a Host Runner reconnects;
- after a NemoClaw CLI timeout;
- before retrying an operation with an uncertain result.

Reconciliation compares desired state with observed sandbox, Agent type, Runtime Profile revision, installed Skills, and health. It never assumes that a timed-out CLI command failed.

The adapter also normalizes lifecycle semantics. In the validated NemoClaw version, a successfully stopped Docker sandbox could temporarily be reported as an upstream `Error`, and a start could pass through transient error states before becoming healthy. TaskLattice combines desired state, container state, grace periods, Agent health, inference health, and required Skill observation instead of exposing the raw upstream phase directly.

## 10. Skill install flow

~~~mermaid
sequenceDiagram
    participant U as User
    participant API as TaskLattice Control API
    participant W as Runtime Worker
    participant R as Artifact Resolver
    participant O as Skill HTTP Origin
    participant S as S3 Cache
    participant H as Runtime Host Runner
    participant N as NemoClaw Sandbox

    U->>API: Load approved Skill Version
    API->>API: Validate binding, policy, compatibility
    API-->>U: 202 Operation accepted
    API->>W: SKILL_INSTALL_REQUESTED
    W->>W: Acquire per-Agent lock
    W->>R: Resolve approved artifact

    alt Verified digest object exists
        R->>S: HEAD exact digest object
        S-->>R: Object metadata and version
    else Digest object does not exist
        R->>O: GET approved version URL
        O-->>R: Skill bundle
        R->>R: Verify digest, signature, identity, archive
        R->>S: Conditional PUT digest object
    end

    R-->>W: Verified digest and S3 artifact reference
    W->>H: InstallSkill(agent, immutable artifact reference)
    H->>H: Check Runtime Host L2 cache
    opt L2 cache miss
        H->>S: GET exact object version
        S-->>H: Immutable bundle
        H->>H: Verify and atomically materialize L2 entry
    end
    H->>N: nemoclaw <sandbox> skill install <path>
    N-->>H: Install and verification result
    H-->>W: Installed Skill identity and evidence
    W->>H: Observe installed Skills / Agent health
    H-->>W: Observed result
    W->>API: Persist observed binding state
~~~

### 10.1 Pre-install checks

Before invoking NemoClaw, the worker verifies:

- Agent Instance is `RUNNING` or in an allowed maintenance state.
- Skill Binding still desires this exact Skill Version.
- Skill Version and artifact approval are active.
- Content digest equals the approved digest.
- Runtime Profile supports the Skill format.
- Combined Agent and Skill policy remains permitted.
- No newer operation supersedes this request.

### 10.2 Adapter installation steps

1. Resolve the content-addressed L2 directory.
2. Revalidate `READY`, digest, and verification report.
3. Copy or bind the canonical package into an operation-scoped staging path.
4. Call `nemoclaw <sandbox> skill install <staging-path>` without shell interpolation.
5. Capture bounded stdout, stderr, exit code, duration, and NemoClaw version.
6. Ask NemoClaw or the supported Agent CLI to observe the installed Skill.
7. Verify the Skill name and expected runtime content marker.
8. Run the configured Agent health probe.
9. Persist observed state and sanitized evidence.
10. Remove the operation-scoped staging path.

TaskLattice does not write NemoClaw internal Skill directories directly.

### 10.3 User-visible completion semantics

For OpenClaw:

~~~text
SUCCEEDED
runtime_availability = AVAILABLE_FOR_NEW_SESSION
current_session_changed = false
~~~

For an Agent type that requires restart:

~~~text
SUCCEEDED
runtime_availability = AVAILABLE_AFTER_RESTART
restart_performed = true
~~~

If the installed files exist but runtime discovery cannot be verified, the operation is not successful. It enters rollback or `FAILED_UNCERTAIN`, followed by reconciliation.

## 11. Upgrade and rollback

An upgrade is a new immutable Skill Version and a new digest. S3 never overwrites the prior artifact.

### 11.1 Upgrade sequence

1. Record the currently observed Skill Version and digest.
2. Resolve and verify the new artifact.
3. Keep both old and new artifacts pinned in L2 for the operation.
4. Install the new version through NemoClaw.
5. Refresh or restart according to runtime capability.
6. Verify discovery and Agent health.
7. Mark the new version observed.
8. Release the old L2 pin only after the rollback window.

### 11.2 Rollback

If installation or health verification fails:

1. Remove the failed Skill using the supported NemoClaw command.
2. Reinstall the previous verified local artifact when one exists.
3. Refresh session discovery or restart the Agent as required.
4. Verify the previous version and Agent health.
5. Mark the operation `ROLLED_BACK`.

If rollback cannot restore the previous state, mark the Agent `DEGRADED`, revoke it from new work when applicable, and create an operator alert. Never report a healthy rollback based only on a successful file copy.

## 12. Skill removal

The adapter calls:

~~~text
nemoclaw <sandbox> skill remove <skill-name>
~~~

Removal completes only when runtime observation confirms that the Skill is no longer available to new sessions. Removing a required Skill must first pass the Agent Definition policy or be part of an Agent shutdown/destroy workflow.

S3 and L2 artifact deletion are not part of Skill removal. Artifact retention is independent so that audit and rollback remain possible.

## 13. Idempotency, concurrency, and recovery

### 13.1 Idempotency key

Use a deterministic key:

~~~text
sha256(
  operation_type +
  agent_instance_id +
  desired_revision +
  skill_binding_id +
  requested_content_digest
)
~~~

The database enforces uniqueness. Repeated API requests return the existing operation.

### 13.2 Per-Agent serialization

Skill install, upgrade, remove, Agent restart, and destroy are serialized for one Agent Instance. Artifact downloads for different Agents may run concurrently and deduplicate on the digest lock.

### 13.3 Retry rules

| Failure | Retry behavior |
|---|---|
| HTTP timeout before response | Retry with bounded exponential backoff |
| HTTP 404 for approved immutable version | Do not retry indefinitely; mark source unavailable |
| HTTP 401/403 | Do not retry until credential/configuration changes |
| HTTP 429/5xx | Retry with `Retry-After` and bounded backoff |
| S3 transient error | Retry safely by digest key |
| Digest or signature mismatch | Never retry as transient; quarantine |
| NemoClaw command returns known transient error | Re-observe, then retry if safe |
| NemoClaw command times out | Observe actual state before any retry |
| Agent health check fails after upgrade | Roll back |

### 13.4 Worker crash recovery

Each running operation updates `heartbeat_at`. A recovery worker claims stale operations, acquires the per-Agent lock, observes the actual runtime, and resumes from the earliest safe state. It does not blindly repeat the last CLI command.

## 14. Security controls

### 14.1 HTTP fetch security

Treat the Skill endpoint and bundle as untrusted input even when they are internal.

- Require HTTPS in production.
- Allowlist scheme, hostname, port, and optional path prefix per Skill source.
- Resolve DNS and reject loopback, link-local, metadata, multicast, and private ranges unless explicitly approved.
- Re-check the destination after every redirect and limit redirect count.
- Set connection, response-header, idle, and total timeouts.
- Enforce compressed and expanded byte limits.
- Stream to disk; do not buffer the entire bundle in memory.
- Do not forward origin authorization headers across hosts on redirect.
- Store endpoint credentials in the platform secret manager, not in the Skill package.
- Log source identity and result, but never log authorization headers or signed URLs.

### 14.2 Package verification

- Calculate SHA-256 during download and again when materializing from an untrusted cache boundary.
- Require exact digest match with the approved Skill Version.
- Verify publisher signature when the source is outside the platform trust domain.
- Extract in a dedicated non-root process with no network.
- Reject archive traversal, links, special files, collisions, and decompression bombs.
- Scan textual content for secrets and prohibited instructions according to policy.
- Store the full verification report and verifier version.

### 14.3 NemoClaw network policy

The recommended architecture fetches Skills outside the sandbox, so the Agent does not need egress to the Skill endpoint or S3.

If a future Skill needs runtime network access, that destination must be declared in the approved TaskLattice Skill manifest and translated into an explicit OpenShell network policy. NemoClaw blocks destinations that are not allowed by policy; do not add a broad wildcard merely to make Skill loading work. See the official [NemoClaw network policy documentation](https://docs.nvidia.com/nemoclaw/latest/reference/network-policies.html).

### 14.4 Secrets

- S3 credentials exist only on the resolver or Runtime Host identity.
- Skill-origin credentials exist only in the resolver.
- AI Service upstream credentials remain in the TaskLattice Gateway or OpenShell credential boundary.
- The Agent receives only short-lived, grant-scoped internal access.
- `SKILL.md`, runtime logs, operation evidence, and error messages are scanned or redacted before persistence.

### 14.5 Host Runner command safety

The Host Runner API uses typed fields:

~~~json
{
  "operationId": "op_01...",
  "sandbox": "tasklattice-prod-a1b2c3",
  "action": "INSTALL_SKILL",
  "skillName": "knowledge-search",
  "contentSha256": "7a91...e0"
}
~~~

It derives the local path from `contentSha256`. It does not accept an arbitrary path or raw CLI arguments from the API.

## 15. Runtime adapter contract

Recommended internal interface:

~~~typescript
interface NemoClawRuntimeAdapter {
  capabilities(profile: RuntimeProfile): Promise<RuntimeCapabilities>;

  createAgent(input: CreateAgentInput): Promise<RuntimeResult>;
  observeAgent(instance: AgentInstanceRef): Promise<ObservedAgent>;
  stopAgent(instance: AgentInstanceRef): Promise<RuntimeResult>;
  destroyAgent(instance: AgentInstanceRef): Promise<RuntimeResult>;

  installSkill(input: InstallSkillInput): Promise<RuntimeResult>;
  removeSkill(input: RemoveSkillInput): Promise<RuntimeResult>;
  observeSkills(instance: AgentInstanceRef): Promise<ObservedSkill[]>;
}

interface InstallSkillInput {
  operationId: string;
  instance: AgentInstanceRef;
  skillName: string;
  expectedDigest: string;
  artifact: {
    bucket: string;
    objectKey: string;
    objectVersionId: string;
  };
  expectedRuntimeAvailability: "NEW_SESSION" | "AFTER_RESTART";
}
~~~

Every result includes:

~~~text
success
normalized_error_code
retryable
runtime_provider
runtime_version
agent_type
started_at
completed_at
sanitized_evidence
~~~

The adapter normalizes known failures into stable TaskLattice codes such as:

~~~text
RUNTIME_HOST_UNAVAILABLE
SANDBOX_NOT_FOUND
SANDBOX_NOT_READY
SKILL_NAME_INVALID
SKILL_INSTALL_REJECTED
SKILL_RUNTIME_VERIFICATION_FAILED
AGENT_RESTART_FAILED
COMMAND_TIMEOUT_STATE_UNKNOWN
RUNTIME_VERSION_UNSUPPORTED
~~~

## 16. Control API

### 16.1 Agent lifecycle

~~~http
POST   /v1/agent-definitions/{id}/instances
GET    /v1/agent-instances/{id}
POST   /v1/agent-instances/{id}:start
POST   /v1/agent-instances/{id}:stop
DELETE /v1/agent-instances/{id}
~~~

### 16.2 Skill runtime operations

~~~http
POST   /v1/agent-instances/{id}/skill-bindings
PUT    /v1/agent-instances/{id}/skill-bindings/{bindingId}
DELETE /v1/agent-instances/{id}/skill-bindings/{bindingId}
GET    /v1/agent-instances/{id}/skills
GET    /v1/runtime-operations/{operationId}
~~~

Mutating requests accept an `Idempotency-Key`. They return:

~~~json
{
  "operationId": "op_01J...",
  "status": "QUEUED",
  "agentInstanceId": "agi_01J...",
  "desiredRevision": 14
}
~~~

### 16.3 Observed Skill response

~~~json
{
  "bindingId": "skb_01J...",
  "skill": "knowledge-search",
  "desiredVersion": "1.2.0",
  "desiredDigest": "sha256:7a91...e0",
  "observedVersion": "1.2.0",
  "observedDigest": "sha256:7a91...e0",
  "state": "AVAILABLE_FOR_NEW_SESSION",
  "lastOperationId": "op_01J...",
  "observedAt": "2026-07-14T08:10:00Z"
}
~~~

## 17. Observability and audit

### 17.1 Metrics

~~~text
tali_runtime_operation_duration_seconds{operation_type,result,runtime_profile}
tali_runtime_operation_total{operation_type,result,error_code}
tali_runtime_reconciliation_drift_total{drift_type}
tali_runtime_host_available{host_id}
tali_skill_origin_fetch_duration_seconds{origin,result}
tali_skill_cache_request_total{layer,result}
tali_skill_cache_bytes{layer}
tali_skill_verification_total{result,error_code}
tali_skill_install_duration_seconds{agent_type,result}
~~~

Measure L2 and S3 hit ratios separately. A high S3 hit ratio with a low L2 hit ratio can indicate local cache pressure or excessive host churn.

### 17.2 Structured logs

Include:

- operation ID;
- Agent Instance ID;
- Runtime Host ID;
- runtime profile and pinned versions;
- Skill Binding ID and content digest;
- state transition;
- normalized error code;
- duration.

Exclude:

- source authorization headers;
- signed origin URLs;
- S3 credentials;
- full `SKILL.md` content;
- Agent conversation content;
- raw CLI output before redaction.

### 17.3 Audit events

Record actor, request, approval, selected Skill Version, approved digest, source resolution, verifier version, S3 object version, Host Runner operation, observed runtime result, and rollback result.

## 18. Deployment topology

### 18.1 Control Plane

- Control API replicas.
- Runtime Control Worker replicas with lease-based ownership.
- PostgreSQL with transactional outbox.
- Skill Artifact Resolver workers in a restricted egress network.
- S3 bucket and KMS key.

### 18.2 Runtime Plane

- One or more NemoClaw Runtime Hosts grouped into host pools.
- Pinned NemoClaw CLI and compatible Agent versions per pool.
- One Host Runner per host.
- Host-local L2 cache on persistent disk.
- OpenShell gateway and Agent sandboxes managed by NemoClaw.

A first production release may use one host pool, but the database model and adapter request must contain `runtime_host_id`; otherwise failure recovery and horizontal growth become ambiguous.

### 18.3 Host placement

The scheduler selects only a host that:

- belongs to the Runtime Profile host pool;
- reports the pinned NemoClaw and Agent versions;
- has sufficient declared capacity;
- can reach the TaskLattice AI Service Gateway;
- can reach S3 through the approved path;
- has a healthy Host Runner and OpenShell gateway.

## 19. Verification strategy

### 19.1 Unit tests

- URL and redirect policy.
- Digest and signature validation.
- Archive traversal, symlink, collision, and decompression limits.
- S3 key derivation and conditional-write behavior.
- L2 atomic publish and incomplete-entry cleanup.
- Operation state machine and idempotency.
- Error normalization and redaction.

### 19.2 Contract tests

Run against every pinned NemoClaw/Agent version:

- Create and observe an Agent sandbox.
- Install a valid Skill directory.
- Reject an invalid `SKILL.md` name.
- Observe the installed Skill through the supported runtime interface.
- Verify availability semantics for a new session.
- Upgrade the Skill and observe the new content marker.
- Force a failed upgrade and restore the previous version.
- Remove the Skill and verify absence.
- Restart the Host Runner and reconcile state.

These tests protect TaskLattice from changes in alpha CLI behavior and internal paths.

### 19.3 Integration tests

- Origin miss -> verify -> S3 write -> L2 publish -> NemoClaw install.
- L2 miss -> S3 hit -> install while origin is unavailable.
- L2 hit -> install without origin or S3 object-body read.
- Origin changes bytes for an approved version -> quarantine.
- S3 object digest mismatch -> block install and alert.
- Duplicate install requests -> one Runtime Operation.
- Worker crash after CLI timeout -> observe before retry.
- Concurrent install and destroy -> serialized by Agent lock.

### 19.4 Security tests

- SSRF attempts through DNS, redirects, IPv6, and URL parsing ambiguity.
- Oversized headers, bodies, file counts, and expanded archives.
- Secret leakage in CLI stderr and `SKILL.md`.
- Attempts to pass arbitrary Host Runner paths or arguments.
- Sandbox access to S3 and origin credentials must fail.
- Unapproved runtime egress must be blocked by OpenShell policy.

## 20. Delivery plan

### Phase 1: NemoClaw adapter and Agent lifecycle

- Define Runtime Profile and Agent Instance runtime fields.
- Deploy Host Runner on one NemoClaw host pool.
- Implement create, observe, stop, and destroy.
- Pin NemoClaw and Agent versions.
- Add adapter contract tests.

### Phase 2: Verified Skill resolution

- Define the HTTP Skill package contract.
- Implement streaming fetch, digest validation, archive validation, and signature hook.
- Create `SkillArtifact` records.
- Implement S3 immutable writes.
- Implement atomic L2 cache hydration.

### Phase 3: Skill runtime operations

- Implement install, observe, upgrade, rollback, and remove.
- Report `AVAILABLE_FOR_NEW_SESSION` accurately for OpenClaw.
- Add per-Agent locks, idempotency, durable operation states, and recovery.

### Phase 4: Production hardening

- Add host pools and capacity-aware placement.
- Add S3/KMS/IAM policies and lifecycle rules.
- Add metrics, alerts, audit evidence, and drift reconciliation.
- Run failure, upgrade, and security test suites.

## 21. Decisions

| Question | Decision |
|---|---|
| Can S3 cache Skills? | Yes. Use it as the shared persistent immutable cache. |
| Is S3 the runtime hot cache? | No. Runtime Host local disk is the hot cache. |
| Does the Agent download the Skill? | No. The trusted Artifact Resolver downloads and verifies it. |
| Does the Agent receive S3 credentials? | No. |
| Does NemoClaw install directly from HTTP? | No. TaskLattice materializes a verified local directory first. |
| What is the cache key? | SHA-256 content digest, not URL, name, version, or ETag. |
| Can an approved version change bytes? | No. A changed digest is quarantined as a new unapproved artifact. |
| Is `ETag` an integrity check? | No. It is only a revalidation/freshness hint. |
| Is Skill install immediately active in the current conversation? | Not guaranteed. For OpenClaw, report availability for a new session. |
| Should TaskLattice write NemoClaw internal directories? | No. Use the supported CLI and verify observed state. |
| Should S3 be mounted into the sandbox? | No. Hydrate an atomic local cache outside the sandbox. |

## 22. Source references

- [NVIDIA/NemoClaw repository](https://github.com/NVIDIA/NemoClaw)
- [NemoClaw architecture](https://docs.nvidia.com/nemoclaw/latest/reference/architecture.html)
- [How NemoClaw works](https://docs.nvidia.com/nemoclaw/latest/about/how-it-works.html)
- [NemoClaw Skill install action](https://github.com/NVIDIA/NemoClaw/blob/main/src/lib/actions/sandbox/skill-install.ts)
- [NemoClaw Skill install helper](https://github.com/NVIDIA/NemoClaw/blob/main/src/lib/skill-install.ts)
- [NemoClaw remote Skill operations](https://github.com/NVIDIA/NemoClaw/blob/main/src/lib/skill-remote.ts)
- [NemoClaw/OpenClaw Skill CLI end-to-end test](https://github.com/NVIDIA/NemoClaw/blob/main/test/e2e/live/openclaw-skill-cli.test.ts)
- [Amazon S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)
- [Amazon S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
- [Amazon S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
- [Amazon S3 SSE-KMS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html)
- [Amazon S3 Lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
