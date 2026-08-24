# AgentEval

AgentEval is a local workbench for evaluating Agents against versioned test
cases. The TALI control console is the project's only Web UI; the Python code
provides the evaluation API, CLI, adapters, and SQLite persistence.

## Runtime architecture

| Runtime | Default address | Storage | Purpose |
| --- | --- | --- | --- |
| AgentEval Demo container | `http://127.0.0.1:18082` | One Docker volume | PostgreSQL 17, TALI Web, and the loopback evaluation API |
| AgentEval CLI | local process | `data/workbench.db` | Scripted evaluation and report workflows |

The container exposes only the TALI Web server. It reverse-proxies
`/api/v1/evaluations/*` to the Python API on container loopback. PostgreSQL and
the AgentEval SQLite database keep their separate responsibilities but persist
beneath the same mounted `/var/lib/agenteval` volume.

## Quick start with Docker

Prerequisites: Docker Desktop.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open `http://127.0.0.1:18082` and sign in with `admin` / `admin`. The API is
available only inside the Demo container and through the Web reverse proxy.

Docker Compose starts one container. Its supervisor initializes PostgreSQL,
applies Prisma migrations, starts the FastAPI service, and finally starts the
TALI Web service. If any component exits, the container stops instead of
leaving a partially working Demo online.

## Published container images

GitHub Actions builds and publishes one self-contained OCI image:

- `ghcr.io/idddd/agenteval`

Every pushed build receives an immutable `sha-<12-character-commit>` tag.
Branches under `codex/**` also receive a normalized branch tag, `main` receives
`latest`, and release tags such as `v1.2.3` publish both `1.2.3` and `v1.2.3`.
Pull requests build the image for validation but do not publish it.

The same image contains the release's rendered Helm Chart:

- source: `/opt/agenteval/helm/agenteval`
- package: `/opt/agenteval/helm/packages/agenteval-<version>.tgz`

For `main` and SemVer release tags, CI extracts that exact package from the
published image and pushes it to `oci://ghcr.io/idddd/charts/agenteval`. This
ensures the OCI Chart and the Chart embedded in the image cannot diverge.

To run the published images instead of building locally, first copy the local
environment template as usual. If the GHCR packages are private, authenticate
Docker with a GitHub token that has `read:packages`, then start the image
override:

```powershell
Copy-Item .env.example .env
$env:CR_PAT | docker login ghcr.io -u <github-user> --password-stdin
docker compose -f docker-compose.yml -f docker-compose.images.yml up -d
```

Set `AGENTEVAL_IMAGE_TAG` to deploy a branch, release, or immutable SHA tag.
Forks and alternative registries can override `AGENTEVAL_IMAGE` with the
complete combined image name before running Compose.

## Helm Demo deployment

Install a released OCI Chart with a matching SemVer release:

```powershell
$version = "1.2.3"
helm upgrade --install agenteval `
  oci://ghcr.io/idddd/charts/agenteval `
  --version $version `
  --namespace agenteval `
  --create-namespace
```

The Chart creates one Deployment, one Service, one Secret, and one persistent
volume claim. It intentionally rejects more than one replica because every Pod
would otherwise have an independent embedded PostgreSQL database. For a local
cluster, open the Demo with:

```powershell
kubectl port-forward --namespace agenteval service/agenteval 18082:80
```

This topology is intended only for demonstrations. Application and database
upgrade together, and deleting the Docker volume or Kubernetes claim removes
both PostgreSQL and evaluation data. Copy or snapshot the volume before an
upgrade when Demo data matters. Override the built-in database credentials
through Helm values or an existing Secret before sharing the deployment.

## Local development

Prerequisites: Python 3.12+, Node.js 22+, npm, Docker Desktop, and a project
virtual environment.

Install dependencies once:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Set-Location web
npm ci
Set-Location ..
```

Start PostgreSQL, the API, and the TALI development server:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```

The script resolves paths from its own location, creates or reuses the local
`tasklattice-dev-postgres` container, applies database migrations, starts the
API on port `8000`, and runs TALI on port `18082`.

## TALI evaluation demo

The sidebar exposes the fixture-backed Evaluation demo through the unified
`Eval` entry at `/individual/evaluation/catalog`, with `Overview` available at
`/individual/evaluation/overview`. The catalog and its in-app links provide
access to the supporting Agent, Test Case, Evaluation, and Settings pages.
Opening a catalog target presents its revision, Dataset, Evaluation, and Result
in one continuous workspace with a single context-aware primary action. An
Admin approves all-passing evaluations or rejects evaluations with findings;
rejected Target revisions are returned to a Developer for changes and rerun.

This demo uses an in-memory store and deterministic simulation. Edits reset
when the page reloads. The API-backed evaluation store remains available for
the ongoing persistence integration, including the real SQLite API and demo
fallback behavior.

## CLI

IDs printed by each command are passed to the next command:

```powershell
.\.venv\Scripts\python.exe main.py agents list
.\.venv\Scripts\python.exe main.py agents import-legacy
.\.venv\Scripts\python.exe main.py datasets publish --dataset-id <dataset-id>
.\.venv\Scripts\python.exe main.py runs start --agent-revision-id <agent-revision-id> --dataset-revision-id <dataset-revision-id>
.\.venv\Scripts\python.exe main.py reports create --run-id <run-id>
.\.venv\Scripts\python.exe main.py reports compare --baseline <report-id> --current <report-id>
```

`main.py --step ...` remains temporarily for the original demo automation. It
prints a deprecation message and routes the work through the stable records.

## Optional Langfuse stack

```powershell
Copy-Item langfuse\.env.example langfuse\.env
docker compose -f langfuse\docker-compose.yml up -d
```

Langfuse is available at `http://localhost:3000`. Configure
`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST` in `.env` when
trace links should open in Langfuse.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_modular

Set-Location web
npm.cmd run build --workspace "@tasklattice/contracts"
node node_modules\typescript\bin\tsc -p apps\control\tsconfig.json --noEmit
npm.cmd test --workspace "@tasklattice/control"
npm.cmd run build:control
Set-Location ..

docker compose config
```

## Stopping services

```powershell
docker compose down
docker compose -f langfuse\docker-compose.yml down
```

Volumes are retained across `docker compose down`. Do not add `-v` unless you
intend to delete the local PostgreSQL and AgentEval data.
