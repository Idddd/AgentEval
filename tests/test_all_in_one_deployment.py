from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def run(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=ROOT,
        env={**os.environ, **(env or {})},
        text=True,
        capture_output=True,
        check=False,
    )


def test_compose_renders_one_service() -> None:
    """Catch accidental restoration of the former three-container topology."""
    result = run("docker", "compose", "config", "--format", "json")
    assert result.returncode == 0, result.stderr
    compose = json.loads(result.stdout)

    assert list(compose["services"]) == ["agenteval"]
    service = compose["services"]["agenteval"]
    assert service["ports"][0]["published"] == "18082"
    assert service["ports"][0]["target"] == 8080
    assert service["volumes"][0]["target"] == "/var/lib/agenteval"
    assert list(compose["volumes"]) == ["agenteval-data"]


def test_published_image_override_renders_one_combined_image() -> None:
    """Catch an override that deploys separate API or Web images."""
    result = run(
        "docker",
        "compose",
        "-f",
        "docker-compose.yml",
        "-f",
        "docker-compose.images.yml",
        "config",
        "--format",
        "json",
        env={
            "AGENTEVAL_IMAGE": "registry.example/agenteval",
            "AGENTEVAL_IMAGE_TAG": "contract-test",
        },
    )
    assert result.returncode == 0, result.stderr
    compose = json.loads(result.stdout)

    assert list(compose["services"]) == ["agenteval"]
    assert compose["services"]["agenteval"]["image"] == (
        "registry.example/agenteval:contract-test"
    )


def test_runtime_shell_scripts_are_checked_out_with_lf() -> None:
    """Catch Windows checkout rules that make Linux entrypoints unexecutable."""
    result = run(
        "git",
        "check-attr",
        "eol",
        "--",
        "deploy/runtime/entrypoint.sh",
        "deploy/runtime/healthcheck.sh",
    )
    assert result.returncode == 0, result.stderr

    assert result.stdout.splitlines() == [
        "deploy/runtime/entrypoint.sh: eol: lf",
        "deploy/runtime/healthcheck.sh: eol: lf",
    ]


def test_python_and_postgres_stages_share_the_bookworm_runtime() -> None:
    """Catch glibc drift that makes Python fail in the final Postgres image."""
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert "FROM python:3.12-slim-bookworm AS api" in dockerfile
    assert "FROM postgres:17-bookworm AS runtime" in dockerfile


def test_runtime_recreates_node_cli_symlinks() -> None:
    """Catch Docker COPY dereferencing npm links into broken standalone files."""
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert "COPY --from=web-dependencies /usr/local/bin/npm" not in dockerfile
    assert "COPY --from=web-dependencies /usr/local/bin/npx" not in dockerfile
    assert "ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm" in dockerfile
    assert "ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx" in dockerfile


def test_chart_renders_one_recreate_deployment() -> None:
    """Catch a Chart that splits the Demo across Pods or scales its database."""
    result = run(
        "docker",
        "run",
        "--rm",
        "-v",
        f"{ROOT.as_posix()}:/workspace",
        "alpine/helm:3.18.4",
        "template",
        "agenteval",
        "/workspace/deploy/helm/agenteval",
    )
    assert result.returncode == 0, result.stderr
    resources = [item for item in yaml.safe_load_all(result.stdout) if item]
    deployments = [item for item in resources if item["kind"] == "Deployment"]

    assert len(deployments) == 1
    deployment = deployments[0]
    assert deployment["spec"]["replicas"] == 1
    assert deployment["spec"]["strategy"]["type"] == "Recreate"
    assert len(deployment["spec"]["template"]["spec"]["containers"]) == 1


def test_chart_rejects_multiple_replicas() -> None:
    """Catch scaling that would give each Pod an independent embedded database."""
    result = run(
        "docker",
        "run",
        "--rm",
        "-v",
        f"{ROOT.as_posix()}:/workspace",
        "alpine/helm:3.18.4",
        "template",
        "agenteval",
        "/workspace/deploy/helm/agenteval",
        "--set",
        "replicaCount=2",
    )

    assert result.returncode != 0
    assert "replicaCount must be 1" in result.stderr


def test_workflow_builds_one_image_and_pushes_the_embedded_chart() -> None:
    """Catch publication drift between the application image and Helm package."""
    workflow = yaml.safe_load(
        (ROOT / ".github/workflows/container-images.yml").read_text(
            encoding="utf-8"
        )
    )
    jobs = workflow["jobs"]
    serialized = yaml.safe_dump(jobs)

    assert list(jobs) == ["build"]
    assert serialized.count("docker/build-push-action") == 1
    assert "helm push" in serialized
    assert "/charts" in serialized
    assert "agenteval-api" not in serialized
    assert "agenteval-web" not in serialized
