# Agent Garden technical design

## Outcome

Agent Garden is the Project-scoped catalog for discovering, registering, and
connecting Agents. It deliberately separates three concepts:

- **Agent definition** — a reusable built-in template or a Project-registered
  remote Agent.
- **Agent Instance** — a running OpenClaw or Hermes runtime created from a
  built-in definition.
- **Agent connection** — an explicit authorization for one Coordinator
  Instance to delegate tasks to one callable built-in or Project-registered
  Agent.

“Primary Agent” and “Sub Agent” are not permanent Agent types. They are roles
inside a connection. OpenClaw or Hermes is shown as the **Coordinator** for
that relationship; the remote Agent is shown as a **Connected Agent**.

```mermaid
flowchart LR
  G["Agent Garden definition"] -->|"Create Instance"| C["OpenClaw / Hermes Coordinator"]
  R["Callable built-in or Project-registered Agent"] -->|"Publish or discover capabilities"| D["Agent Card / endpoint snapshot"]
  C -->|"Explicit connection + policy"| D
  D -.->|"Future runtime gateway: delegate task"| A["A2A or SDK Agent runtime"]
```

## Capability model

Eligibility is represented by independent capability flags instead of a
single “main/sub” enum.

| Capability | Meaning | OpenClaw / Hermes | Claude Code | Callable A2A |
| --- | --- | --- | --- | --- |
| `interactive` | A user can work with it directly | Yes | Yes, coming soon | Optional |
| `canDelegate` | It may coordinate other Agents | Yes | No | No |
| `acceptsDelegation` | Another Agent may call it | No | No | Yes |

The connection service enforces the same rules as the UI:

- only READY OpenClaw and Hermes Instances can be Coordinators;
- only READY catalog Agents with `acceptsDelegation` can be connected;
- built-in OpenClaw, Hermes, and Claude Code definitions cannot be selected as
  Connected Agents;
- a registration cannot be removed while a connection still references it.

## Catalog and registration

The catalog has two layers:

- application-owned platform definitions: OpenClaw Generalist, Hermes Deep
  Researcher, and Claude Code marked **Built-in** and **Coming soon**;
- a versioned, database-backed example catalog seeded into each Project's
  `agent_catalog` table at startup and checked again on Garden reads.

The database catalog contains twelve ADK-inspired interaction blueprints:
Customer Service, Global KYC Agent, Nurse Handover, Deep Search, Cyber
Guardian, Academic Research, Small Business Loans, Software Bug Assistant,
Travel Concierge, Time Series Forecasting, LLM Auditor, and Personalized
Shopping. It also contains GitHub Daily Triage, Pull Request Risk Scanner, and
Release Notes Composer as A2A demos, plus Support Escalation Router as a
LangGraph demo exposed through a TaskLattice A2A adapter.

The examples support two separate interactions:

- **Try demo** sends a real JSON-RPC `message/send` request to a lightweight
  in-process endpoint and renders its execution trace and response;
- **Connect to…** authorizes an OpenClaw or Hermes Coordinator to delegate one
  or more advertised skills.

The outputs are deterministic sample data and have no external side effects.
The cards are explicitly labeled **Blueprint** or **Demo** so the interaction
prototype is not mistaken for a deployed ADK, GitHub, ticketing, medical, or
LangGraph runtime.

Discovery uses one catalog surface for platform definitions, blueprints,
demos, and Project registrations. Built-in and Project-registered entries
remain distinguishable through card metadata instead of a separate navigation
layer or source filter.

Search and grouped capability labels are the only catalog refinement
controls. Capability labels are direct, reversible buttons; selecting any
label shows Agents matching at least one selected capability. The groups
mirror the reference experience while using TaskLattice's existing cards,
typography, spacing, and interaction patterns.

The registration wizard reuses the same lightweight, underline-based progress
component as Instance creation. Completed steps remain clickable, future steps
stay disabled, and only the current step receives primary emphasis.

