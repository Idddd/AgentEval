#!/usr/bin/env bash
set -euo pipefail

action="${1:-deploy}"
if (( $# > 0 )); then
  shift
fi
enable_keycloak=false
enable_example_mcp=false
release_name="${HELM_RELEASE_NAME:-tasklattice}"
namespace="${HELM_NAMESPACE:-tasklattice-sandboxes}"
helm_timeout="${HELM_TIMEOUT:-15m}"
image_registry="ghcr.io/sn0rt"
image_tag="dev"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$action" in
  deploy | delete) ;;
  *)
    echo "usage: $0 [deploy|delete] [--keycloak] [--example-mcp]" >&2
    exit 2
    ;;
esac

while (( $# > 0 )); do
  case "$1" in
    --keycloak)
      enable_keycloak=true
      ;;
    --example-mcp)
      enable_example_mcp=true
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "usage: $0 [deploy|delete] [--keycloak] [--example-mcp]" >&2
      exit 2
      ;;
  esac
  shift
done

required_commands=(helm jq kubectl)
if [[ "$action" == "deploy" ]]; then
  required_commands+=(docker)
fi
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is not installed: $command_name" >&2
    exit 1
  fi
done

if [[ -n "${KUBE_CONTEXT:-}" ]]; then
  kube_context="$KUBE_CONTEXT"
elif kube_context="$(kubectl config current-context 2>/dev/null)" && [[ -n "$kube_context" ]]; then
  :
elif kubectl config get-contexts orbstack >/dev/null 2>&1; then
  kube_context="orbstack"
else
  echo "No Kubernetes context is selected. Set KUBE_CONTEXT explicitly." >&2
  exit 1
fi

if ! kubectl config get-contexts "$kube_context" >/dev/null 2>&1; then
  echo "Kubernetes context does not exist: $kube_context" >&2
  exit 1
fi

if ! kubectl --context "$kube_context" version --request-timeout=10s >/dev/null 2>&1; then
  echo "Kubernetes cluster is not reachable through context: $kube_context" >&2
  exit 1
fi

if [[ "$action" == "delete" ]]; then
  if helm --kube-context "$kube_context" --namespace "$namespace" status "$release_name" >/dev/null 2>&1; then
    helm --kube-context "$kube_context" --namespace "$namespace" uninstall "$release_name"
  else
    echo "Helm release does not exist: $namespace/$release_name"
  fi
  exit 0
fi

images=(
  "$image_registry/tasklattice-control:$image_tag"
  "$image_registry/tasklattice-openshell-runner:$image_tag"
  "$image_registry/tasklattice-litellm:$image_tag"
  "$image_registry/tasklattice-nemoclaw-sandbox:$image_tag"
  "$image_registry/tasklattice-nemoclaw-hermes-sandbox:$image_tag"
)
if [[ "$enable_example_mcp" == "true" ]]; then
  images+=("$image_registry/tasklattice-example-mcp:$image_tag")
fi

missing_images=()
for image_name in "${images[@]}"; do
  if ! docker image inspect "$image_name" >/dev/null 2>&1; then
    missing_images+=("$image_name")
  fi
done
if (( ${#missing_images[@]} > 0 )); then
  echo "Build all local development images before deploying:" >&2
  printf '  %s\n' "${missing_images[@]}" >&2
  echo "Run: npm run images:build" >&2
  exit 1
fi

if [[ "$kube_context" == kind-* ]]; then
  if ! command -v kind >/dev/null 2>&1; then
    echo "The kind CLI is required to load local images into $kube_context." >&2
    exit 1
  fi
  kind load docker-image --name "${kube_context#kind-}" "${images[@]}"
fi

rollout_revision="dev-$(date -u +%Y%m%d%H%M%S)"
keycloak_helm_args=()
if [[ "$enable_keycloak" == "true" ]]; then
  keycloak_service_port="${KEYCLOAK_SERVICE_PORT:-8180}"
  if [[ "$kube_context" == "orbstack" ]]; then
    node_ip="$(
      kubectl --context "$kube_context" get nodes -o json |
        jq -r '
          [
            .items[0].status.addresses[]
            | select(.type == "InternalIP")
            | .address
            | select(test("^[0-9]+(\\.[0-9]+){3}$"))
          ][0] // empty
        '
    )"
    if [[ -z "$node_ip" ]]; then
      echo "Unable to find an IPv4 InternalIP for the OrbStack Kubernetes node." >&2
      exit 1
    fi
    control_public_url="${CONTROL_PUBLIC_URL:-http://tasklattice.localhost}"
    keycloak_public_url="${KEYCLOAK_PUBLIC_URL:-http://keycloak.localhost:${keycloak_service_port}}"
    keycloak_helm_args+=(
      --set-string "control.hostAliases[0].ip=$node_ip"
      --set-string "control.hostAliases[0].hostnames[0]=keycloak.localhost"
    )
  else
    control_public_url="${CONTROL_PUBLIC_URL:-}"
    keycloak_public_url="${KEYCLOAK_PUBLIC_URL:-}"
    if [[ -z "$control_public_url" || -z "$keycloak_public_url" ]]; then
      echo "CONTROL_PUBLIC_URL and KEYCLOAK_PUBLIC_URL are required with --keycloak outside OrbStack." >&2
      exit 1
    fi
  fi
  keycloak_helm_args+=(
    --set-string "control.publicUrl=$control_public_url"
    --set keycloak.enabled=true
    --set-string "keycloak.publicUrl=$keycloak_public_url"
    --set "keycloak.service.port=$keycloak_service_port"
  )
fi

example_mcp_helm_args=()
if [[ "$enable_example_mcp" == "true" ]]; then
  example_mcp_helm_args+=(--set exampleMcp.enabled=true)
fi

bash "$repository_root/scripts/prepare-helm-dependencies.sh"
helm lint "$repository_root/charts/tasklattice" \
  --values "$repository_root/charts/tasklattice/values-dev.yaml" \
  ${keycloak_helm_args[@]+"${keycloak_helm_args[@]}"} \
  ${example_mcp_helm_args[@]+"${example_mcp_helm_args[@]}"}
helm upgrade --install "$release_name" "$repository_root/charts/tasklattice" \
  --kube-context "$kube_context" \
  --namespace "$namespace" \
  --create-namespace \
  --values "$repository_root/charts/tasklattice/values-dev.yaml" \
  --set-string "global.rolloutRevision=$rollout_revision" \
  ${keycloak_helm_args[@]+"${keycloak_helm_args[@]}"} \
  ${example_mcp_helm_args[@]+"${example_mcp_helm_args[@]}"} \
  --wait \
  --wait-for-jobs \
  --timeout "$helm_timeout"

kubectl --context "$kube_context" --namespace "$namespace" get pods,services,pvc
helm --kube-context "$kube_context" --namespace "$namespace" status "$release_name"
