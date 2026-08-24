# TaskLattice Helm Chart

This chart installs the complete TaskLattice stack: control/UI, OpenShell
runner, LiteLLM, PostgreSQL, OpenShell, and the Agent Sandbox controller.
OpenShell 0.0.82 is a version- and checksum-pinned NVIDIA OCI dependency.
Agent Sandbox v0.5.1 is fetched from its checksum-pinned Kubernetes SIGs
release tag and packaged as a Helm dependency. Their upstream source is not
copied into this repository, while the released TaskLattice archive remains
self-contained.

Prepare the dependency archives before rendering the source Chart:

```bash
npm run helm:dependencies
```

Release builds also package the complete Chart at
`/opt/tasklattice/helm/tasklattice.tgz` inside the Control Plane image. The
image exposes that location through `TASKLATTICE_HELM_CHART`.

The source Chart uses the development version `0.0.0-dev` and resolves its
first-party images to `:dev`. The Release workflow replaces both Chart version
and `appVersion` with the exact Git Release version before publishing.

`control.publicUrl` is independent of `control.service.type`. Leave it empty
for Local authentication without SMTP invitations, including when exposing
the Control Service through a LoadBalancer, Route, Ingress, or Gateway. Set a
stable canonical browser URL when enabling `auth.oidc`, the embedded Keycloak,
or `control.smtp.enabled`; it is used for OIDC callbacks and invitation links.

Install a released chart:

```bash
VERSION="<release-version>"
curl -fLO "https://github.com/Sn0rt/TaskLattice/releases/download/v${VERSION}/tasklattice-${VERSION}.tgz"
helm upgrade --install tasklattice "./tasklattice-${VERSION}.tgz" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

The same chart is published as an OCI artifact:

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

Defaults preserve the repository's trusted local-cluster setup and use
`admin/admin`. Before shared or internet-facing use, provide a private values
file that changes every `secrets.*` value and configures OpenShell TLS/OIDC.
If the Agent Sandbox controller already exists cluster-wide, set
`agentSandbox.enabled=false`. For private GHCR packages, create a registry
pull Secret and add its `{name: ...}` reference to `global.imagePullSecrets`,
`agentSandbox.imagePullSecrets`, `openshell.imagePullSecrets`, and
`openshell.server.sandboxImagePullSecrets`. The Agent Sandbox controller uses
its own namespace, so its Secret must also exist there.

Every first-party workload and configurable runtime dependency has explicit
CPU and memory requests and limits. The Chart also creates a namespace-scoped
Container `LimitRange` by default so OpenShell's dynamically injected sandbox
init containers receive CPU and memory defaults during admission. If the
OpenShift project or Kubernetes namespace already has an equivalent
administrator-managed `LimitRange`, set `resourceDefaults.enabled=false` to
avoid defining a second default policy.

Workload rollout checksums are component-scoped. Updating Control-only
settings such as `control.publicUrl` restarts the Control Deployment but does
not roll Runner, LiteLLM, or PostgreSQL. Changing a Service type by itself does
not restart application Pods.

LiteLLM defaults to two Uvicorn workers. Resource-constrained environments can
set `litellm.workers=1` without patching the rendered Deployment.

The dependency preparation step applies the small OpenShell 0.0.82 overlay in
`patches/openshell-0.0.82-certgen-resources.patch`, which applies the configured
`openshell.resources` to its pre-install certificate-generation Job. Keep or
upstream that patch when refreshing the dependency so the hook can run before
the namespace `LimitRange` exists on a first installation.

When `secrets.existingSecret` is used it must contain `control.toml`,
`runner-token`, `litellm-master-key`, `postgres-password`, `database-url`,
`litellm-ui-username`, `litellm-ui-password`, and `litellm-salt-key`.
`control.toml` contains the Control Plane database, Local/OIDC authentication,
SMTP credentials, Runner, and LiteLLM settings. Set `runner.gatewayEndpoint`
when `openshell.enabled=false` and the gateway is managed outside this release.

To deliver Project invitations through SMTP, add the following to a private
values file. Port 587 uses STARTTLS; use `secure: true` for implicit TLS,
normally on port 465.

```yaml
control:
  publicUrl: https://tasklattice.example.com
  smtp:
    enabled: true
    host: smtp.example.com
    port: 587
    secure: false
    username: tasklattice@example.com
    fromAddress: tasklattice@example.com
    fromName: TaskLattice
    replyTo: support@example.com
secrets:
  smtpPassword: replace-me
