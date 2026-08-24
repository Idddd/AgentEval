# AgentEval All-in-One Demo Image and Helm Chart Design

## Context

AgentEval currently publishes separate API and Web images and uses a third
PostgreSQL image at runtime. The requested deployment is a self-contained Demo
artifact: one application image, one container, and one Helm release that can
be started without assembling multiple services. The existing three-role
AgentEval product remains the only application in scope; the nested
`tasklattice-guard` reference project is excluded.

## Goals

- Publish one image named `ghcr.io/idddd/agenteval`.
- Run PostgreSQL 17, the Python evaluation API, and the Node control UI inside
  one container.
- Preserve Demo data across container restarts when a volume is mounted.
- Expose only the control UI on container port `8080`; the API and PostgreSQL
  remain reachable only through container loopback.
- Provide a small AgentEval-specific Helm Chart that deploys the one-container
  Demo.
- Put both the rendered Chart source and the packaged `.tgz` in the image under
  `/opt/agenteval/helm`.
- Publish the same packaged Chart as a Helm OCI artifact under
  `oci://ghcr.io/idddd/charts/agenteval`.
- Keep pull-request validation non-publishing and preserve immutable SHA image
  tags.

## Non-goals

- High availability, horizontal scaling, database replication, or zero-downtime
  upgrades.
- A production-grade PostgreSQL topology or external secret manager.
- Packaging the nested reference application or its standalone Guard service.
- Exposing the Python API or PostgreSQL directly through the Helm Service.
- Retaining the old `agenteval-api` and `agenteval-web` publication jobs.

## Artifacts

The implementation produces three representations of the same release:

1. `ghcr.io/idddd/agenteval:<tag>` contains all three processes and the Chart.
2. `/opt/agenteval/helm/agenteval/` inside that image contains rendered Chart
   source.
3. `/opt/agenteval/helm/agenteval-<version>.tgz` contains the packaged Chart and
   is byte-identical to the artifact pushed to
   `oci://ghcr.io/idddd/charts/agenteval:<version>`.

## Runtime architecture

The final image uses the PostgreSQL 17 Debian image as its runtime foundation.
Multi-stage build stages supply the Python 3.12 environment, installed API
dependencies, Node 22 runtime, pruned Node production dependencies, and the
compiled Web application.

`tini` runs a purpose-built entrypoint as PID 1. The entrypoint performs these
steps in order:

1. Start the official PostgreSQL entrypoint with local Demo credentials and
   wait for `pg_isready`.
2. Apply the existing Prisma migrations against the loopback PostgreSQL
   database.
3. Start Uvicorn on `127.0.0.1:8000` and wait for `/healthz`.
4. Start the Node control server on `0.0.0.0:8080`, configured with
   `EVAL_API_URL=http://127.0.0.1:8000`.
5. Monitor all three child processes. If any child exits, terminate the other
   children, reap them, and return a non-zero exit code.

On `SIGTERM` or `SIGINT`, the entrypoint terminates Web and API first, then
PostgreSQL, waits for every child, and exits. Startup failures identify the
failed component in stderr.

The image health check verifies PostgreSQL readiness, the Python `/healthz`
endpoint, and the Web `/api/health` endpoint. A failure in any component makes
the container unhealthy.

## Data and configuration

A single mount at `/var/lib/agenteval` holds both mutable data sets:

- PostgreSQL uses `/var/lib/agenteval/postgres` through `PGDATA`.
- The evaluation SQLite database uses
  `/var/lib/agenteval/evaluation/web-workbench.db`.

The Demo defaults remain `admin` / `admin` for the UI and
`tasklattice` / `development` for PostgreSQL. All database values can be
overridden with environment variables. The entrypoint derives `DATABASE_URL`
from those values when the caller does not provide one. Credentials are
explicitly documented as Demo-only.

## Docker Compose

The root Compose definition becomes one `agenteval` service and one named
volume. It maps `127.0.0.1:18082` to port `8080`, mounts the volume at
`/var/lib/agenteval`, and uses the combined health check. The image override
file changes to one `AGENTEVAL_IMAGE` setting and keeps
`AGENTEVAL_IMAGE_TAG` for branch, release, and immutable SHA deployment.

## Helm Chart

The new source Chart lives at `deploy/helm/agenteval` and intentionally has no
subchart dependencies. It renders:

- one `Deployment` with `replicas: 1` and `strategy: Recreate`;
- one `ClusterIP` Service exposing port `80` to container port `8080`;
- one `PersistentVolumeClaim` by default, or a caller-supplied existing claim;
- one Secret containing the Demo database credentials, unless an existing
  Secret is supplied;
- liveness, readiness, and startup probes against `/api/health` on port 8080.

The Chart supports image repository, tag, pull policy, pull secrets, service
type/port, persistence size/storage class, resource requests/limits, and extra
environment variables. It rejects replica counts other than one because the
embedded database and ReadWriteOnce data model are single-instance by design.

## Release and CI behavior

The existing container workflow becomes a single-image workflow.

- Pull requests lint and template the Chart, package it, and build the image
  without pushing either artifact.
- Branch pushes publish image tags `sha-<12-character-commit>` and the
  normalized branch name.
- `main` additionally publishes the image tag `latest`.
- Release tags in the exact form `vMAJOR.MINOR.PATCH` publish image tags
  `MAJOR.MINOR.PATCH` and `vMAJOR.MINOR.PATCH`.
- Helm package versions are `MAJOR.MINOR.PATCH` for releases and
  `0.1.0-main.<run-number>` for `main`. Other branch validation packages use
  `0.1.0-dev.<run-number>` and are not pushed to the OCI registry.
- The Chart `appVersion` and default image tag use the immutable
  `sha-<12-character-commit>` tag so a Helm install cannot silently drift.

The workflow packages the Chart before building the image. The generated
source directory and `.tgz` are then copied into the image, and that exact
`.tgz` is passed to `helm push` after a successful image publication.

## Validation strategy

Packaging contract tests are written before implementation and assert the
single-service Compose model, required Chart resources and values, single-image
workflow, and in-image Chart paths. After implementation, validation includes:

- Python and Web test suites;
- TypeScript checking and production Web build;
- `docker compose config` for source and published-image modes;
- `helm lint`, `helm template`, and `helm package`;
- a full Docker build;
- a runtime smoke test that starts the one container, waits for health, checks
  the Web and API through their intended routes, verifies PostgreSQL readiness,
  and confirms the Chart source and `.tgz` exist inside the image;
- workflow YAML parsing and a check that the packaged Chart in the image is the
  same file prepared for OCI publication.

## Demo limitations and failure recovery

This architecture deliberately couples the application and database lifecycle.
A pod restart stops all components, and an image upgrade uses a Recreate
deployment. The persistent volume protects normal restart data, but operators
must copy or snapshot that volume for backup. If the volume is removed, all
Demo data is lost. These limitations are shown in the README and Helm NOTES.

## Acceptance criteria

- One local Docker build produces the complete AgentEval Demo image.
- `docker compose up` starts only one service container and the UI becomes
  healthy at `http://127.0.0.1:18082`.
- The UI can reach the loopback API and use its embedded PostgreSQL database.
- Restarting the container with the volume retained preserves data.
- The image contains rendered Chart source and the packaged Chart.
- The Chart renders exactly one application Pod and installs successfully with
  one persistent volume.
- GitHub Actions publishes one application image and the matching OCI Helm
  Chart, while pull requests perform build-only validation.
