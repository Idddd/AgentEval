#!/usr/bin/env bash
# Idempotently start a local Docker registry reachable as localhost:5001 from
# the host and as kind-registry:5000 from inside the cluster, and point each
# kind node's containerd at it.
#
# containerd 2.x uses the certs.d hosts.toml layout; a `mirrors` entry in a
# containerd config patch is rejected outright when config_path is set (which
# kind sets), so registry wiring must happen here rather than in cluster.yaml.
set -euo pipefail

REG_NAME="kind-registry"
REG_PORT="5001"
CLUSTER="${KIND_CLUSTER:-agent-eval}"

if [ "$(docker inspect -f '{{.State.Running}}' "${REG_NAME}" 2>/dev/null || true)" != "true" ]; then
  docker rm -f "${REG_NAME}" 2>/dev/null || true
  docker run -d --restart=always -p "127.0.0.1:${REG_PORT}:5000" \
    --name "${REG_NAME}" registry:2
fi

if docker network inspect kind >/dev/null 2>&1; then
  docker network connect kind "${REG_NAME}" 2>/dev/null || true
fi

# Per-node registry config (no-op before the cluster exists).
if kind get clusters 2>/dev/null | grep -qx "${CLUSTER}"; then
  for node in $(kind get nodes --name "${CLUSTER}"); do
    docker exec "${node}" mkdir -p "/etc/containerd/certs.d/localhost:${REG_PORT}"
    docker exec -i "${node}" \
      cp /dev/stdin "/etc/containerd/certs.d/localhost:${REG_PORT}/hosts.toml" <<EOF
[host."http://${REG_NAME}:5000"]
  capabilities = ["pull", "resolve"]
EOF
  done
fi

echo "registry ready at localhost:${REG_PORT}"
