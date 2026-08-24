# AgentEval All-in-One Demo Image and Helm Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build one AgentEval Demo image that runs PostgreSQL, the Python API, and the Web UI and contains the matching Helm Chart source and package.

**Architecture:** A multi-stage Dockerfile combines Python 3.12, Node 22, the compiled Web application, and PostgreSQL 17. Tini starts a Bash supervisor that initializes the database, renders configuration, runs migrations, and starts API and Web in dependency order. A dependency-free Helm Chart deploys one Pod, and CI publishes the single image plus the Chart package extracted from that image.

**Tech Stack:** Docker BuildKit, PostgreSQL 17, Python 3.12, FastAPI/Uvicorn, Node.js 22, Bash, Helm 3, Docker Compose, GitHub Actions, GHCR, pytest.

**Spec:** docs/superpowers/specs/2026-08-24-all-in-one-image-helm-demo-design.md

## Global Constraints

- Only the three-role AgentEval product is in scope; tasklattice-guard is excluded.
- The only application image is ghcr.io/idddd/agenteval.
- PostgreSQL, API, and Web run in one container.
- Web port 8080 is public; API 8000 and PostgreSQL 5432 use loopback.
- Mutable files live below /var/lib/agenteval.
- Rendered Chart source and its tgz live below /opt/agenteval/helm.
- Helm deploys one replica with Recreate and one persistent volume.
- Pull requests validate without publishing.
- Main and SemVer release tags publish the Chart to the GHCR charts namespace.

---

### Task 1: Add failing deployment contract tests

**Files:**
- Create: tests/test_all_in_one_deployment.py
- Test: tests/test_all_in_one_deployment.py

**Interfaces:**
- Consumes: repository Docker, Compose, Helm, and workflow files.
- Produces: the executable packaging contract for Tasks 3 through 5.

- [ ] **Step 1: Write the failing contract**

    import json
    import os
    import subprocess
    from pathlib import Path
    import yaml

    ROOT = Path(__file__).resolve().parents[1]

    def run(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            args,
            cwd=ROOT,
            env={**os.environ, **(env or {})},
            text=True,
            capture_output=True,
            check=False,
        )

    def test_compose_renders_one_service() -> None:
        result = run("docker", "compose", "config", "--format", "json")
        assert result.returncode == 0, result.stderr
        compose = json.loads(result.stdout)
        assert list(compose["services"]) == ["agenteval"]
        service = compose["services"]["agenteval"]
        assert service["ports"][0]["published"] == "18082"
        assert service["ports"][0]["target"] == 8080
        assert list(compose["volumes"]) == ["agenteval-data"]

    def test_chart_renders_one_recreate_deployment() -> None:
        result = run(
            "docker", "run", "--rm",
            "-v", f"{ROOT.as_posix()}:/workspace",
            "alpine/helm:3.18.4", "template", "agenteval",
            "/workspace/deploy/helm/agenteval",
        )
        assert result.returncode == 0, result.stderr
        resources = [item for item in yaml.safe_load_all(result.stdout) if item]
        deployments = [item for item in resources if item["kind"] == "Deployment"]
        assert len(deployments) == 1
        assert deployments[0]["spec"]["replicas"] == 1
        assert deployments[0]["spec"]["strategy"]["type"] == "Recreate"
        assert len(deployments[0]["spec"]["template"]["spec"]["containers"]) == 1

    def test_workflow_contract() -> None:
        workflow = yaml.safe_load(
            (ROOT / ".github/workflows/container-images.yml").read_text(encoding="utf-8")
        )
        jobs = workflow["jobs"]
        assert list(jobs) == ["build"]
        serialized = yaml.safe_dump(jobs)
        assert serialized.count("docker/build-push-action") == 1
        assert "helm push" in serialized
        assert "agenteval-api" not in serialized
        assert "agenteval-web" not in serialized

- [ ] **Step 2: Verify the red state**

    .\.venv\Scripts\python.exe -m pytest tests\test_all_in_one_deployment.py -q

Expected: Compose renders three services, Helm cannot load the missing AgentEval
Chart, and the workflow has not yet defined the single-image plus OCI behavior.

- [ ] **Step 3: Commit the red test**

    git add tests/test_all_in_one_deployment.py
    git commit -m "test: define all-in-one deployment contract"

---

### Task 2: Render the loopback control configuration

