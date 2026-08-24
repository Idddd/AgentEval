#!/usr/bin/env bash
set -euo pipefail

# Build one of the Agent implementations supported by the NemoClaw runtime.
# Each platform pins its upstream revision and base image independently because
# OpenClaw and Hermes publish different integration manifests and image lines.
readonly AGENT_PLATFORM="${NEMOCLAW_AGENT_PLATFORM:-openclaw}"
readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$AGENT_PLATFORM" in
  openclaw)
    readonly NEMOCLAW_REVISION="${NEMOCLAW_REVISION:-2adc8481ff3053a5a7be37d130cb183e222934ff}"
    readonly NEMOCLAW_BASE_IMAGE="${NEMOCLAW_BASE_IMAGE:-ghcr.io/nvidia/nemoclaw/sandbox-base@sha256:132dfea81026fe91581ab97d9034fb61d97b41a9951c7fd59d3d8b3b1b37b246}"
    readonly NEMOCLAW_IMAGE="${NEMOCLAW_IMAGE:-ghcr.io/sn0rt/tasklattice-nemoclaw-sandbox:dev}"
    readonly DOCKERFILE="Dockerfile"
    readonly UPSTREAM_IMAGE="tasklattice-nemoclaw-openclaw-upstream:${NEMOCLAW_REVISION:0:12}"
    readonly WRAPPER_DOCKERFILE="$REPOSITORY_ROOT/infra/docker/Dockerfile.nemoclaw-openclaw"
    ;;
  hermes)
    readonly NEMOCLAW_REVISION="${NEMOCLAW_HERMES_REVISION:-c1bda8069d95a84a9e16b0d292a5fe20ce7cea7d}"
    readonly NEMOCLAW_BASE_IMAGE="${NEMOCLAW_HERMES_BASE_IMAGE:-ghcr.io/nvidia/nemoclaw/hermes-sandbox-base@sha256:fa05221f5c7bcafea7e263c84e5d06f87e37d1ccb78dc28c113f1a4066aa544c}"
    readonly NEMOCLAW_IMAGE="${NEMOCLAW_HERMES_IMAGE:-ghcr.io/sn0rt/tasklattice-nemoclaw-hermes-sandbox:dev}"
    readonly DOCKERFILE="agents/hermes/Dockerfile"
    readonly UPSTREAM_IMAGE="tasklattice-nemoclaw-hermes-upstream:${NEMOCLAW_REVISION:0:12}"
    readonly WRAPPER_DOCKERFILE="$REPOSITORY_ROOT/infra/docker/Dockerfile.nemoclaw-hermes"
    ;;
  *)
    echo "Unsupported NEMOCLAW_AGENT_PLATFORM: $AGENT_PLATFORM" >&2
    exit 2
    ;;
esac

build_context="$(mktemp -d "${TMPDIR:-/tmp}/tasklattice-nemoclaw.XXXXXX")"
trap 'rm -rf "$build_context"' EXIT

git clone --quiet --filter=blob:none https://github.com/NVIDIA/NemoClaw.git "$build_context"
git -C "$build_context" checkout --quiet "$NEMOCLAW_REVISION"

if [ "$AGENT_PLATFORM" = "openclaw" ]; then
  node "$REPOSITORY_ROOT/scripts/patch-nemoclaw-openclaw-no-proxy.mjs" \
    "$build_context/scripts/nemoclaw-start.sh"
fi

resolved_base_image="$NEMOCLAW_BASE_IMAGE"
if ! docker image inspect "$resolved_base_image" >/dev/null 2>&1 \
  && ! docker pull "$resolved_base_image"; then
  if [ "$AGENT_PLATFORM" != "hermes" ]; then
    echo "Unable to resolve sandbox base image: $resolved_base_image" >&2
    exit 1
  fi

  resolved_base_image="tasklattice-nemoclaw-hermes-base:${NEMOCLAW_REVISION:0:12}"
  if ! docker image inspect "$resolved_base_image" >/dev/null 2>&1; then
    echo "Hermes base image is unavailable from GHCR; building the pinned local fallback."
    docker build \
      --file "$build_context/agents/hermes/Dockerfile.base" \
      --tag "$resolved_base_image" \
      "$build_context"
  fi
fi

platform_build_args=()
if [ "$AGENT_PLATFORM" = "openclaw" ]; then
  platform_build_args+=(
    --build-arg NEMOCLAW_PRIMARY_MODEL_REF=inference/deepseek-chat
    --build-arg NEMOCLAW_MAX_TOKENS=8192
    --build-arg NEMOCLAW_REASONING=false
  )
else
  platform_build_args+=(
    --build-arg NEMOCLAW_UPSTREAM_PROVIDER=deepseek
  )
fi

docker build \
  --file "$build_context/$DOCKERFILE" \
  --build-arg "BASE_IMAGE=$resolved_base_image" \
  --build-arg NEMOCLAW_MODEL=deepseek-chat \
  --build-arg NEMOCLAW_PROVIDER_KEY=inference \
  --build-arg NEMOCLAW_INFERENCE_BASE_URL=https://inference.local/v1 \
  --build-arg NEMOCLAW_INFERENCE_API=openai-completions \
  --build-arg NEMOCLAW_CONTEXT_WINDOW=65536 \
  --build-arg NEMOCLAW_WEB_SEARCH_ENABLED=0 \
  "${platform_build_args[@]}" \
  --tag "$UPSTREAM_IMAGE" \
  "$build_context"

# Keep the pinned upstream Dockerfiles external while ensuring every published
# Agent image crosses a TaskLattice-owned customization boundary.
docker build \
  --file "$WRAPPER_DOCKERFILE" \
  --build-arg "BASE_IMAGE=$UPSTREAM_IMAGE" \
  --tag "$NEMOCLAW_IMAGE" \
  "$REPOSITORY_ROOT"
