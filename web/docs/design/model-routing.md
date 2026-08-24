# Model Routing interaction design

Status: Implemented full-stack domain

## Product definition

A **Model Routing** is the single model-facing object an operator creates and
an Instance consumes. It gives one name to the complete inference contract:

```text
Provider connections and model deployments
  → LiteLLM public alias and routing behavior
  → compliance, isolated credentials, audit, and lifecycle
  → consuming Instances
```

The Instance workflow no longer asks an operator to reason about Provider
accounts, deployments, or routing internals. Those are upstream implementation
details of the Routing.

## Information architecture

The Models navigation contains:

- **Model Routings**: the primary settings surface for routing readiness, upstream
  inventory, creation, and consumption.
- **Cost**: usage and cost evidence across routings, models, connections, and
  Instances.

The Model Routings settings surface has two ordered scopes:

1. **Routings** — reusable choices exposed to Agent and Instance workflows.
2. **Upstream resource pool** — provider credentials and model deployments
   available to LiteLLM routing.

The Routing detail page contains:

- **Overview** — stable contract, end-to-end inference path, readiness.
- **Routing & upstream** — public alias, detected capabilities, and available
  upstream inventory.
- **Access & policy** — identity, credentials, compliance, audit, lifecycle.
- **Consumers** — Instances and their isolated key fingerprints.
- **Audit** — control-plane history.

## Domain boundaries

TaskLattice owns the Routing identity, readiness boundary, compliance gate,
per-Instance Virtual Key lifecycle, consumer relationship, and audit trail.

LiteLLM remains the source of truth for actual router candidates, weights,
tiers, retries, cooldowns, fallbacks, and provider selection. The current API
does not expose a trustworthy Routing-to-deployment candidate graph, so the UI
labels registered Provider models as an **available upstream pool** and never
claims that every registered model belongs to the selected Routing.

## Primary workflows

### Create a Routing

1. Define the consumer-facing name and description.
2. Select a validated, compliance-compatible model from the upstream pool.
   TaskLattice uses its registered LiteLLM model name as the Routing binding.
   Binding an existing router alias remains available as an advanced option.
3. Review inherited routing boundary, upstream readiness, compliance,
   per-Instance credentials, and audit policy.
4. Create and validate the Routing.

### Add an upstream

The Provider registration drawer is opened inside the Model Routings
surface. Provider selection, credential configuration, model discovery, and
registration remain one progressive flow, but their purpose is framed as
supplying the upstream pool for Routings.

### Consume a Routing

A READY Routing can start the Create Instance flow. Instance creation and
Instance detail consistently display **Model Routing**, including its routing,
compliance, and failover summary.

## API and persistence

Model Routings are first-class resources across contracts, control-plane
services, REST routes, LiteLLM metadata, audit events, Agent bindings, and
PostgreSQL persistence. The canonical collection is
`/api/v1/model-routings`; resource routes use `{routingId}`. There are no
legacy aliases.

Development databases created from the earlier schema must be recreated; the
initial migration is intentionally destructive during this development phase.
