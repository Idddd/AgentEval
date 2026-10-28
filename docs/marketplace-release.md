# AI Marketplace deployment — v0.2.22

Image: `ghcr.io/idddd/tali-ui-demo:0.2.22` (Linux amd64). Helm chart:
`oci://ghcr.io/idddd/charts/tali-ui-demo`, version `0.2.22`.

The release includes the current Measure/Runner/Protection Center design,
NeMo/F5 lifecycle integration, PostgreSQL/MariaDB support and deployment
diagnostics. Mock and real workspaces have explicit independent entries:

| Entry | Behavior |
| --- | --- |
| `/v2/guardrails` | Browser-only Mock with roles and saved demonstration data |
| `/v2-mock/guardrails` | Compatible Mock alias |
| `/v3/guardrails` | Real integration; configuration and dependency failures remain errors |
| `/v1/` | Existing Profiles / Guardrails UI |

V3 errors never silently switch the workspace to Mock. Mock needs no backend
login and does not send business data to NeMo/F5 or the real database.
Existing browser Mock storage keys are preserved. Real users still require
independent Marketplace authentication/SSO and account-role mapping; a backend
NeMo token does not sign in the browser user.

## Start or upgrade

```sh
docker pull ghcr.io/idddd/tali-ui-demo:0.2.22
docker run -d --name ai-marketplace -p 18082:8080 \
  ghcr.io/idddd/tali-ui-demo:0.2.22
```

Open `/v2/guardrails` for Mock. To deploy with your existing backend services:

```sh
helm upgrade --install tali-ui-demo oci://ghcr.io/idddd/charts/tali-ui-demo \
  --version 0.2.22 --namespace YOUR_NAMESPACE \
  -f values.uat.yaml
```

Use the existing namespace/release name. Keep the current `workspaceId` and
NeMo URL when upgrading to preserve the identity of the real workspace.
Adapt [the UAT values example](../deploy/values.uat.example.yaml), and follow
[the internal Helm upgrade delta](../deploy/v2/UAT-token-config.md).

## Required internal chart delta

Updating `image.tag` alone does not upgrade a separately maintained internal
chart. Copy or merge the new `deployment.yaml` template as well as the values.

- Point startup, readiness and liveness at `/api/health`. Monitor
  `/api/nmgr/ready` separately for real configuration/database readiness.
  Do not gate the shared UI Service on real backend readiness.
- Set integration Secret key references and account/CA ConfigMap volumes to
  `optional: true`, so missing integration inputs reach V3 runtime diagnostics
  rather than preventing the UI process from starting.
- Preserve source selectors: `MARKETPLACE_NEMO_AUTH_MODE=token` or `password`
  when selecting a backend Secret; `MARKETPLACE_F5_ENABLED=true` if F5 is
  selected; `MARKETPLACE_DATABASE_PASSWORD_REQUIRED=true` only when using a
  separate database-password Secret key. The supplied chart adds these
  automatically. Missing selected credentials fail closed, without falling
  back to a stale alternate account or password.

[The full deployment template](../deploy/helm/tali-ui-demo/templates/deployment.yaml)
contains the exact conditional mappings. No new Secret content/key is required
solely for the isolation flags. Do not grant extra Kubernetes API permissions.

## Failure diagnosis and acceptance

V3 displays code, component, setting names and Reference. The Reference matches
`X-Request-ID` and structured server logs. Raw credentials and upstream response
bodies are not logged. See [deployment diagnostics](uat/2026-10-28-v3-deployment-diagnostics.md).

UI health means the shared UI is reachable. It does not certify real account
permissions, NeMo/F5 reachability, Runner capacity, inference or publishing.
The isolation verification covers missing/malformed configuration, missing
selected credentials/CA/account mappings and refused local dependency ports.
Target OCP and real NeMo/F5 account acceptance remains required.

## Internal registry and offline delivery

```sh
docker pull ghcr.io/idddd/tali-ui-demo:0.2.22
docker tag ghcr.io/idddd/tali-ui-demo:0.2.22 INTERNAL_REGISTRY/tali-ui:0.2.22
docker push INTERNAL_REGISTRY/tali-ui:0.2.22
```

Set `image.repository` to the internal repository and `image.tag` to `0.2.22`.
Continue using your current ImageStream/Istio/GitOps wiring. Do not enable an
additional OpenShift Route if Istio already owns the domain.

The image embeds its matching Helm chart and source archive:

- `/opt/tali/helm/tali-UI-demo.tgz`
- `/opt/tali/source/project-source.zip`
- `/opt/tali/source/project-source.zip.sha256`
- `/opt/marketplace/check-nemo.mjs` (read-only API compatibility check)

```sh
IMAGE=ghcr.io/idddd/tali-ui-demo:0.2.22
container=$(docker create "$IMAGE")
docker cp "$container:/opt/tali/helm/tali-UI-demo.tgz" ./tali-UI-demo.tgz
docker cp "$container:/opt/tali/source/project-source.zip" ./project-source.zip
docker cp "$container:/opt/tali/source/project-source.zip.sha256" ./project-source.zip.sha256
docker rm "$container"
sha256sum -c project-source.zip.sha256
```

Source excludes credentials, local environment files, databases, logs,
installed dependencies and generated output. The release workflow verifies
image startup, source integrity, Helm rendering and synthetic fault isolation
before publishing the OCI chart.
