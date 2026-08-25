# TALI UI-Only Demo Image and Helm Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the all-in-one runtime with a static, frontend-mock-only TALI Demo image that embeds and publishes a matching UI-only Helm Chart.

**Architecture:** Compile the existing TanStack Start application in SPA mode and select a typed in-browser Demo runtime at build time. Serve only the generated browser assets from an unprivileged Nginx container, with the packaged UI-only Helm Chart copied to a fixed path and published from the same bytes to GHCR OCI.

**Tech Stack:** React 19, TanStack Start SPA, Vite, Vitest, Nginx Alpine, Docker multi-stage builds, Helm 3, GitHub Actions, Pytest contract tests.

**Spec:** `docs/superpowers/specs/2026-08-25-ui-only-demo-image-helm-design.md`

## Global Constraints

- The final image is `ghcr.io/idddd/tali-ui-demo` and contains no Node, Python, PostgreSQL, Prisma, source tree, database, or `node_modules`.
- The final image exposes only unprivileged Nginx on port `8080` and responds at `/healthz`.
- The embedded Chart path is exactly `/opt/tali/helm/tali-UI-demo.tgz`.
- The OCI Chart name is `oci://ghcr.io/idddd/charts/tali-ui-demo:<version>`.
- `admin` / `admin` is browser-only; login survives refresh, but mutable Demo workflow data and selected persona reset to fixtures.
- Supported Demo pages send no `/api/*` requests.
- The complete Admin, Agent Wizard, and Business User workflow and Guardrail-to-evaluation mapping remain intact.
- The local Docker image size must not exceed 120 MB.

---

### Task 1: Typed browser Demo runtime

**Files:**
- Create: `web/apps/control/src/demo/ui-demo-runtime.ts`
- Create: `web/apps/control/src/demo/ui-demo-runtime.test.ts`
- Modify: `web/apps/control/src/components/auth/auth-provider.tsx`
- Modify: `web/apps/control/src/routes/login.tsx`
- Modify: `web/apps/control/src/services/project.ts`
- Modify: `web/apps/control/src/services/personal-profile.ts`
- Modify: `web/apps/control/src/components/agent-garden/try-demo-agent-sheet.tsx`
- Modify: `web/apps/control/src/lib/api.ts`
- Modify: `web/apps/control/src/features/evaluations/mock-provider.tsx`
- Modify: `web/apps/control/src/hooks/use-demo-role.tsx`
- Test: `web/apps/control/src/components/auth/auth-provider.test.tsx`
- Test: `web/apps/control/src/features/evaluations/mock-provider.test.tsx`
- Test: `web/apps/control/src/hooks/use-demo-role.test.tsx`

**Interfaces:**
- Produces: `isUiDemoBuild(): boolean`, `uiDemoRuntime.authConfig()`, `uiDemoRuntime.login(username, password)`, `uiDemoRuntime.currentUser(token)`, `uiDemoRuntime.projects`, `uiDemoRuntime.profile`, and `uiDemoRuntime.tryAgent(agentId, prompt)`.
- Consumes: existing `AuthConfig`, `AuthUser`, `Project`, `PersonalProfile`, evaluation fixtures, and browser token storage.

- [ ] **Step 1: Write failing runtime tests.**

```ts
it('signs in only with admin/admin without using fetch', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  await expect(uiDemoRuntime.login('admin', 'admin')).resolves.toEqual({ token: 'tali-ui-demo-admin' });
  await expect(uiDemoRuntime.login('admin', 'wrong')).rejects.toThrow('Sign in failed.');
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('returns cloned shell fixtures without using fetch', async () => {
  const projects = await uiDemoRuntime.listProjects();
  projects[0]!.name = 'changed';
  expect((await uiDemoRuntime.listProjects())[0]!.name).toBe('Demo Project');
});
```

- [ ] **Step 2: Run the focused tests and observe the missing-module failure.**

Run: `npm test --workspace @tasklattice/control -- src/demo/ui-demo-runtime.test.ts`

