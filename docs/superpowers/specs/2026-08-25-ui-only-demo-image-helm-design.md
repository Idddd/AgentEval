# TALI UI-Only Demo Image and Helm Chart Design

## Context

The current `ghcr.io/idddd/agenteval` Demo image contains PostgreSQL, the
Python evaluation API, the Node control server, application source, production
Node dependencies, and a Helm Chart. Its local image size is about 582 MB. The
product shown in the browser is now intentionally a UI Demo: the Build,
Guardrail, Evaluate, approval, Agent Garden, Instance, and Monitor workflows
are driven by deterministic frontend fixtures and in-memory stores.

The new artifact must package only that browser Demo and the components needed
to serve it. The existing three-persona application is the product in scope;
the nested `tasklattice-guard` application is a reference project and remains
excluded.

## Goals

- Publish a new UI-only image named `ghcr.io/idddd/tali-ui-demo`.
- Preserve the complete Admin, Agent Wizard, and Business User Demo experience.
- Keep local Demo login as `admin` / `admin` without a server or database.
- Serve a statically generated single-page application with an unprivileged
  Nginx runtime.
- Make every supported Demo route work when opened directly or refreshed.
- Keep mutable workflow state isolated to the current browser page lifetime so
  refreshing restores the predefined Demo fixtures.
- Put the packaged Chart at the exact in-image path
  `/opt/tali/helm/tali-UI-demo.tgz`.
- Publish the same Chart as
  `oci://ghcr.io/idddd/charts/tali-ui-demo:<version>`.
- Keep the final image at or below 120 MB and exclude backend runtimes,
  databases, source trees, and package-manager dependencies.

## Non-goals

- Real authentication, SSO, user management, or authorization enforcement.
- Persistent user-created data across page refreshes or browser sessions.
- A real Agent, MCP, model, evaluation, Guardrail, approval, or monitoring API.
- PostgreSQL, SQLite, Prisma, Python, Node, or a server-side JavaScript runtime
  in the final image.
- High availability, backend scaling, PVCs, Secrets, migrations, or database
  backup behavior.
- Preserving the previous all-in-one image architecture in the new artifact.
- Treating a Chart stored inside the image as an automatically installed Helm
  release.

## Product scope

The UI-only build retains the existing product pages and cross-role lifecycle:

1. Agent Wizard builds Agents and supporting MCP, Skill, and Knowledge Base
   resources.
2. Agent Wizard evaluates the exact build revision and submits a Release
   Candidate.
3. Admin reviews business evaluation evidence, can approve or reject regardless
   of the automated pass/fail recommendation, and records a rejection reason.
4. Approved revisions appear in Agent Garden.
5. Business User applies an Instance, uses it, and can stop it.
6. Admin sees the corresponding production-monitoring activity.
7. Admin-created Guardrails and Policy Library selections remain mapped to the
   correct evaluation template and are visible during evaluation.

The existing predefined Agents, Guardrails, policies, evaluation cases, and
monitoring events remain available for immediate demonstrations. User-created
items join those lists without a separate "default" category.

## Browser data architecture

### Build-time mode

The Web build receives `TALI_UI_DEMO=true`. That compile-time value selects a
typed Demo runtime adapter and enables TanStack Start SPA output. The same
source tree may retain production-oriented service implementations, but code
included in the UI-only build must not issue `/api/*` requests.

### Typed Demo runtime

A single frontend module owns the remaining shell-level operations:

- authentication configuration, local login, current user, and logout;
- the one predefined `individual` Demo project and its project-facing data;
- the local administrator profile;
- Agent Garden "try agent" responses when the feature is visible;
- evaluation-store selection.

Consumers call typed functions rather than calling `fetch` or installing a
global network interceptor. Production implementations may use HTTP, while the
UI Demo implementation returns cloned fixtures and deterministic responses.
An unsupported operation fails locally with a descriptive Demo-only error.

The existing evaluation and workflow stores remain the source of truth for
Build, Guardrail, evaluation, approval, Agent Garden, Instance, and Monitor
state. The UI-only build constructs the local evaluation store directly and
does not attempt best-effort API mirroring.

### Login and refresh semantics

- `admin` / `admin` produces a deterministic Demo token and administrator
  identity entirely in the browser.
- Incorrect credentials produce the current inline sign-in error.
- The token remains in `sessionStorage` unless "Keep me signed in" is selected,
  in which case the existing `localStorage` behavior is retained.
- Refreshing therefore keeps the user signed in, but all mutable product data,
  selected persona, timers, and newly created objects are reconstructed from
  the original fixtures.
- Logging out clears the token and returns to `/login` without a network call.
- SSO remains visibly unavailable in this Demo.

This separation lets a presenter refresh to reset the scenario without being
forced to sign in again.

## Static application runtime

The TanStack Start application is built in SPA mode. Only the emitted browser
assets and the prerendered application shell enter the runtime image. Nginx:

- listens as a non-root user on container port `8080`;
- serves fingerprinted static assets with long-lived immutable caching;
- serves HTML without immutable caching;
- returns a small HTTP 200 response at `/healthz`;
- falls back to the SPA shell for application paths such as
  `/individual/governance/guardrails` and
  `/individual/evaluation/catalog`;
- does not proxy or implement `/api` routes.

