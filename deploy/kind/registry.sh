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

    # kind propagates the host's proxy env into the node. A proxy on the
    # host's loopback is unreachable from inside the node, so registry pulls
    # fail with proxyconnect errors unless the registry bypasses the proxy.
    docker exec "${node}" mkdir -p /etc/systemd/system/containerd.service.d
    docker exec -i "${node}" \
      cp /dev/stdin /etc/systemd/system/containerd.service.d/no-proxy.conf <<EOF
[Service]
Environment="NO_PROXY=${REG_NAME},localhost:${REG_PORT},localhost,127.0.0.1,::1,10.96.0.0/16,10.244.0.0/16,.svc,.svc.cluster.local"
Environment="no_proxy=${REG_NAME},localhost:${REG_PORT},localhost,127.0.0.1,::1,10.96.0.0/16,10.244.0.0/16,.svc,.svc.cluster.local"
EOF
    docker exec "${node}" systemctl daemon-reload
    docker exec "${node}" systemctl restart containerd
  done
fi

echo "registry ready at localhost:${REG_PORT}"