Expected: FAIL because `ui-demo-runtime.ts` does not exist.

- [ ] **Step 3: Implement the minimal typed runtime and route shell consumers through it in UI Demo mode.**

```ts
export function isUiDemoBuild(): boolean {
  return typeof __TALI_UI_DEMO__ !== 'undefined' && __TALI_UI_DEMO__;
}

export const uiDemoRuntime = {
  async login(username: string, password: string) {
    if (username !== 'admin' || password !== 'admin') throw new Error('Sign in failed.');
    return { token: 'tali-ui-demo-admin' };
  },
  async currentUser(token: string) {
    if (token !== 'tali-ui-demo-admin') throw new Error('Your session is no longer valid.');
    return { id: 'demo-admin', username: 'admin', displayName: 'Local Administrator', email: 'admin@demo.local', provider: 'local', systemRole: 'super_administrator' };
  },
};
```

In UI Demo mode, `AuthProvider`, login, project/profile services, and Agent Garden try-out call this adapter; the evaluation provider creates the local store directly. The generic API helper throws `ApiError('This feature is not available in the UI Demo.', 501)` before network access. `DemoRoleProvider` initializes to Admin and stores no persona in browser storage.

- [ ] **Step 4: Add provider behavior tests and run the focused suite.**

Run: `npm test --workspace @tasklattice/control -- src/demo/ui-demo-runtime.test.ts src/components/auth/auth-provider.test.tsx src/features/evaluations/mock-provider.test.tsx src/hooks/use-demo-role.test.tsx`

Expected: PASS and no test observes an `/api/*` request in UI Demo mode.

- [ ] **Step 5: Run all control tests and type checking.**

Run: `npm test --workspace @tasklattice/control`

Run: `npm run typecheck --workspace @tasklattice/control`

Expected: PASS.

### Task 2: SPA build and minimal Nginx runtime

**Files:**
- Modify: `web/apps/control/vite.config.ts`
- Modify: `web/apps/control/src/vite-env.d.ts`
- Create: `deploy/ui-demo/nginx.conf`
- Replace: `Dockerfile`
- Modify: `.dockerignore`
- Create: `tests/test_ui_demo_deployment.py`
- Remove: `tests/test_all_in_one_deployment.py`

**Interfaces:**
- Consumes: `TALI_UI_DEMO=true`, Web workspace lockfile, control application source, packaged Chart stage.
- Produces: `/usr/share/nginx/html/_shell/index.html`, Nginx port `8080`, `/healthz`, and SPA fallback.

- [ ] **Step 1: Replace the old deployment contract tests with failing UI-only contracts.**

```py
def test_dockerfile_has_static_nginx_runtime() -> None:
    dockerfile = (ROOT / 'Dockerfile').read_text(encoding='utf-8')
    assert 'AS ui-build' in dockerfile
    assert 'TALI_UI_DEMO=true' in dockerfile
    assert 'FROM nginx' in dockerfile
    assert 'FROM postgres' not in dockerfile
    assert 'requirements.txt' not in dockerfile

def test_nginx_supports_health_and_spa_fallback() -> None:
    config = (ROOT / 'deploy/ui-demo/nginx.conf').read_text(encoding='utf-8')
    assert 'listen 8080' in config
    assert 'location = /healthz' in config
    assert 'try_files $uri $uri/ /_shell/index.html' in config
```

- [ ] **Step 2: Run the contract tests and observe failures against the all-in-one image.**

Run: `pytest tests/test_ui_demo_deployment.py -q`

Expected: FAIL because the runtime is PostgreSQL and the Nginx config is absent.

- [ ] **Step 3: Enable compile-time SPA mode.**

```ts
const uiDemo = process.env.TALI_UI_DEMO === 'true';

export default defineConfig({
  define: { __TALI_UI_DEMO__: JSON.stringify(uiDemo) },
  plugins: [
    nitro({ serverDir: 'server', features: { websocket: true } }),
    tailwindcss(),
    tanstackStart({ spa: uiDemo ? { enabled: true } : undefined }),
    react(),
  ],
});
```

