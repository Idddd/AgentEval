#!/usr/bin/env bash

set -euo pipefail

cluster_name="${KIND_CLUSTER_NAME:-tasklattice-ci}"
kube_context="kind-${cluster_name}"
release_name="${HELM_RELEASE_NAME:-tasklattice}"
namespace="${HELM_NAMESPACE:-tasklattice-smoke}"
image_registry="${IMAGE_REGISTRY:-ghcr.io/sn0rt}"
helm_timeout="${HELM_TIMEOUT:-15m}"
build_images="${BUILD_IMAGES:-1}"
image_tag="${IMAGE_TAG:-dev}"

required_commands=(curl docker helm kind kubectl patch shasum)
for command_name in "${required_commands[@]}"; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is not installed: ${command_name}" >&2
    exit 1
  fi
done

if ! kind get clusters | grep -Fxq "${cluster_name}"; then
  echo "Kind cluster does not exist: ${cluster_name}" >&2
  echo "Create it first or set KIND_CLUSTER_NAME to an existing cluster." >&2
  exit 1
fi

if ! kubectl config get-contexts "${kube_context}" >/dev/null 2>&1; then
  echo "kubectl context does not exist: ${kube_context}" >&2
  exit 1
fi

control_image="${image_registry}/tasklattice-control:${image_tag}"
runner_image="${image_registry}/tasklattice-openshell-runner:${image_tag}"
litellm_image="${image_registry}/tasklattice-litellm:${image_tag}"

bash scripts/package-control-plane-chart.sh 0.0.0-dev

if [[ "${build_images}" == "1" ]]; then
  docker build \
    --file infra/docker/Dockerfile \
    --target control \
    --tag "${control_image}" \
    .
  docker build \
    --file infra/docker/Dockerfile \
    --target runner \
    --tag "${runner_image}" \
    .
  docker build \
    --file infra/docker/Dockerfile.litellm \
    --tag "${litellm_image}" \
    .
elif [[ "${build_images}" != "0" ]]; then
  echo "BUILD_IMAGES must be 0 or 1." >&2
  exit 1
fi

kind load docker-image --name "${cluster_name}" \
  "${control_image}" \
  "${runner_image}" \
  "${litellm_image}"

rollout_revision="smoke-$(date -u +%Y%m%d%H%M%S)"

helm lint charts/tasklattice --values charts/tasklattice/values-dev.yaml
npm run helm:validate:resources
helm upgrade --install "${release_name}" charts/tasklattice \
  --kube-context "${kube_context}" \
  --namespace "${namespace}" \
  --create-namespace \
  --values charts/tasklattice/values-dev.yaml \
  --set-string "global.imageRegistry=${image_registry}" \
  --set-string "global.rolloutRevision=${rollout_revision}" \
  --set-string "images.control.tag=${image_tag}" \
  --set-string "images.runner.tag=${image_tag}" \
  --set-string "images.litellm.tag=${image_tag}" \
  --set "control.service.type=ClusterIP" \
  --set "litellm.service.type=ClusterIP" \
  --set "openshell.service.type=ClusterIP" \
  --wait \
  --wait-for-jobs \
  --timeout "${helm_timeout}"

kubectl --context "${kube_context}" --namespace "${namespace}" wait \
  --for=condition=Ready pod \
  --all \
  --timeout="${helm_timeout}"
kubectl --context "${kube_context}" --namespace agent-sandbox-system wait \
  --for=condition=Ready pod \
  --all \
  --timeout="${helm_timeout}"

for required_namespace in "${namespace}" agent-sandbox-system; do
  pod_count="$(kubectl --context "${kube_context}" --namespace "${required_namespace}" get pods --no-headers | wc -l | tr -d ' ')"
  if [[ "${pod_count}" == "0" ]]; then
    echo "No Pods were created in namespace ${required_namespace}." >&2
    exit 1
  fi
  kubectl --context "${kube_context}" --namespace "${required_namespace}" get pods -o wide
done

helm --kube-context "${kube_context}" --namespace "${namespace}" status "${release_name}"
