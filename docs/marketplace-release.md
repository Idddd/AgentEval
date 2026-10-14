# AI Marketplace deployment — v0.2.21

This version updates the V2 role workbenches and Dashboard. Profile operating
controls now open in a responsive right sidebar with Monitoring/Preventing mode
approval, Bypass, and live simulated traces. Guardrail configurations and saved
revisions retain their NeMo/F5 provider, shown with colored badges.
Evaluation rows expand directly into benchmark results using the application
table theme. Titles, action arrows, primary-button alignment, and Control Intents
navigation are consistent across roles. Control Unit filters include Line 1.5
and Line 2 alongside ISS, RMG, and LCS, while existing access scopes remain intact.

Open `/v1/` or `/v2/` to select the interface through the URL.
V1 retains its two navigation sections. Version buttons have been removed.
V2 Guardrail/Profile configuration import is available only at `/v2/import`,
with validation, preview and confirmation. Imported configurations start as
drafts and do not replace existing records or activate supplied deployment data.
See [local version URLs](local-ui-versions.md) for JSON formats and examples.
Preview-only API fixtures are isolated from production runtime routes.

This release defaults to browser localStorage with no server database access.
All five Control Units remain available without existing records. Configuration fields
are labeled LLM prompt. Three banking Guardrails and two Profiles are included.
Evaluation results remain simulated. The hidden `/api/demo-backup` page exports
and restores cases in this browser. Different browsers do not share data.
Refresh and Pod restart preserve browser data; clearing site data removes it.
Export from the previous shared version before upgrading, then import in each
browser as needed. Existing retained PVCs are not deleted.

Image: `ghcr.io/idddd/tali-ui-demo:0.2.21` (linux/amd64).
The Node server listens on port 8080. The default storage mode is browser.

## Docker

```sh
docker pull ghcr.io/idddd/tali-ui-demo:0.2.21
docker run -d --name ai-marketplace -p 18082:8080 \
  ghcr.io/idddd/tali-ui-demo:0.2.21
```

Open [V1](http://127.0.0.1:18082/v1/) or [V2](http://127.0.0.1:18082/v2/).
Cases remain in this browser, with separate stores for the two interfaces.
See [initial data and sharing](../README.md#shared-database-and-initial-data).

## Kubernetes

```sh
helm upgrade --install tali-ui-demo oci://ghcr.io/idddd/charts/tali-ui-demo \
  --version 0.2.21 --namespace ai-marketplace --create-namespace \
  --set openshift.enabled=true
kubectl -n ai-marketplace port-forward svc/tali-ui-demo 18082:80
```

No PVC or StorageClass is required. The OpenShift option lets the cluster assign
the runtime UID. Use `replicaCount=1`. For a manually managed Deployment, remove
obsolete PVC mounts, set `MARKETPLACE_DEMO_STORAGE=browser`, and use one replica.
Leave `marketplace.publicOrigin` empty for automatic browser same-origin support
behind TLS-terminating routes. Remove any stale explicit origin from the previous
deployment; an explicit value still takes precedence. See [memory and backup](demo-memory-backup.md).

For a live Guard backend, add:

```sh
--set marketplace.dataMode=live \
--set marketplace.guardApiUrl=https://guard.internal/api/v1 \
--set marketplace.publicOrigin=https://marketplace.internal
```

Use your actual URLs. Users connect with personal access tokens in the UI.
See [Guard API connection](guard-openapi-connection.md) for optional authoring
configuration and supported operations.

## Internal registry / JFrog

Copy the published image to your Docker repository:

```sh
docker pull ghcr.io/idddd/tali-ui-demo:0.2.21
docker tag ghcr.io/idddd/tali-ui-demo:0.2.21 jfrog.example.com/docker-local/tali-ui:0.2.21
docker push jfrog.example.com/docker-local/tali-ui:0.2.21
```

Replace the example registry with yours and authenticate using your normal
registry login. For offline transfer:

```sh
docker save -o ai-marketplace-0.2.21.tar ghcr.io/idddd/tali-ui-demo:0.2.21
docker load -i ai-marketplace-0.2.21.tar
```

Loading into Docker does not populate a Kubernetes containerd image store.
Publish to a registry reachable by the cluster or import into its runtime.

## Embedded Helm chart and project source

The image contains:

- `/opt/tali/helm/tali-UI-demo.tgz`
- `/opt/tali/source/project-source.zip`
- `/opt/tali/source/project-source.zip.sha256`

Export without starting the application (POSIX shell):

```sh
IMAGE=ghcr.io/idddd/tali-ui-demo:0.2.21
container=$(docker create "$IMAGE")
docker cp "$container:/opt/tali/helm/tali-UI-demo.tgz" ./tali-UI-demo.tgz
docker cp "$container:/opt/tali/source/project-source.zip" ./project-source.zip
docker cp "$container:/opt/tali/source/project-source.zip.sha256" ./project-source.zip.sha256
docker rm -v "$container"
sha256sum -c project-source.zip.sha256
unzip project-source.zip -d ./exported-source
```

For a JFrog copy, set `IMAGE` to the internal repository and tag.
The delivery is a Node container image, not an executable Java JAR.
Java's `jar xf project-source.zip` can also extract the ZIP.

The archive includes project sources, deployment files, documentation and
build manifests. It excludes credentials, local environment files, databases,
logs, installed dependencies and generated outputs. It does not contain Git
history. Restore dependencies using the included lockfiles.

Install the extracted chart with your internal image:

```sh
helm upgrade --install tali-ui-demo ./tali-UI-demo.tgz \
  --namespace ai-marketplace --create-namespace \
  --set image.repository=jfrog.example.com/docker-local/tali-ui \
  --set image.tag=0.2.21 --set openshift.enabled=true
```

## Branding

Use `branding.existingConfigMap` for a ConfigMap containing `logo.svg` and
`favicon.svg`. See [runtime branding](runtime-branding.md).

## Publishing

The [release workflow](../.github/workflows/container-images.yml) builds
`deploy/Dockerfile.marketplace`. Version tags publish image aliases such as
`0.2.21` and `v0.2.21`, and the OCI chart at
`oci://ghcr.io/idddd/charts/tali-ui-demo`.

Validation covers mock/live startup, default database reads and writes,
embedded source checksum and extraction, and Helm rendering.
