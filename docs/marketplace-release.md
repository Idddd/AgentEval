# AI Marketplace release deployment

The v0.2.7 delivery format matches v0.2.1: the `tali-ui-demo` image includes
`/opt/tali/helm/tali-UI-demo.tgz`, and the chart is also published to GHCR as OCI.
The application now runs a Node server on port 8080, supporting both mock and
live Guard API connections. The default is mock; no database is required.

## Docker

```sh
docker pull ghcr.io/idddd/tali-ui-demo:0.2.7
docker run --rm -p 8080:8080 ghcr.io/idddd/tali-ui-demo:0.2.7
```

## Kubernetes

```sh
helm upgrade --install tali-ui-demo oci://ghcr.io/idddd/charts/tali-ui-demo \
  --version 0.2.7 --namespace ai-marketplace --create-namespace
kubectl -n ai-marketplace port-forward svc/tali-ui-demo 8080:80
```

For a live backend, add:

```sh
--set marketplace.dataMode=live \
--set marketplace.guardApiUrl=https://guard.internal/api/v1 \
--set marketplace.publicOrigin=https://marketplace.internal
```

Use your actual public UI origin and Guard URL. Users connect with personal
access tokens in the UI; do not put a shared administrator token in Helm values.
Text-only Policy creation additionally needs `marketplace.policyAuthoringUrl`;
see [Guard API configuration](guard-openapi-connection.md).

When upgrading from v0.2.1, keep your release name and namespace. Do not use
`--reuse-values`: the new Node runtime uses UID/GID 1000 instead of nginx's 101.
Reapply only your intended image pull secrets, service, resources and placement
overrides. The chart defaults to a non-root, read-only container.

## Offline transfer and embedded chart

On a connected machine:

```sh
docker pull ghcr.io/idddd/tali-ui-demo:0.2.7
docker save -o ai-marketplace-0.2.7.tar ghcr.io/idddd/tali-ui-demo:0.2.7
container=$(docker create ghcr.io/idddd/tali-ui-demo:0.2.7)
docker cp "$container:/opt/tali/helm/tali-UI-demo.tgz" ./tali-UI-demo.tgz
docker rm "$container"
```

Transfer both files. Load the image into your internal registry or every cluster
node's container runtime, then install the local chart with `image.repository`
and `image.tag` set to that imported image. `docker load` alone does not populate
a Kubernetes containerd image store. The embedded chart normally pins the exact
CI image tag; override it when importing under `0.2.7` or an internal name.

## Branding

Create a ConfigMap containing `logo.svg` and `favicon.svg`, then set
`branding.existingConfigMap` to its name. Files are mounted read-only; restart
pods after replacement. See [runtime branding](runtime-branding.md).

## Publishing

The workflow builds `deploy/Dockerfile.marketplace` for linux/amd64. Branch
pushes publish preview images and verify mock/live startup plus the embedded
chart. A `vMAJOR.MINOR.PATCH` tag additionally publishes versioned image tags
and the OCI chart. Existing release tags are not overwritten. This workflow
publishes packages, not a GitHub Release page, matching v0.2.1.

## v0.2.5 changes

- F5 and Nemo source-aware policies and profiles.
- User and Agent Wizard workflow with role-specific statuses and stage progress bars.
- Structured provider configuration forms and required-field validation.
- Mock is the default; browser data stays local and no evaluation or backend synchronization runs in mock mode.
- Optional live-mode marketplace persistence and provider adapters are included but require explicit runtime configuration.

## v0.2.6 changes

- Rename Guardrail Profiles to Profiles, Policies to Guardrails, and Rule text to Requirement throughout the demo UI.
- Remove role selection. Admin and IT Admin can both create and implement guardrails; other accounts can create requirements.
- Add a pending implementation example at the top of the initial guardrail list.
- Profiles become Ready immediately after creation; migrate mock Review profiles to Ready.
- Compact latest-version marker and wider version selector to keep Ready visible.

## v0.2.7 changes

- Unified F5/Nemo configuration, large plain-text GenAI input, and at least one required source.
- Mock evaluation runs selected sources only, followed by Admin approval before Ready.
- New evaluations pass; a dedicated failure fixture shows a collapsible, horizontally scrollable case table.
- Status examples are balanced once per browser, preserving records and future workflow changes.
- Always-visible edit icons and distinct Ready (green) / Active (purple) badges.