Catalog cards deep-link to a Marketplace-style detail route at
`/:projectId/agent-garden/:agentId`. The page keeps selection and activation
in one decision path:

- product brief, representative use cases, workflow, inputs, and outputs;
- advertised skills, example tasks, and participation capabilities;
- publisher, version, framework, language, protocol, support, and license;
- requirements and an explicit prototype/runtime boundary;
- **Try preview**, **Connect Agent**, or **Create Instance** according to the
  Agent's actual capabilities and status.

The richer brief is stored as versioned catalog metadata rather than embedded
only in the UI, so every Project sees the same marketplace description and
future seed versions can update it idempotently.

Project registration supports A2A Standard, LangGraph, LangFlow, Bedrock
AgentCore, Azure AI Foundry, Pydantic AI, Vertex AI Agent Engine, watsonx
Orchestrate, and Custom / Other.

Registration is a three-step flow: choose an adapter, configure identity and
connection details, then review and discover. The usage mode is selected
explicitly:

- `INTERACTIVE` — opens independently and cannot be connected;
- `CALLABLE` — accepts delegated tasks;
- `HYBRID` — supports both.

## Discovery and endpoint security

For A2A, Pydantic AI, and compatible LangGraph registrations, discovery reads
an Agent Card and stores a normalized capability snapshot. Other adapters use
an endpoint health check until an adapter-specific discovery client is added.

Discovery applies these controls:

- HTTP(S) only, with URL credentials rejected;
- credentials are resolved by Secret reference and never stored in catalog
  payloads;
- public production endpoints require HTTPS;
- private or loopback endpoints require the explicit internal-network flag;
- redirects are not followed;
- requests time out after seven seconds;
- Agent Card payloads are limited to one megabyte;
- discovered skills are copied into the Project snapshot and can be narrowed
  per connection.

## Persistence

`agent_catalog` stores Project registrations, discovery snapshots, and the
versioned example catalog. Application startup seeds all existing Projects;
the first Garden read also performs the same check so newly created Projects
are covered. Both paths upsert only missing or version-changed seed records,
making the operation idempotent while allowing future catalog revisions. The
three non-callable platform definitions remain application-owned.
`agent_connections` stores Coordinator-to-Agent authorization, approval
behavior, and an optional skill allowlist.

Both tables are Project-scoped. Database foreign keys cascade when a Project
or Coordinator Instance is deleted and restrict deletion of a connected
catalog Agent.

## API surface

| Method | Path suffix | Purpose |
| --- | --- | --- |
| `GET` | `/agent-garden` | Read built-in definitions, Project registrations, and connections |
| `POST` | `/agent-garden/agents` | Register and immediately discover a remote Agent |
| `POST` | `/agent-garden/agents/:id/discover` | Refresh its discovery snapshot |
| `DELETE` | `/agent-garden/agents/:id` | Remove a Project registration |
| `POST` | `/agent-garden/connections` | Authorize a Coordinator connection |
| `DELETE` | `/agent-garden/connections/:id` | Revoke a connection |

Reads require Project membership; mutations require the Project admin role.

The interaction samples also expose two intentionally small, side-effect-free
endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/demo-agents/:id/agent-card` | Read the demo Agent Card |
| `POST` | `/api/v1/demo-agents/:id` | Send one JSON-RPC `message/send` preview |

## Runtime boundary

The current implementation delivers the Agent Garden **control plane**:
catalog, filters, registration, discovery, capability enforcement, and desired
connection state. A connection means “authorized and available for runtime
reconciliation”; it does not claim that a task has already run.

The runtime phase should expose one TaskLattice delegation tool inside each
Coordinator. That tool will:

1. authenticate the calling Instance service account;
2. load only that Instance's active connections;
3. validate the requested discovered skill and approval mode;
4. dispatch through the adapter-specific A2A/SDK client;
5. persist task state and emit an audit event;
6. return a normalized task result to OpenClaw or Hermes.

This gateway should be implemented before labeling connections as
“runtime-synced” or allowing autonomous Agent-to-Agent execution.