- [ ] **Step 4: Add unprivileged Nginx configuration and replace the Dockerfile with UI build, Chart, and static runtime stages.**

The final stage copies only `.output/public`, the Nginx configuration, and `/packages/tali-ui-demo-*.tgz` renamed to `/opt/tali/helm/tali-UI-demo.tgz`. It runs as the Nginx user, exposes `8080`, and uses `/healthz` for `HEALTHCHECK`.

- [ ] **Step 5: Build the SPA locally and run the deployment contracts.**

Run: `$env:TALI_UI_DEMO='true'; npm run build:control; Remove-Item Env:TALI_UI_DEMO`

Expected: PASS and `web/apps/control/.output/public/_shell/index.html` exists.

Run: `pytest tests/test_ui_demo_deployment.py -q`

Expected: PASS.

### Task 3: UI-only Helm Chart and local Compose

**Files:**
- Create: `deploy/helm/tali-ui-demo/Chart.yaml`
- Create: `deploy/helm/tali-ui-demo/values.yaml`
- Create: `deploy/helm/tali-ui-demo/templates/_helpers.tpl`
- Create: `deploy/helm/tali-ui-demo/templates/deployment.yaml`
- Create: `deploy/helm/tali-ui-demo/templates/service.yaml`
- Create: `deploy/helm/tali-ui-demo/templates/NOTES.txt`
- Replace: `docker-compose.yml`
- Modify: `docker-compose.images.yml`
- Test: `tests/test_ui_demo_deployment.py`

**Interfaces:**
- Produces: one `Deployment`, one `Service`, configurable replicas/image/service/resources, and `/healthz` probes.
- Consumes: `ghcr.io/idddd/tali-ui-demo:<tag>` on container port `8080`.

- [ ] **Step 1: Add failing rendered-resource tests.**

```py
def test_chart_renders_only_ui_deployment_and_service() -> None:
    resources = render_chart()
    assert [item['kind'] for item in resources] == ['Service', 'Deployment']
    container = next(item for item in resources if item['kind'] == 'Deployment')['spec']['template']['spec']['containers'][0]
    assert container['ports'][0]['containerPort'] == 8080
    assert container['readinessProbe']['httpGet']['path'] == '/healthz'
```

- [ ] **Step 2: Run the Chart tests and observe the missing-Chart failure.**

Run: `pytest tests/test_ui_demo_deployment.py -q`

Expected: FAIL because `deploy/helm/tali-ui-demo` does not exist.

- [ ] **Step 3: Implement the minimal Chart and one-service Compose model.**

Compose names the service `tali-ui-demo`, maps `127.0.0.1:18082:8080`, has no volume or database environment, and probes `http://127.0.0.1:8080/healthz`. The image override uses `TALI_UI_DEMO_IMAGE` and `TALI_UI_DEMO_IMAGE_TAG`.

- [ ] **Step 4: Validate Compose and Chart behavior.**

Run: `docker compose config`

Run: `helm lint deploy/helm/tali-ui-demo`

Run: `helm template tali-ui-demo deploy/helm/tali-ui-demo`

Expected: one service, one Deployment, one Service, and no PVC/Secret/backend resources.

### Task 4: UI-only artifact workflow and documentation

**Files:**
- Replace: `.github/workflows/container-images.yml`
- Modify: `README.md`
- Test: `tests/test_ui_demo_deployment.py`

**Interfaces:**
- Consumes: Git ref metadata, `GITHUB_TOKEN`, root Dockerfile, UI-only Chart.
- Produces: `ghcr.io/idddd/tali-ui-demo` tags, embedded fixed Chart, and `oci://ghcr.io/idddd/charts/tali-ui-demo` packages.

- [ ] **Step 1: Add failing workflow artifact-parity tests.**

