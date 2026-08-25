# AgentEval

AgentEval is a local workbench for evaluating Agents against versioned test
cases. Its deployable Demo artifact is the TALI control console running as a
static, browser-mocked application. The Python code remains available for
local development and CLI workflows, but is not included in the UI Demo image.

## Runtime architecture

| Runtime | Default address | Storage | Purpose |
| --- | --- | --- | --- |
| TALI UI Demo container | `http://127.0.0.1:18082` | Browser memory | Three-role Build, Guardrail, Eval, approval, Agent Garden, Instance, and Monitor Demo |
| AgentEval CLI | local process | `data/workbench.db` | Scripted evaluation and report workflows |

The container runs only unprivileged Nginx and compiled HTML, CSS, JavaScript,
fonts, and images. It has no Node, Python, PostgreSQL, Prisma, API, source tree,
or `node_modules`. `admin` / `admin` is validated in the browser. A refresh
keeps the login session but resets mutable workflow data and the selected role
to the initial Demo fixtures.

## Quick start with Docker

Prerequisite: Docker Desktop.

```powershell
docker compose up --build
```

Open `http://127.0.0.1:18082` and sign in with `admin` / `admin`. Docker Compose
starts one stateless UI container; no auxiliary service or volume is required.

## Published container images

GitHub Actions builds and publishes one UI-only OCI image:

- `ghcr.io/idddd/tali-ui-demo`

Every pushed build receives an immutable `sha-<12-character-commit>` tag.
Branches under `codex/**` also receive a normalized branch tag, `main` receives
`latest`, and release tags such as `v1.2.3` publish both `1.2.3` and `v1.2.3`.
Pull requests build the image for validation but do not publish it.

The same image contains the release's packaged Helm Chart at:

- `/opt/tali/helm/tali-UI-demo.tgz`

For `main` and SemVer release tags, CI extracts that exact package from the
published image and pushes it to `oci://ghcr.io/idddd/charts/tali-ui-demo`. This
ensures the OCI Chart and the Chart embedded in the image cannot diverge.

The Chart file inside the image is inert: Docker and Kubernetes do not install
it when the container starts. It is included so the image is a self-contained
Demo delivery bundle. To inspect or hand it to another system, copy it out:

```powershell
$container = docker create ghcr.io/idddd/tali-ui-demo:latest
docker cp "${container}:/opt/tali/helm/tali-UI-demo.tgz" .\tali-UI-demo.tgz
docker rm $container
```

To run the published image instead of building locally, authenticate Docker if
the GHCR package is private, then start the image override:

```powershell
$env:CR_PAT | docker login ghcr.io -u <github-user> --password-stdin
docker compose -f docker-compose.yml -f docker-compose.images.yml up -d
```

Set `TALI_UI_DEMO_IMAGE_TAG` to deploy a branch, release, or immutable SHA tag.
Forks and alternative registries can override `TALI_UI_DEMO_IMAGE` with the
complete combined image name before running Compose.

## Helm Demo deployment

Install a released OCI Chart with a matching SemVer release:

```powershell
$version = "0.2.0"
helm upgrade --install tali-ui-demo `
  oci://ghcr.io/idddd/charts/tali-ui-demo `
  --version $version `
  --namespace tali-ui-demo `
  --create-namespace
```

The Chart creates one Deployment and one Service. It creates no API, database,
Secret, or persistent volume. Replicas may be increased because product state
lives in each user's browser. For a local cluster, open the Demo with:

```powershell
kubectl port-forward --namespace tali-ui-demo service/tali-ui-demo 18082:80
```

During packaging, a disposable Node stage compiles the SPA, a disposable Helm
stage validates and packages the Chart, and the final stage copies only the
browser assets and Chart into a small Nginx image. The Node and Helm build tools
do not enter the final image.

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

This Demo uses in-memory stores and deterministic simulation. Edits reset when
the page reloads, while the browser login remains active. The UI-only build
constructs the local evaluation store directly and never probes a backend.

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

The UI Demo Compose service has no volume. The optional Langfuse stack manages
its own data separately.
