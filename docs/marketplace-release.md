# AI Marketplace deployment — v0.2.15

This release uses shared in-memory SQLite without PVCs or database filesystem
permissions. The hidden `/api/demo-backup` page exports and restores all cases.
Server restart clears memory. Existing disk databases are not automatically
loaded; preserve an export before switching and restore it through the maintenance
page. Existing retained PVCs are not deleted.

Image: `ghcr.io/idddd/tali-ui-demo:0.2.15` (linux/amd64).
The Node server listens on port 8080. Mock mode uses shared SQLite automatically;
there is no database enable flag.

## Docker

```sh
docker pull ghcr.io/idddd/tali-ui-demo:0.2.15
docker run -d --name ai-marketplace -p 18082:8080 \
  ghcr.io/idddd/tali-ui-demo:0.2.15
```

Open [Profiles](http://127.0.0.1:18082/guardrails). SQLite runs in memory.
See [initial data and sharing](../README.md#shared-database-and-initial-data).

## Kubernetes

```sh
helm upgrade --install tali-ui-demo oci://ghcr.io/idddd/charts/tali-ui-demo \
  --version 0.2.15 --namespace ai-marketplace --create-namespace \
  --set openshift.enabled=true
kubectl -n ai-marketplace port-forward svc/tali-ui-demo 18082:80
```

No PVC or StorageClass is required. The OpenShift option lets the cluster assign
the runtime UID. Use `replicaCount=1`. For a manually managed Deployment, remove
obsolete PVC mounts, set `MARKETPLACE_DEMO_STORAGE=memory`, and use one replica.
Set `marketplace.publicOrigin` to the actual HTTPS Route origin if required by
your ingress setup. See [memory and backup](demo-memory-backup.md).

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
docker pull ghcr.io/idddd/tali-ui-demo:0.2.15
docker tag ghcr.io/idddd/tali-ui-demo:0.2.15 jfrog.example.com/docker-local/tali-ui:0.2.15
docker push jfrog.example.com/docker-local/tali-ui:0.2.15
```

Replace the example registry with yours and authenticate using your normal
registry login. For offline transfer:

```sh
docker save -o ai-marketplace-0.2.15.tar ghcr.io/idddd/tali-ui-demo:0.2.15
docker load -i ai-marketplace-0.2.15.tar
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
IMAGE=ghcr.io/idddd/tali-ui-demo:0.2.15
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
  --set image.tag=0.2.15 --set openshift.enabled=true
```

## Branding

Use `branding.existingConfigMap` for a ConfigMap containing `logo.svg` and
`favicon.svg`. See [runtime branding](runtime-branding.md).

## Publishing

The [release workflow](../.github/workflows/container-images.yml) builds
`deploy/Dockerfile.marketplace`. Version tags publish image aliases such as
`0.2.15` and `v0.2.15`, and the OCI chart at
`oci://ghcr.io/idddd/charts/tali-ui-demo`.

Validation covers mock/live startup, default database reads and writes,
embedded source checksum and extraction, and Helm rendering.
