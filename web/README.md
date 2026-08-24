# TaskLattice

TaskLattice is a Project-scoped Kubernetes control plane for operating AI
Agents. It manages model Providers and routing, Instance-bound access and
runtime policies, Agent resources, and observability around
OpenShell sandboxes. OpenShell is the fixed runtime; OpenClaw is the default
Agent implementation and Hermes is the second supported implementation.

The `v0.1.x` release line is an early preview. The Provider-to-Sandbox path is
implemented end to end. The Traces workbench currently demonstrates the
intended interaction model with fixture data; it is not yet connected to an
OpenTelemetry collector or persistent trace store.

Control Plane runtime settings use a single TOML file; see
[Control Plane configuration](docs/control-configuration.md).

```text
Browser (TanStack Start + shadcn/ui)
                  |
                  | REST + WebSocket
                  v
TaskLattice Control API ---- LiteLLM ---- Provider API
          |                    |
          `------.      .------'
                 v      v
          shared PostgreSQL instance
          (`tasklattice` + `public` schemas)
          |
          v
TaskLattice OpenShell Runner
          |
          | OpenShell CLI / gRPC
          v
OpenShell Gateway ---- Agent Sandbox CR
                           |
                           `---- Sandbox Pod + workspace PVC
                                 (OpenClaw or Hermes)
```

## Core capabilities

- Project-scoped membership, quotas, configuration, and resource ownership.
- Provider registration, model discovery, LiteLLM-backed Model Routings,
  per-Instance virtual keys, spend attribution, and cost views.
- Direct, many-to-many Instance bindings to reusable Access Policies, with
  independently selected OpenShell Runtime Policies.
- OpenClaw and Hermes Instances with Agent UI and terminal access.
- Agent Garden registration and Agent-to-Agent connections, plus Skills, MCP
  Servers, and Knowledge Base catalogs.
- Project audit logs and a preview Trace workbench for Agent, model, tool, MCP,
  and external-system interactions.

## Install the latest Release