```

If the SMTP relay does not require authentication, leave both
`control.smtp.username` and `secrets.smtpPassword` empty. When
`secrets.existingSecret` is used, configure the `[smtp]` section directly in
its `control.toml` value instead.

## Disconnected / air-gapped installation

The released Control Plane image contains the complete packaged Chart,
including OpenShell, Agent Sandbox, their CRDs, and the Agent Sandbox upstream
license:

```text
/opt/tasklattice/helm/tasklattice.tgz
```

The runtime image intentionally does not include the Helm CLI. Extract the
archive and render it with the Helm binary already approved for the
disconnected environment without contacting a Helm or OCI repository:

```bash
CONTROL_IMAGE=registry.internal.example.com/tasklattice-control:<version>
CONTAINER_ID="$(podman create "${CONTROL_IMAGE}")"
podman cp \
  "${CONTAINER_ID}:/opt/tasklattice/helm/tasklattice.tgz" \
  ./tasklattice.tgz
podman rm "${CONTAINER_ID}"

tar -xzf tasklattice.tgz
cp tasklattice/values-airgap.yaml ./my-airgap-values.yaml
# Replace registry.airgap.example.com and airgap-registry in the copied file.

helm template tasklattice ./tasklattice \
  --namespace tasklattice-sandboxes \
  --include-crds \
  --values tasklattice/values-openshift.yaml \
  --values ./my-airgap-values.yaml \
  > tasklattice-openshift.yaml
```

`values-airgap.yaml` mirrors every image family independently: TaskLattice
images through `global.imageRegistry`, PostgreSQL and Keycloak through
`images.*`, Agent Sandbox through `agentSandbox.image`, and the OpenShell
gateway, supervisor, and default sandbox through their respective `openshell`
values. Do not put a full image repository under a first-party
`images.<name>.repository` unless `useGlobalRegistry=false`; normally set
`global.imageRegistry` once and keep those repository names relative.

Before installing, create both namespaces and the same registry pull Secret in
each. The example sets `agentSandbox.namespace.create=false` so Helm can use
the pre-created dependency namespace:

```bash
oc new-project tasklattice-sandboxes
oc -n tasklattice-sandboxes create secret docker-registry airgap-registry \
  --docker-server=registry.internal.example.com \
  --docker-username='<username>' \
  --docker-password='<password>'

oc new-project agent-sandbox-system
oc -n agent-sandbox-system create secret docker-registry airgap-registry \
  --docker-server=registry.internal.example.com \
  --docker-username='<username>' \
  --docker-password='<password>'
```

Dependency preparation (`npm run helm:dependencies`) needs network access and
is a build-time operation only. Do not run it in the disconnected environment;
use the `.tgz` embedded in the released Control Plane image.

## OpenShift

Use `values-openshift.yaml` when the OpenShift administrator permits the
`anyuid` SCC. The images retain their tested, non-root UID/GID values; no
arbitrary-UID `HOME=/tmp` image adaptation is required. The profile binds the
release's dedicated Runtime, Control, and OpenShell gateway ServiceAccounts to
`anyuid`, changes externally facing Services to `ClusterIP`, creates an
edge-terminated Control Route, omits OpenShell's structured AppArmor field,
and applies restrictive security contexts to the Agent Sandbox controller.

OpenShell sandbox pods are the intentional exception. They require root,
network/process capabilities, and the `privileged` SCC. The OpenShift profile
therefore creates a namespaced RoleBinding to
`system:openshift:scc:privileged`. This is suitable only for an isolated,
trusted evaluation project, and the Helm installer must be allowed to bind
that ClusterRole. Set `openshift.anyuidScc.createRoleBinding=false` and/or
`openshift.sandboxScc.createRoleBinding=false` when a cluster administrator
manages the corresponding SCC grants separately.

The Chart also installs CRDs, ClusterRoles, ClusterRoleBindings, and the Agent
Sandbox controller namespace. A cluster administrator must perform the first
installation, or install those cluster-scoped dependencies separately and set
`agentSandbox.enabled=false`.

Example:

```bash
NAMESPACE=tasklattice-sandboxes
APPS_DOMAIN="$(oc get ingresses.config.openshift.io cluster \
  -o jsonpath='{.spec.domain}')"
CONTROL_HOST="tasklattice.${APPS_DOMAIN}"

oc new-project "${NAMESPACE}"
helm upgrade --install tasklattice charts/tasklattice \
  --namespace "${NAMESPACE}" \
  --values charts/tasklattice/values-openshift.yaml \
  --set-string "control.publicUrl=https://${CONTROL_HOST}" \
  --set-string "openshift.routes.control.host=${CONTROL_HOST}" \
  --wait \
  --wait-for-jobs \
  --timeout 15m
