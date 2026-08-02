#!/usr/bin/env bash
# Idempotently start a local Docker registry reachable as localhost:5001 from
# the host and as kind-registry:5000 from inside the kind cluster.
set -euo pipefail

REG_NAME="kind-registry"
REG_PORT="5001"

if [ "$(docker inspect -f '{{.State.Running}}' "${REG_NAME}" 2>/dev/null || true)" != "true" ]; then
  docker rm -f "${REG_NAME}" 2>/dev/null || true
  docker run -d --restart=always -p "127.0.0.1:${REG_PORT}:5000" \
    --name "${REG_NAME}" registry:2
fi

# The kind network exists once a cluster has been created; connecting is
# idempotent and safe to re-run.
if docker network inspect kind >/dev/null 2>&1; then
  docker network connect kind "${REG_NAME}" 2>/dev/null || true
fi

echo "registry ready at localhost:${REG_PORT}"
