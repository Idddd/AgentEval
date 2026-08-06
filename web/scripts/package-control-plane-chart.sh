#!/usr/bin/env bash
set -euo pipefail

required_commands=(cp helm sed)
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is not installed: $command_name" >&2
    exit 1
  fi
done

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:-0.0.0-dev}"
image_registry="${TASKLATTICE_IMAGE_REGISTRY:-ghcr.io/sn0rt}"
chart_root="$repository_root/charts/tasklattice"
output_root="$repository_root/dist/control-plane-chart"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/tasklattice-control-chart.XXXXXX")"

cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

bash "$repository_root/scripts/prepare-helm-dependencies.sh"
cp -R "$chart_root" "$work_dir/tasklattice"
sed -i.bak \
  "s|imageRegistry: ghcr.io/sn0rt|imageRegistry: ${image_registry}|" \
  "$work_dir/tasklattice/values.yaml"
rm -f "$work_dir/tasklattice/values.yaml.bak"

mkdir -p "$output_root"
helm lint "$work_dir/tasklattice"
helm package "$work_dir/tasklattice" \
  --version "$version" \
  --app-version "$version" \
  --destination "$work_dir/packaged" >/dev/null
cp "$work_dir/packaged/tasklattice-${version}.tgz" "$output_root/tasklattice.tgz"

echo "Packaged complete TaskLattice Helm chart at $output_root/tasklattice.tgz"