The Docker build fails if the expected SPA shell is absent.

## Final image contents

The Dockerfile uses separate, disposable build stages:

1. A Node builder installs workspace dependencies, runs tests/build checks as
   required by CI, and compiles the UI with `TALI_UI_DEMO=true`.
2. A Helm stage lints, renders, and packages the UI-only Chart.
3. The final unprivileged Nginx stage copies only the static Web output, Nginx
   configuration, OCI metadata, and the packaged Chart.

The final image must contain:

- the Nginx binary and its minimal runtime libraries;
- compiled HTML, CSS, JavaScript, fonts, and other static assets;
- `/opt/tali/helm/tali-UI-demo.tgz`.

It must not contain Node, npm/pnpm, Python, PostgreSQL, Prisma, application
source, `node_modules`, database files, or the nested reference project.

## Helm Chart

The source Chart lives at `deploy/helm/tali-ui-demo`. Helm metadata uses the
lowercase DNS-safe name `tali-ui-demo`. `helm package` normally creates a
versioned file such as `tali-ui-demo-0.2.0.tgz`; the build copies that exact
package to the fixed in-image alias `/opt/tali/helm/tali-UI-demo.tgz`.

The Chart renders only:

- one `Deployment` using `ghcr.io/idddd/tali-ui-demo`;
- one `Service` exposing service port `80` to container port `8080`;
- optional standard metadata and image pull secrets.

It has no database, API service, PVC, Secret, migration, init container, or
subchart dependency. The default replica count is one but can be increased
because all mutable state is browser-local. Readiness and liveness probes use
`/healthz`.

Storing the `.tgz` inside the image is a delivery convenience only. Kubernetes
does not inspect or install it when the container starts. The same original
versioned package is also pushed to the Helm OCI registry, which is the normal
installation source.

## Release and CI behavior

The artifact workflow is updated for the UI-only product:

- Pull requests lint and template the Chart, build the static application, and
  build the image without publishing.
- Branch pushes publish an immutable `sha-<12-character-commit>` tag and a
  normalized branch tag.
- `main` also publishes `latest`.
- exact `vMAJOR.MINOR.PATCH` Git tags publish both `MAJOR.MINOR.PATCH` and the
  original `vMAJOR.MINOR.PATCH` image tags.
- Chart `version`, `appVersion`, and default image tag are resolved from the
  same workflow metadata as the image.
- main and release builds push the versioned Chart package to
  `oci://ghcr.io/idddd/charts` under the Chart name `tali-ui-demo`.
- the image is built from the same Chart package that is pushed to OCI; its
  fixed in-image filename does not change the package metadata or bytes.

The old all-in-one artifact can remain in registry history, but new releases
and documentation point to `tali-ui-demo`.

## Error handling

- Invalid credentials remain on the login page with an inline error.
- Missing or invalid Demo tokens clear local credentials and return to login.
- Unknown typed Demo operations throw a clear, user-safe Demo limitation error.
- Direct route requests return the SPA shell instead of an Nginx 404.
- Missing static build output, unexpected real API calls, Chart lint failures,
  version mismatches, missing embedded Chart files, or image-size regressions
  fail CI rather than creating a partial release.

## Validation strategy

Tests are added before implementation and cover these contracts:

1. **Demo runtime unit tests** verify `admin` / `admin`, invalid credentials,
   administrator identity, project/profile fixtures, logout, and deterministic
   Agent Garden responses without calling `fetch`.
2. **Provider tests** verify the UI-only evaluation provider constructs a local
   store and never probes `/api/v1/evaluations`.
3. **Product workflow tests** preserve the existing three-persona lifecycle,
   Guardrail-to-evaluation mapping, approval/rejection independence from the
   automated result, Agent Garden publication, Instance stop, and Monitor
   activity.
4. **Static build tests** verify SPA mode, production output, and absence of
   references that require a live `/api` endpoint in the UI-only bundle.
5. **Nginx smoke tests** verify `/healthz`, the login page, static assets, and
   deep-link fallback from a running container.
6. **Chart tests** run `helm lint`, `helm template`, and `helm package`; assert
   one UI Deployment and Service; and assert no PVC, Secret, backend, or
   database workload.
7. **Image contract tests** assert the fixed Chart path, validate the embedded
   package, confirm the absence of Node/Python/PostgreSQL and `node_modules`,
   and enforce a maximum local image size of 120 MB.

## Acceptance criteria

- One local Docker build produces `ghcr.io/idddd/tali-ui-demo:<tag>`.
- A container exposes the full UI at port `8080` and becomes healthy through
  `/healthz` without any auxiliary container.
- `admin` / `admin` works with no API, database, or network access.
- Admin, Agent Wizard, and Business User can complete the intended Demo flow.
- Guardrails selected or created in the Demo appear as the correct evaluation
  templates.
- User-created workflow data survives navigation but disappears after refresh;
  the login session remains active.
- Directly opening supported nested routes succeeds.
- Browser use of supported Demo pages sends no `/api/*` requests.
- The final image contains `/opt/tali/helm/tali-UI-demo.tgz` and none of the
  excluded backend runtimes or dependencies.
- The local image size is no greater than 120 MB.
- The embedded Chart validates and is the same package published to
  `oci://ghcr.io/idddd/charts/tali-ui-demo:<version>`.