```

The Control Route is intended for browser and HTTP/WebSocket traffic. The
OpenShell gateway remains internal because its API uses gRPC; use port
forwarding for private evaluation or configure OpenShell's `grpcRoute` with a
supported Gateway API implementation. Do not expose the default plaintext,
unauthenticated OpenShell configuration publicly.

This Chart deploys the Docker Official `postgres:17-alpine` image and mounts
`/var/lib/postgresql/data`. A database log referring to
`/opt/bitnami/postgresql` comes from an image override or a different release;
do not substitute a Bitnami image without also replacing its environment and
volume configuration.

## Embedded Keycloak for end-to-end tests

Set `keycloak.enabled=true` to deploy a test-only Keycloak instance together
with TaskLattice. The Chart imports the `tasklattice` realm, configures the
confidential `tasklattice-control-plane` OIDC client, creates complete Alice
and Bob test profiles, and automatically enables the matching OIDC settings in
`control.toml`.

Keycloak needs a stable URL that is reachable from both the browser and the
Control pod. For a cluster with a reserved load-balancer address:

```bash
helm upgrade --install tasklattice charts/tasklattice \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --set control.publicUrl=http://192.168.139.2 \
  --set keycloak.enabled=true \
  --set keycloak.publicUrl=http://192.168.139.3:8080 \
  --set keycloak.service.loadBalancerIP=192.168.139.3
```

For local environments where the browser uses a loopback hostname while the
Control pod reaches the same endpoint through the node address, map that
hostname with `control.hostAliases`. For example, OrbStack can use
`keycloak.localhost` in `keycloak.publicUrl` and map it to the OrbStack node IP.
The repository's local deployment script performs this mapping automatically:

```bash
npm run helm:deploy:dev:keycloak
```

The development credentials are:

| Purpose | Username | Password |
| --- | --- | --- |
| Keycloak administration | `admin` | `admin` |
| TaskLattice SSO user | `alice` | `password` |
| TaskLattice SSO user | `bob` | `password` |

Override `secrets.keycloakAdminPassword`,
`secrets.keycloakClientSecret`, and `secrets.keycloakTestUserPassword` when
needed. Test user profile fields can be replaced through
`keycloak.testUsers`.

This mode runs Keycloak with `start-dev` and ephemeral storage. Realm changes
are lost when its pod is replaced. It intentionally cannot be combined with
`secrets.existingSecret`, because the Chart must generate matching Keycloak
credentials and `control.toml`. Use `auth.oidc` with an independently managed
identity provider for production.

## Example MCP Server for integration tests

Set `exampleMcp.enabled=true` to deploy a test-only, in-cluster Streamable HTTP
MCP Server. It exposes three deterministic tools: `echo_message`,
`calculate_sum`, and `get_platform_status`. The Service is not exposed outside
the cluster, requires HTTP Basic authentication, and is available to LiteLLM at:

```text
http://tasklattice-example-mcp:3000/mcp
```

The test credentials are `Username` / `Password`. LiteLLM accepts the Basic
credential as `username:password` and encodes it when creating the HTTP
Authorization header, so the Chart creates `tasklattice-example-mcp-auth` with
an `auth-value` containing `Username:Password`. Register it with:

```text
auth type: basic
Secret reference: k8s://<namespace>/tasklattice-example-mcp-auth#auth-value
```

Build and deploy the local example together with Keycloak:

```bash
npm run images:build:example-mcp
npm run helm:deploy:dev:keycloak:example-mcp
```

Register the endpoint as a custom HTTP MCP Server in a Project. TaskLattice
then asks LiteLLM to discover the tools and stores the resulting names,
descriptions, input schemas, and discovery status in the Project database.
This component uses fixed test credentials and must not be enabled in
production.

## Shared database

TaskLattice control and LiteLLM intentionally use the same `database-url`.
LiteLLM owns the PostgreSQL `public` schema; the control plane and its Prisma
migration history live in the `tasklattice` schema. The control Deployment has
an init container that runs `prisma migrate deploy`, including the SQL migration
that creates the default Project and preconfigured Skill, MCP Server, Knowledge
Source, Agent Role, and policy metadata.

An external database supplied through `secrets.existingSecret` must allow the
configured role to create and modify the `tasklattice` schema. There is no
SQLite mode or control-plane data PVC.
