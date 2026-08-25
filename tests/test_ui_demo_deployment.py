from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
CHART = ROOT / "deploy" / "helm" / "tali-ui-demo"


def run(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=ROOT,
        env={**os.environ, **(env or {})},
        text=True,
        capture_output=True,
        check=False,
    )


def render_chart() -> list[dict[str, object]]:
    if shutil.which("helm"):
        result = run("helm", "template", "tali-ui-demo", str(CHART))
    else:
        result = run(
            "docker",
            "run",
            "--rm",
            "-v",
            f"{ROOT.as_posix()}:/workspace",
            "alpine/helm:3.18.4",
            "template",
            "tali-ui-demo",
            "/workspace/deploy/helm/tali-ui-demo",
        )
    assert result.returncode == 0, result.stderr
    return [item for item in yaml.safe_load_all(result.stdout) if item]


def test_dockerfile_has_static_nginx_runtime() -> None:
    """Catch backend runtimes or source dependencies entering the UI image."""
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")

    assert "AS ui-build" in dockerfile
    assert "TALI_UI_DEMO=true" in dockerfile
    assert "FROM nginx" in dockerfile
    assert "FROM postgres" not in dockerfile
    assert "requirements.txt" not in dockerfile
    assert "/opt/tali/helm/tali-UI-demo.tgz" in dockerfile
    assert "apps/control/dist/client/_shell.html" in dockerfile
    assert "node_modules" not in dockerfile.split(" AS runtime", maxsplit=1)[-1]


def test_nginx_supports_health_and_deep_link_fallback() -> None:
    """Catch a static server that fails Kubernetes probes or refreshed routes."""
    config = (ROOT / "deploy" / "ui-demo" / "nginx.conf").read_text(
        encoding="utf-8"
    )

    assert "listen 8080" in config
    assert "location = /healthz" in config
    assert "try_files $uri $uri/ /_shell.html" in config
    assert "proxy_pass" not in config


def test_compose_renders_one_stateless_ui_service() -> None:
    """Catch accidental restoration of the database, API, or persistent volume."""
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))

    assert list(compose["services"]) == ["tali-ui-demo"]
    service = compose["services"]["tali-ui-demo"]
    assert service["ports"] == ["127.0.0.1:18082:8080"]
    assert "volumes" not in service
    assert "environment" not in service
    assert "volumes" not in compose


def test_published_image_override_selects_the_ui_image() -> None:
    """Catch an override that deploys the retired all-in-one artifact."""
    override = yaml.safe_load(
        (ROOT / "docker-compose.images.yml").read_text(encoding="utf-8")
    )
    service = override["services"]["tali-ui-demo"]

    assert service["image"] == (
        "${TALI_UI_DEMO_IMAGE:-ghcr.io/idddd/tali-ui-demo}:"
        "${TALI_UI_DEMO_IMAGE_TAG:-latest}"
    )


def test_chart_renders_only_the_ui_deployment_and_service() -> None:
    """Catch a Chart that reintroduces a backend, database, Secret, or PVC."""
    resources = render_chart()
    assert sorted(item["kind"] for item in resources) == ["Deployment", "Service"]

    deployment = next(item for item in resources if item["kind"] == "Deployment")
    containers = deployment["spec"]["template"]["spec"]["containers"]
    assert len(containers) == 1
    container = containers[0]
    assert container["ports"] == [{"containerPort": 8080, "name": "http", "protocol": "TCP"}]
    assert container["readinessProbe"]["httpGet"]["path"] == "/healthz"
    assert container["livenessProbe"]["httpGet"]["path"] == "/healthz"


def test_workflow_publishes_ui_image_and_same_embedded_chart() -> None:
    """Catch publication drift between the image and its embedded OCI Chart."""
    workflow = yaml.safe_load(
        (ROOT / ".github" / "workflows" / "container-images.yml").read_text(
            encoding="utf-8"
        )
    )
    jobs = workflow["jobs"]
    serialized = yaml.safe_dump(jobs)

    assert list(jobs) == ["build"]
    assert serialized.count("docker/build-push-action") == 1
    assert "ghcr.io/${GITHUB_REPOSITORY_OWNER,,}/tali-ui-demo" in serialized
    assert "/opt/tali/helm/tali-UI-demo.tgz" in serialized
    assert "helm push" in serialized
    assert "/charts" in serialized
    assert "/opt/agenteval" not in serialized


def test_compose_cli_resolves_the_ui_service() -> None:
    """Catch interpolation or merge errors not visible from individual YAML files."""
    result = run("docker", "compose", "config", "--format", "json")
    assert result.returncode == 0, result.stderr
    compose = json.loads(result.stdout)
    assert list(compose["services"]) == ["tali-ui-demo"]
