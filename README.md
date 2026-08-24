# AgentEval

AgentEval is a local workbench for evaluating Agents against versioned test
cases. The TALI control console is the project's only Web UI; the Python code
provides the evaluation API, CLI, adapters, and SQLite persistence.

## Runtime architecture

| Service | Default address | Storage | Purpose |
| --- | --- | --- | --- |
| TALI Web | `http://127.0.0.1:18082` | PostgreSQL | Authentication, projects, and the control-console shell |
| AgentEval API | `http://127.0.0.1:8000` | `data/web-workbench.db` | Targets, datasets, runs, reports, and demo fixtures |
| AgentEval CLI | local process | `data/workbench.db` | Scripted evaluation and report workflows |

The TALI server reverse-proxies `/api/v1/evaluations/*` to the Python API.
PostgreSQL and the AgentEval SQLite databases have separate responsibilities
and should not be pointed at the same file or volume.

## Quick start with Docker

Prerequisites: Docker Desktop.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open `http://127.0.0.1:18082` and sign in with `admin` / `admin`. The API is
available at `http://127.0.0.1:8000/docs`.

Docker Compose starts PostgreSQL, the AgentEval FastAPI service, and the TALI
Web service. The Web container applies Prisma migrations before it starts.

## Published container images

GitHub Actions builds the API and Web services as separate OCI images and
publishes them to GitHub Container Registry:

- `ghcr.io/idddd/agenteval-api`
- `ghcr.io/idddd/agenteval-web`

Every pushed build receives an immutable `sha-<12-character-commit>` tag.
Branches under `codex/**` also receive a normalized branch tag, `main` receives
`latest`, and release tags such as `v1.2.3` publish both `1.2.3` and `v1.2.3`.
Pull requests build both images for validation but do not publish them.

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
Forks and alternative registries can override `AGENTEVAL_API_IMAGE` and
`AGENTEVAL_WEB_IMAGE` with complete image names before running Compose.

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