**Files:**
- Create: deploy/__init__.py
- Create: deploy/runtime/__init__.py
- Create: deploy/runtime/render_control_config.py
- Create: tests/test_render_control_config.py
- Test: tests/test_render_control_config.py

**Interfaces:**
- Consumes: Mapping[str, str] environment values.
- Produces: database_url(env) -> str, render_control_config(env) -> str, and a CLI writing TASKLATTICE_CONFIG.

- [ ] **Step 1: Write failing renderer tests**

    from deploy.runtime.render_control_config import database_url, render_control_config

    def test_database_url_defaults_to_loopback() -> None:
        assert database_url({}) == (
            "postgresql://tasklattice:development@127.0.0.1:5432/tasklattice"
        )

    def test_database_url_escapes_credentials() -> None:
        env = {
            "POSTGRES_USER": "demo user",
            "POSTGRES_PASSWORD": "p@ss/word",
            "POSTGRES_DB": "agent eval",
        }
        assert database_url(env) == (
            "postgresql://demo%20user:p%40ss%2Fword@127.0.0.1:5432/agent%20eval"
        )

    def test_rendered_config_has_required_sections() -> None:
        text = render_control_config({"TASKLATTICE_PUBLIC_URL": "http://demo.local"})
        assert 'public_url = "http://demo.local"' in text
        assert "[database]" in text
        assert "[auth.local]" in text
        assert "[runner]" in text
        assert "[litellm]" in text

- [ ] **Step 2: Verify import failure**

    .\.venv\Scripts\python.exe -m pytest tests\test_render_control_config.py -q

Expected: collection fails because deploy.runtime.render_control_config is absent.

- [ ] **Step 3: Implement the renderer**

Use urllib.parse.quote(value, safe="") for PostgreSQL user, password, and
database; json.dumps(value, ensure_ascii=False) for TOML strings; and these
defaults:

    POSTGRES_USER=tasklattice
    POSTGRES_PASSWORD=development
    POSTGRES_DB=tasklattice
    TASKLATTICE_PUBLIC_URL=http://127.0.0.1:18082
    TASKLATTICE_ADMIN_USERNAME=admin
    TASKLATTICE_SESSION_SIGNING_KEY=tasklattice-local-development-secret

render_control_config emits schema_version 1 plus server, database, auth,
auth.local, disabled auth.oidc, runner, litellm, and disabled smtp sections.
main writes UTF-8 to TASKLATTICE_CONFIG or /run/agenteval/control.toml.

- [ ] **Step 4: Verify green**

    .\.venv\Scripts\python.exe -m pytest tests\test_render_control_config.py -q
    .\.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_all_in_one

Expected: focused and full Python suites pass.

- [ ] **Step 5: Commit**

    git add deploy tests/test_render_control_config.py
    git commit -m "feat: render embedded demo control config"

---

### Task 3: Assemble and supervise the combined runtime

**Files:**
- Create: deploy/runtime/entrypoint.sh
- Create: deploy/runtime/healthcheck.sh
- Modify: Dockerfile
- Modify: docker-compose.yml
- Modify: docker-compose.images.yml
- Test: tests/test_all_in_one_deployment.py

**Interfaces:**
- Consumes: Task 2 renderer, existing API and Web sources, POSTGRES and TASKLATTICE variables.
- Produces: one container listening on 8080 with loopback API and database.

- [ ] **Step 1: Implement the supervisor**

entrypoint.sh uses strict Bash mode and tracks postgres_pid, api_pid, and
web_pid. A shutdown trap terminates Web, API, then PostgreSQL and waits. Startup
is exactly:

    create and chown PGDATA, SQLite parent, and /run/agenteval
    start /usr/local/bin/docker-entrypoint.sh postgres in background
    poll pg_isready for at most 60 seconds
    run render_control_config.py
    run Prisma migration as postgres
    start Uvicorn at 127.0.0.1:8000 as postgres
    poll API /healthz for at most 60 seconds
    start Node Web at 0.0.0.0:8080 as postgres
    wait -n for any child and terminate the rest with the failed status

healthcheck.sh runs pg_isready and Python urllib checks for /healthz and
/api/health.

- [ ] **Step 2: Replace Dockerfile with the combined stages**

Stages are api, web-dependencies, web-build, web-production-dependencies,
chart, and runtime. Runtime begins with postgres:17-bookworm, installs tini,
copies Python /usr/local, Node executable and npm runtime, pruned Web
dependencies, compiled Web, API source, runtime scripts, and Chart artifacts.

