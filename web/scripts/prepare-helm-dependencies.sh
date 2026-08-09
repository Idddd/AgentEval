#!/usr/bin/env bash
set -euo pipefail

required_commands=(curl find helm patch shasum tar)
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is not installed: $command_name" >&2
    exit 1
  fi
done

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chart_root="$repository_root/charts/tasklattice"
openshell_version="0.0.82"
openshell_archive="$chart_root/charts/helm-chart-${openshell_version}.tgz"
openshell_sha256="b610de578f6f517c884b5e9815f153fad426ea05ed6687b78fa28515e183b57f"
patch_file="$chart_root/patches/openshell-${openshell_version}-certgen-resources.patch"
agent_sandbox_version="v0.5.1"
agent_sandbox_patch_file="$chart_root/patches/agent-sandbox-${agent_sandbox_version}-image-pull-secrets.patch"
agent_sandbox_source_directory="agent-sandbox-0.5.1"
agent_sandbox_url="https://github.com/kubernetes-sigs/agent-sandbox/archive/refs/tags/${agent_sandbox_version}.tar.gz"
agent_sandbox_sha256="b6f50dd6844f5c5d5a7b773a13d43a900dcbe3a20a8e02a8ea5731ec95dc0c42"
dependency_cache="${TASKLATTICE_DEPENDENCY_CACHE:-${TMPDIR:-/tmp}/tasklattice-dependencies}"
agent_sandbox_archive="$dependency_cache/agent-sandbox-${agent_sandbox_version}.tar.gz"
agent_sandbox_download="$agent_sandbox_archive.download.$$"
dependency_source_root="$repository_root/.helm-dependencies"
agent_sandbox_chart="$dependency_source_root/agent-sandbox"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/tasklattice-helm-dependencies.XXXXXX")"

cleanup() {
  rm -f "$agent_sandbox_download"
  rm -rf "$work_dir"
}
trap cleanup EXIT

mkdir -p "$dependency_cache" "$dependency_source_root"
if [[ ! -f "$agent_sandbox_archive" ]] ||
  [[ "$(shasum -a 256 "$agent_sandbox_archive" | awk '{print $1}')" != "$agent_sandbox_sha256" ]]; then
  curl -fsSL "$agent_sandbox_url" -o "$agent_sandbox_download"
  actual_sha256="$(shasum -a 256 "$agent_sandbox_download" | awk '{print $1}')"
  if [[ "$actual_sha256" != "$agent_sandbox_sha256" ]]; then
    echo "Agent Sandbox source checksum mismatch: $actual_sha256" >&2
    exit 1
  fi
  mv "$agent_sandbox_download" "$agent_sandbox_archive"
fi

tar -xzf "$agent_sandbox_archive" -C "$work_dir"
rm -rf "$agent_sandbox_chart"
cp -R "$work_dir/$agent_sandbox_source_directory/helm" "$agent_sandbox_chart"
cp "$work_dir/$agent_sandbox_source_directory/LICENSE" "$agent_sandbox_chart/LICENSE"
patch --directory "$dependency_source_root" --strip 1 < "$agent_sandbox_patch_file"
find "$agent_sandbox_chart" -type f \
  \( -name "*.orig" -o -name "*.rej" \) -delete

if [[ -f "$chart_root/Chart.lock" ]]; then
  helm dependency build --skip-refresh "$chart_root"
else
  helm dependency update --skip-refresh "$chart_root"
fi

actual_openshell_sha256="$(shasum -a 256 "$openshell_archive" | awk '{print $1}')"
if [[ "$actual_openshell_sha256" != "$openshell_sha256" ]]; then
  echo "OpenShell Helm chart checksum mismatch: $actual_openshell_sha256" >&2
  exit 1
fi

tar -xzf "$openshell_archive" -C "$work_dir"
patch --directory "$work_dir" --strip 1 < "$patch_file"
helm package "$work_dir/helm-chart" --destination "$work_dir/packaged" >/dev/null
cp "$work_dir/packaged/helm-chart-${openshell_version}.tgz" "$openshell_archive"

echo "Prepared OpenShell ${openshell_version} and Agent Sandbox ${agent_sandbox_version} as locked Helm dependencies."
