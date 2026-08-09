# Image Release and Helm Deployment

## Image Inventory

TaskLattice publishes **five first-party images**:

| Image | Build entry point | Purpose | Published architectures |
| --- | --- | --- | --- |
| `tasklattice-control` | `infra/docker/Dockerfile`, target `control` | Web UI, REST/WebSocket API, and PostgreSQL control data | amd64, arm64 |
| `tasklattice-openshell-runner` | `infra/docker/Dockerfile`, target `runner` | Invokes OpenShell to create, observe, connect to, and destroy Sandboxes | amd64, arm64 |
| `tasklattice-litellm` | `infra/docker/Dockerfile.litellm` | Model gateway, virtual keys, and cost attribution | amd64, arm64 |
| `tasklattice-nemoclaw-sandbox` | `scripts/build-nemoclaw-sandbox.sh` (`openclaw`) + `Dockerfile.nemoclaw-openclaw` | Dynamic Sandbox for the OpenClaw Agent | amd64, arm64 |
| `tasklattice-nemoclaw-hermes-sandbox` | The same script (`hermes`) + `Dockerfile.nemoclaw-hermes` | Dynamic Sandbox for the Hermes Agent | amd64, arm64 |

A complete deployment also pulls **four pinned third-party images**: PostgreSQL,
the OpenShell gateway, the OpenShell supervisor, and the Agent Sandbox
controller. The full system therefore uses **nine unique images** when at least
one OpenClaw Instance and one Hermes Instance are running. The two Agent images
and the supervisor do not create long-lived Pods immediately after installation
and before an Agent Instance is created, but the runner already retains their
released image references.

## Build Relationships

`control` and `runner` share the Node 22 dependency and TypeScript compilation
stages. The runner also downloads a pinned OpenShell CLI release. LiteLLM uses a
pinned database variant and runs UI initialization and Prisma generation in
advance so that its runtime container can remain non-root.

Both Agent images are built from pinned NemoClaw commits and then passed through
their respective thin, repository-owned wrapper layers to produce the final
published images. OpenClaw applies the repository's no-proxy patch before the
upstream build, while `Dockerfile.nemoclaw-openclaw` provides the customization
boundary for future TaskLattice changes. If the upstream Hermes image cannot be
pulled anonymously, the Hermes build first creates its pinned base fallback and
then uses `Dockerfile.nemoclaw-hermes` to align the UID/GID with OpenShell's
requirements and add the configuration bootstrap. The release workflow builds
both pipelines independently for amd64 and arm64, then combines them into
multi-architecture manifests.

Every Agent build pipeline follows the same layering convention:

```text
pinned upstream source + pinned base digest
  -> tasklattice-nemoclaw-<agent>-upstream:<revision> (build-time only)
  -> infra/docker/Dockerfile.nemoclaw-<agent>
  -> ghcr.io/<owner>/tasklattice-nemoclaw-<agent>-sandbox:<release>
```

The upstream Dockerfiles are not copied into this repository, which prevents
them from drifting away from the pinned NemoClaw revisions. TaskLattice-owned
startup scripts, configuration bootstraps, identity adaptations, and runtime
extensions belong only in the wrapper layers. New Agent runtimes should follow
the same convention with a dedicated wrapper Dockerfile instead of accumulating
platform-specific customization in `build-nemoclaw-sandbox.sh`. OpenClaw retains
the historical published name `tasklattice-nemoclaw-sandbox` for compatibility
with existing deployments, while its internal upstream tag explicitly includes
`openclaw`.

## GitHub Actions Release

`.github/workflows/release.yml` responds only to semantic version tags, for
example:

```bash
git tag v0.3.0
git push origin v0.3.0
```

The workflow runs tests, type checking, and Helm rendering before building the
five GHCR images in parallel. Each image publishes `X.Y.Z` and
`sha-<12-character-commit>`. Stable releases also update `latest`, while
prerelease tags such as `v0.3.0-rc.1` do not. After a successful build, the
workflow:

1. Publishes `oci://ghcr.io/<owner>/charts/tasklattice:X.Y.Z`.
2. Creates a GitHub Release.
3. Attaches the self-contained `tasklattice-X.Y.Z.tgz` package to the Release.

GHCR packages must be public unless the target cluster is configured with a
pull secret. After publishing packages from the repository for the first time,
verify in the GitHub package settings that the visibility of all five image
packages and the chart package matches the deployment environment.

## Deploy from a GitHub Release

```bash
VERSION="<release-version>"
curl -fLO "https://github.com/Sn0rt/TaskLattice/releases/download/v${VERSION}/tasklattice-${VERSION}.tgz"
helm upgrade --install tasklattice "./tasklattice-${VERSION}.tgz" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

The chart can also be installed directly from GHCR OCI:

```bash
VERSION="<release-version>"
helm upgrade --install tasklattice \
  oci://ghcr.io/sn0rt/charts/tasklattice \
  --version "${VERSION}" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

The default values match the current local validation path: control and
OpenShell use `LoadBalancer`, local sign-in uses `admin/admin`, and OpenShell
uses plaintext communication inside the cluster while accepting unauthenticated
clients. These defaults allow a trusted local cluster to start directly, but
they are not suitable for a shared or public environment. At a minimum,
production deployments must replace every `secrets.*` value through a private
values file and configure TLS/OIDC for OpenShell and the ingress. If the Agent
Sandbox controller is already installed in the cluster, set
`agentSandbox.enabled=false` to avoid managing the cluster-scoped CRDs and
controller more than once.

Private GHCR images require a pull secret that is passed to both the TaskLattice
Pods and dynamic Sandboxes:

```yaml
global:
  imagePullSecrets:
    - name: ghcr-pull
openshell:
  server:
    sandboxImagePullSecrets:
      - name: ghcr-pull
```