Runtime environment is:

    NODE_ENV=production
    HOST=0.0.0.0
    PORT=8080
    EVAL_API_URL=http://127.0.0.1:8000
    TASKLATTICE_CONFIG=/run/agenteval/control.toml
    PGDATA=/var/lib/agenteval/postgres
    WORKBENCH_WEB_DB=/var/lib/agenteval/evaluation/web-workbench.db

Use the combined health check, expose only 8080, and set:

    ENTRYPOINT ["/usr/bin/tini", "--", "/opt/agenteval/runtime/entrypoint.sh"]

- [ ] **Step 3: Collapse Compose**

docker-compose.yml contains one agenteval service, root build, port
127.0.0.1:18082:8080, Demo database environment, 30-second stop grace period,
and agenteval-data mounted at /var/lib/agenteval.

docker-compose.images.yml contains one agenteval override using environment
variables AGENTEVAL_IMAGE and AGENTEVAL_IMAGE_TAG, defaulting to
ghcr.io/idddd/agenteval and latest.

- [ ] **Step 4: Verify runtime contracts and Compose**

    .\.venv\Scripts\python.exe -m pytest tests\test_all_in_one_deployment.py -q
    docker compose config
    docker compose -f docker-compose.yml -f docker-compose.images.yml config

Expected: runtime and Compose assertions pass. Chart assertions remain red
until Task 4.

- [ ] **Step 5: Commit**

    git add Dockerfile deploy/runtime docker-compose.yml docker-compose.images.yml
    git commit -m "feat: run AgentEval as one demo container"

---

### Task 4: Add and embed the one-Pod Helm Chart

**Files:**
- Create: deploy/helm/agenteval/Chart.yaml
- Create: deploy/helm/agenteval/values.yaml
- Create: deploy/helm/agenteval/templates/_helpers.tpl
- Create: deploy/helm/agenteval/templates/deployment.yaml
- Create: deploy/helm/agenteval/templates/service.yaml
- Create: deploy/helm/agenteval/templates/pvc.yaml
- Create: deploy/helm/agenteval/templates/secret.yaml
- Create: deploy/helm/agenteval/templates/NOTES.txt
- Modify: Dockerfile
- Test: tests/test_all_in_one_deployment.py

**Interfaces:**
- Consumes: Task 3 image and storage contract.
- Produces: dependency-free Chart source and one packaged Chart in the image.

- [ ] **Step 1: Create metadata and values**

Chart metadata is v2 application, name agenteval, version 0.1.0-dev,
appVersion dev, kubeVersion >=1.29.0-0. Values define replicaCount 1,
ghcr.io/idddd/agenteval:dev, ClusterIP port 80, a 5Gi PVC, generated or
existing Demo credential Secret, public URL, resources, extra environment,
image pull secrets, and name overrides.

- [ ] **Step 2: Create templates**

deployment.yaml begins:

    {{- if ne (int .Values.replicaCount) 1 }}
    {{- fail "replicaCount must be 1 for the embedded PostgreSQL Demo topology" }}
    {{- end }}

It renders one Deployment, Recreate, one container, one HTTP port,
Secret-backed POSTGRES variables, /var/lib/agenteval mount, and startup,
readiness, and liveness probes on /api/health. The PVC and Secret honor their
existing-resource settings. Service exposes only HTTP.

- [ ] **Step 3: Package the rendered Chart during Docker build**

Use alpine/helm:3.18.4 with build arguments AGENTEVAL_CHART_VERSION,
AGENTEVAL_IMAGE_REPOSITORY, and AGENTEVAL_IMAGE_TAG. Copy the source Chart,
replace version, appVersion, repository, and tag, run helm lint, and package to
/packages. Copy rendered source to /opt/agenteval/helm/agenteval and packages
to /opt/agenteval/helm/packages in runtime.

- [ ] **Step 4: Verify Chart and contract**

    helm lint deploy/helm/agenteval
    helm template agenteval deploy/helm/agenteval --namespace agenteval
    helm package deploy/helm/agenteval --destination .artifacts/helm
    .\.venv\Scripts\python.exe -m pytest tests\test_all_in_one_deployment.py -q

Expected: Helm exits zero, one Deployment renders, one package is created, and
all contract tests pass.