The default installation target is the
[latest published GitHub Release](https://github.com/Sn0rt/TaskLattice/releases/latest).
Set `VERSION` to that Release version without its leading `v`. The Chart and
all five first-party images then use that exact immutable version; TaskLattice
does not deploy the floating `latest` image tag.

Download the self-contained Chart attached to the Release:

```sh
VERSION="<latest-release-version>"
curl --fail --location --remote-name \
  "https://github.com/Sn0rt/TaskLattice/releases/download/v${VERSION}/tasklattice-${VERSION}.tgz"
helm upgrade --install tasklattice "./tasklattice-${VERSION}.tgz" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

The same Chart is published to GHCR as an OCI artifact:

```sh
VERSION="<latest-release-version>"
helm upgrade --install tasklattice \
  oci://ghcr.io/sn0rt/charts/tasklattice \
  --version "${VERSION}" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

The Chart defaults the Control and OpenShell Services to `LoadBalancer`. On a
cluster that does not provision external load-balancer addresses, add these
overrides to either installation command; without them, Helm `--wait` will time
out:

```sh
helm upgrade --install tasklattice \
  oci://ghcr.io/sn0rt/charts/tasklattice \
  --version "${VERSION}" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --set control.service.type=ClusterIP \
  --set openshell.service.type=ClusterIP \
  --wait \
  --timeout 10m
```

Requirements:

- Kubernetes 1.29 or newer.
- Helm and `kubectl`.
- Access to GHCR and the public upstream registries.
- A default `ReadWriteOnce` StorageClass.
- Permission to create namespaces, CRDs, ClusterRoles, and ClusterRoleBindings.
  If the Agent Sandbox controller is managed separately, install it first and
  set `agentSandbox.enabled=false`.
- Credentials or an endpoint for at least one supported model Provider.
- At least 4 CPU and 8 GiB memory for a practical single-Instance deployment.

Verify the installation:

```sh
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-control --timeout=300s
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-runner --timeout=300s
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-litellm --timeout=300s
kubectl -n tasklattice-sandboxes rollout status statefulset/tasklattice-postgresql --timeout=300s
kubectl -n tasklattice-sandboxes rollout status statefulset/tasklattice-openshell --timeout=300s
kubectl -n agent-sandbox-system rollout status deployment/agent-sandbox-controller --timeout=300s
kubectl -n tasklattice-sandboxes get pods,services,pvc
```

## Images and versions

TaskLattice publishes five first-party images. A packaged Release Chart sets
its `appVersion` to the Release version, and every empty first-party image tag
resolves to that exact value.

| Component                | Released image or version                                       | Purpose                                            |
| ------------------------ | --------------------------------------------------------------- | -------------------------------------------------- |
| TaskLattice control      | `ghcr.io/sn0rt/tasklattice-control:<release>`                   | UI, REST/WebSocket API, and PostgreSQL control data |
| Runtime runner           | `ghcr.io/sn0rt/tasklattice-openshell-runner:<release>`          | OpenShell sandbox lifecycle and terminal relay     |
| LiteLLM                  | `ghcr.io/sn0rt/tasklattice-litellm:<release>`                   | Model gateway, virtual keys, and spend attribution |
| OpenClaw sandbox         | `ghcr.io/sn0rt/tasklattice-nemoclaw-sandbox:<release>`          | Default Agent sandbox                              |
| Hermes sandbox           | `ghcr.io/sn0rt/tasklattice-nemoclaw-hermes-sandbox:<release>`   | Hermes Agent sandbox                               |
| LiteLLM PostgreSQL       | `postgres:17-alpine`                                            | LiteLLM configuration and usage data               |
| OpenShell gateway        | `ghcr.io/nvidia/openshell/gateway:0.0.82`                       | Policy enforcement, audit, exec, and HTTP routing  |
| OpenShell supervisor     | `ghcr.io/nvidia/openshell/supervisor:0.0.82`                    | Supervisor injected into Agent sandboxes           |
| Agent Sandbox controller | `registry.k8s.io/agent-sandbox/agent-sandbox-controller:v0.5.1` | Sandbox CR, Pod, and workspace PVC lifecycle       |

The OpenShell supervisor and selected Agent image are pulled when an Instance
creates its Sandbox rather than running as permanent control-plane Pods.

## Access

On a cluster with `LoadBalancer` support, open the external address of the
`tasklattice-control` Service on port 80. When using the `ClusterIP` overrides,
forward the Control Service and open `http://127.0.0.1:18080`:

```sh
kubectl -n tasklattice-sandboxes port-forward service/tasklattice-control 18080:80
```

Keep this second forward running when validating a Sandbox Agent UI through
OpenShell:

```sh
kubectl -n tasklattice-sandboxes port-forward service/tasklattice-openshell 8080:8080
```

The checked-in Chart defaults are suitable only for a trusted cluster: local
login is `admin / admin`, and OpenShell permits unauthenticated plaintext
gateway clients. Before shared or internet-facing use, override every
`secrets.*` value and configure authenticated ingress plus OpenShell TLS/OIDC.
For an end-to-end SSO test environment, the Chart can deploy an ephemeral,
preconfigured Keycloak. Do not enable `keycloak.enabled` alone:
`keycloak.publicUrl` must be reachable from both the browser and the Control
Pod, and `control.publicUrl` must match the browser-visible TaskLattice origin
used for the OIDC callback.
See the [Chart documentation](charts/tasklattice/README.md) for existing
Secrets, image pull Secrets, embedded Keycloak examples, and external runtime
settings.

## First Instance

After signing in:

1. In Project settings, connect a Provider and register at least one validated
   text-generation model.
2. Create a Model Routing from the registered models and wait for it to reach
   `READY`. The first ready Routing becomes the Project default automatically.
3. Review the automatically configured `Default` Access Policy. It is Active
   and intentionally has no MCP allow rules, so a new Project starts from a
   deny-all baseline. Add narrower policies when the Instance needs tools.
4. Create an Instance, choose OpenClaw or Hermes, select an Agent Role and one
   or more Active Access Policies, and keep the built-in Unrestricted Runtime
   Policy for the first validation run. The Instance uses the Project's READY
   default Model Routing.
5. Wait for the Instance to reach `READY`, then open its Agent UI and terminal.

A successful Instance reaches `READY`, exposes its Agent UI, and enables its
terminal. Each Instance receives an isolated LiteLLM virtual key and an
OpenShell Sandbox with its own workspace PVC.

## Persistence and uninstall

The control plane and LiteLLM share one PostgreSQL database instance. Control
data is isolated in the `tasklattice` schema while LiteLLM retains its `public`
schema. OpenShell gateway data and Agent workspaces use their own PVCs.
Restarting Pods does not reset that state. A control init container applies
Prisma SQL migrations before each rollout.

Delete active Instances and back up required data before uninstalling:

```sh
kubectl -n tasklattice-sandboxes get sandboxes,pvc
helm uninstall tasklattice --namespace tasklattice-sandboxes
```

StatefulSet claim-template PVCs, dynamically created workspace PVCs, Sandbox
resources, and CRDs may remain after Helm uninstall. Review them explicitly
before removal.

Additional design documentation:

- [Image release and Helm publishing](docs/image-release-and-helm.md)
- [OpenShell Kubernetes runtime](docs/openshell-kubernetes-runtime.md)
- [Agent Garden architecture](docs/agent-garden-architecture.md)
- [Model and Routing](docs/model-routing.md)
- [MVP core flow](docs/mvp-core-flow.md)
- [Contributing and local development](CONTRIBUTING.md)

## License

TaskLattice is licensed under the [Apache License 2.0](LICENSE). It permits
commercial use, modification, and distribution subject to the terms of the
license.