```py
def test_workflow_publishes_ui_image_and_same_embedded_chart() -> None:
    workflow = yaml.safe_load((ROOT / '.github/workflows/container-images.yml').read_text())
    serialized = yaml.safe_dump(workflow['jobs'])
    assert 'tali-ui-demo' in serialized
    assert '/opt/tali/helm/tali-UI-demo.tgz' in serialized
    assert 'helm push' in serialized
    assert 'agenteval' not in serialized.lower()
```

- [ ] **Step 2: Run the workflow contract and observe failure against the old artifact names and paths.**

Run: `pytest tests/test_ui_demo_deployment.py -q`

Expected: FAIL with old `agenteval` image and `/opt/agenteval/helm` path.

- [ ] **Step 3: Update metadata, extraction, Chart validation, and OCI publication.**

The workflow computes immutable, branch, main, and semantic-version tags for `tali-ui-demo`, builds the image, extracts `/opt/tali/helm/tali-UI-demo.tgz`, validates it, and pushes that extracted package to `oci://ghcr.io/${owner}/charts` on main and release tags.

- [ ] **Step 4: Document what the embedded Chart is, how to extract it, and how to install the OCI Chart.**

The README states that the in-image `.tgz` is inert until extracted and passed to Helm, while the OCI Chart is directly installable with `helm install ... oci://... --version ...`.

- [ ] **Step 5: Run workflow YAML, contract, and whitespace checks.**

Run: `pytest tests/test_ui_demo_deployment.py -q`

Run: `git diff --check`

Expected: PASS.

### Task 5: Build, runtime smoke test, and size/content gate

**Files:**
- Verify: all files above
- Modify: `Dockerfile`, `deploy/ui-demo/nginx.conf`, Chart values/templates, workflow only when the runtime gates expose a concrete defect

**Interfaces:**
- Produces: locally verified `ghcr.io/idddd/tali-ui-demo:<version>` and matching Chart package.

- [ ] **Step 1: Run the complete automated test and typecheck suite.**

Run: `npm test --workspace @tasklattice/control`

Run: `npm run typecheck --workspace @tasklattice/control`

Run: `pytest tests/test_ui_demo_deployment.py -q`

Expected: PASS.

- [ ] **Step 2: Build the final image with release metadata.**

Run: `docker build --build-arg TALI_UI_DEMO_CHART_VERSION=0.2.0 --build-arg TALI_UI_DEMO_IMAGE_TAG=0.2.0 -t ghcr.io/idddd/tali-ui-demo:0.2.0 .`

Expected: PASS.

- [ ] **Step 3: Inspect runtime contents and size.**

Run: `docker image inspect ghcr.io/idddd/tali-ui-demo:0.2.0`

Run: `docker run --rm ghcr.io/idddd/tali-ui-demo:0.2.0 sh -c "test -f /opt/tali/helm/tali-UI-demo.tgz && ! command -v node && ! command -v python && ! command -v postgres"`

Expected: image size at or below 120 MB and command exits 0.

- [ ] **Step 4: Run and smoke-test the container.**

Run: `docker run -d --name tali-ui-demo-smoke -p 18082:8080 ghcr.io/idddd/tali-ui-demo:0.2.0`

Run: request `/healthz`, `/login`, `/individual/governance/guardrails`, and `/individual/evaluation/catalog`.

Expected: all return HTTP 200 and nested routes serve the SPA shell.

- [ ] **Step 5: Extract and validate the embedded Chart.**

Run: copy `/opt/tali/helm/tali-UI-demo.tgz` from a temporary container, then run `helm lint` and `helm template` on the extracted package.

Expected: PASS; rendered output contains exactly one Service and one Deployment.

- [ ] **Step 6: Commit the implementation and publish only after verification.**

Run: `git diff --check`, review status, commit the tested changes, push the feature branch, then publish the new version/tag image and OCI Chart through the configured workflow or local registry login.

Expected: remote branch points to the verified commit; published image and Chart resolve at their documented names.