- [ ] **Step 5: Commit**

    git add Dockerfile deploy/helm/agenteval tests/test_all_in_one_deployment.py
    git commit -m "feat: embed one-pod AgentEval Helm chart"

---

### Task 5: Publish the single image and OCI Chart

**Files:**
- Modify: .github/workflows/container-images.yml
- Modify: README.md
- Test: tests/test_all_in_one_deployment.py

**Interfaces:**
- Consumes: Task 4 image and embedded package.
- Produces: ghcr.io/idddd/agenteval image tags and ghcr.io/idddd/charts/agenteval Chart versions.

- [ ] **Step 1: Replace the matrix workflow**

Metadata outputs one image, tags, chart_version, and immutable_tag.
Immutable tag is sha plus 12 commit characters. Release Chart version is the
SemVer tag without v. Main Chart version is 0.1.0-main plus run number. Other
builds use 0.1.0-dev plus run number. Buildx receives the Chart version,
repository, and immutable image tag. Pull requests load locally; other events
push.

- [ ] **Step 2: Extract the embedded package**

Pull pushed images when necessary. Create a temporary container from the
immutable tag, copy /opt/agenteval/helm to .artifacts/helm, remove the
container, lint the copied source, template the copied tgz, and require exactly
one tgz.

- [ ] **Step 3: Push Chart on main and release tags**

Log Helm into GHCR and push the extracted tgz to the lowercase repository
owner charts namespace. The step runs only for main or release tags, never pull
requests or feature branches.

- [ ] **Step 4: Update README**

Document the single image, embedded Chart paths, Compose command, OCI Helm
install, image variables, Demo credentials, immutable tags, and data loss when
the single volume is removed. Remove the separate API/Web image instructions.

- [ ] **Step 5: Verify workflow and tests**

    .\.venv\Scripts\python.exe -m pytest tests\test_all_in_one_deployment.py -q
    .\.venv\Scripts\python.exe -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('.github/workflows/container-images.yml').read_text())"

Expected: tests pass and workflow YAML parses.

- [ ] **Step 6: Commit**

    git add .github/workflows/container-images.yml README.md tests/test_all_in_one_deployment.py
    git commit -m "ci: publish single image and embedded Helm chart"

---

### Task 6: Full build and runtime verification

**Files:**
- Test: all Python, Web, Docker, Compose, Helm, and runtime surfaces.

**Interfaces:**
- Consumes: Tasks 1 through 5.
- Produces: a verified branch ready to push.

- [ ] **Step 1: Run source tests and builds**

    .\.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest_tmp_all_in_one
    Set-Location web
    npm.cmd run build --workspace "@tasklattice/contracts"
    node node_modules\typescript\bin\tsc -p apps\control\tsconfig.json --noEmit
    npm.cmd test --workspace "@tasklattice/control"
    npm.cmd run build:control
    Set-Location ..

Expected: every command exits zero and both suites report zero failures.

- [ ] **Step 2: Validate Compose and Helm**

    docker compose config
    docker compose -f docker-compose.yml -f docker-compose.images.yml config
    helm lint deploy/helm/agenteval
    helm template agenteval deploy/helm/agenteval --namespace agenteval

Expected: zero errors and one application Deployment.

- [ ] **Step 3: Build the image**

    docker build --build-arg AGENTEVAL_CHART_VERSION=0.1.0-local.1 --build-arg AGENTEVAL_IMAGE_TAG=local-test -t agenteval:all-in-one-test .

Expected: build exits zero.

- [ ] **Step 4: Smoke test**

Run a uniquely named container and volume on host port 18083. Wait up to 180
seconds for healthy, then verify Web /api/health is HTTP 200, API /healthz
works inside, pg_isready succeeds, Chart.yaml exists, and exactly one AgentEval
tgz exists below /opt/agenteval/helm/packages.

- [ ] **Step 5: Verify persistence**

Create a marker row through psql, restart with the same unique volume, wait for
health, and assert the row remains. Remove only the unique smoke container and
volume after collecting evidence.

- [ ] **Step 6: Inspect repository state**

    git diff --check origin/main...HEAD
    git status --short
    git log --oneline origin/main..HEAD

Expected: no whitespace errors, no uncommitted product changes, and no
tasklattice-guard changes.

- [ ] **Step 7: Push branch**

    git push -u origin codex/all-in-one-image-helm-demo

Expected: remote branch equals local HEAD.
