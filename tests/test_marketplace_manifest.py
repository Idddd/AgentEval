"""Manifest parsing and validation (plan Task 1, Steps 1-3)."""
import pytest

from src.marketplace.manifest import AgentManifest, ManifestError, parse_manifest

VALID = """
manifest_version: 1
agent_id: acme/travel-planner
version: 1.4.0
display_name: Travel Planner
description: Plans multi-leg trips.
runtime:
  image: localhost:5001/acme/travel-planner@sha256:{digest}
  protocol: agent-eval/v1
  port: 8080
  resources:
    cpu: "1"
    memory: 1Gi
  timeout_per_case_s: 120
capabilities:
  llm_endpoints: [anthropic]
  secrets: [ANTHROPIC_AUTH_TOKEN]
tools:
  - name: book_flight
    sensitivity: high
    input_schema: {{"type": "object"}}
    verification_required: true
""".format(digest="a" * 64)


def test_valid_manifest_parses_into_frozen_dataclass():
    m = parse_manifest(VALID)
    assert isinstance(m, AgentManifest)
    assert m.agent_id == "acme/travel-planner"
    assert m.version == "1.4.0"
    assert m.image_digest.endswith("@sha256:" + "a" * 64)
    assert m.protocol == "agent-eval/v1"
    assert m.port == 8080
    assert m.cpu == "1"
    assert m.memory == "1Gi"
    assert m.timeout_per_case_s == 120
    assert m.secrets == ("ANTHROPIC_AUTH_TOKEN",)
    assert m.llm_endpoints == ("anthropic",)
    assert m.tools[0].name == "book_flight"
    assert m.tools[0].sensitivity == "high"
    assert m.tools[0].verification_required is True
    with pytest.raises(Exception):
        m.port = 9090


def test_tagged_image_is_rejected():
    bad = VALID.replace("@sha256:" + "a" * 64, ":latest")
    with pytest.raises(ManifestError, match="runtime.image"):
        parse_manifest(bad)


def test_unknown_manifest_version_and_protocol_are_rejected():
    with pytest.raises(ManifestError, match="manifest_version"):
        parse_manifest(VALID.replace("manifest_version: 1", "manifest_version: 2"))
    with pytest.raises(ManifestError, match="runtime.protocol"):
        parse_manifest(VALID.replace("agent-eval/v1", "agent-eval/v9"))


@pytest.mark.parametrize("cut,field", [
    ("agent_id: acme/travel-planner", "agent_id"),
    ("version: 1.4.0", "version"),
    ("  image: localhost:5001/acme/travel-planner@sha256:" + "a" * 64, "runtime.image"),
    ("  port: 8080", "runtime.port"),
])
def test_missing_required_fields_name_the_field_path(cut, field):
    with pytest.raises(ManifestError, match=field.replace(".", r"\.")):
        parse_manifest(VALID.replace(cut, ""))


@pytest.mark.parametrize("bad_secret", ["TOKEN=abc123", "MY SECRET", "sk-realvalue123"])
def test_secret_values_are_rejected_names_only(bad_secret):
    bad = VALID.replace("[ANTHROPIC_AUTH_TOKEN]", f'["{bad_secret}"]')
    with pytest.raises(ManifestError, match="capabilities.secrets"):
        parse_manifest(bad)


@pytest.mark.parametrize("orig,repl,field", [
    ('cpu: "1"', 'cpu: "4"', "cpu"),
    ("memory: 1Gi", "memory: 8Gi", "memory"),
    ("timeout_per_case_s: 120", "timeout_per_case_s: 9000", "timeout_per_case_s"),
])
def test_resources_above_platform_caps_are_rejected(orig, repl, field):
    with pytest.raises(ManifestError, match=field):
        parse_manifest(VALID.replace(orig, repl))
