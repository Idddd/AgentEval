"""Agent manifest parsing and validation for the marketplace.

A manifest describes an externally built Agent: identity, digest-pinned
container image, the eval contract it implements, resource needs, declared
secrets (names only), and its tool declarations. Validation is explicit
Python; every error names the offending field path.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import yaml

SUPPORTED_MANIFEST_VERSION = 1
SUPPORTED_PROTOCOL = "agent-eval/v1"

MAX_CPU = 2.0
MAX_MEMORY_MIB = 2048
MAX_TIMEOUT_PER_CASE_S = 600

_SECRET_NAME_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
_DIGEST_RE = re.compile(r"@sha256:[0-9a-f]{64}$")


class ManifestError(ValueError):
    """Raised when a manifest is structurally or semantically invalid."""


@dataclass(frozen=True)
class ToolSpec:
    name: str
    sensitivity: str
    input_schema: dict[str, Any]
    verification_required: bool


@dataclass(frozen=True)
class AgentManifest:
    agent_id: str
    version: str
    display_name: str
    description: str
    image_digest: str
    protocol: str
    port: int
    cpu: str
    memory: str
    timeout_per_case_s: int
    secrets: tuple[str, ...]
    llm_endpoints: tuple[str, ...]
    tools: tuple[ToolSpec, ...]
    raw: str


def _require(mapping: Any, key: str, path: str) -> Any:
    if not isinstance(mapping, dict) or key not in mapping or mapping[key] in (None, ""):
        raise ManifestError(f"Field '{path}' is required and missing")
    return mapping[key]


def _parse_cpu(value: Any) -> str:
    try:
        cores = float(str(value))
    except ValueError:
        raise ManifestError("Field 'runtime.resources.cpu' must be a number of cores") from None
    if not 0 < cores <= MAX_CPU:
        raise ManifestError(
            f"Field 'runtime.resources.cpu' must be in (0, {MAX_CPU}]; got {value}")
    return str(value)


def _parse_memory(value: Any) -> str:
    text = str(value)
    match = re.fullmatch(r"(\d+)(Mi|Gi)", text)
    if not match:
        raise ManifestError("Field 'runtime.resources.memory' must look like 512Mi or 1Gi")
    mib = int(match.group(1)) * (1024 if match.group(2) == "Gi" else 1)
    if not 0 < mib <= MAX_MEMORY_MIB:
        raise ManifestError(
            f"Field 'runtime.resources.memory' must not exceed {MAX_MEMORY_MIB}Mi; got {text}")
    return text


def parse_manifest(yaml_text: str) -> AgentManifest:
    try:
        data = yaml.safe_load(yaml_text)
    except yaml.YAMLError as error:
        raise ManifestError(f"Manifest is not valid YAML: {error}") from error
    if not isinstance(data, dict):
        raise ManifestError("Manifest must be a YAML mapping")

    if data.get("manifest_version") != SUPPORTED_MANIFEST_VERSION:
        raise ManifestError(
            f"Field 'manifest_version' must be {SUPPORTED_MANIFEST_VERSION}; "
            f"got {data.get('manifest_version')!r}")

    agent_id = str(_require(data, "agent_id", "agent_id"))
    version = str(_require(data, "version", "version"))

    runtime = data.get("runtime")
    if not isinstance(runtime, dict):
        raise ManifestError("Field 'runtime' is required and missing (needs runtime.image)")
    image = str(_require(runtime, "image", "runtime.image"))
    if not _DIGEST_RE.search(image):
        raise ManifestError(
            "Field 'runtime.image' must be pinned by digest (…@sha256:<64 hex>); "
            "tags are not accepted")
    protocol = str(runtime.get("protocol") or "")
    if protocol != SUPPORTED_PROTOCOL:
        raise ManifestError(
            f"Field 'runtime.protocol' must be '{SUPPORTED_PROTOCOL}'; got {protocol!r}")
    port_raw = _require(runtime, "port", "runtime.port")
    if not isinstance(port_raw, int) or not 1 <= port_raw <= 65535:
        raise ManifestError(f"Field 'runtime.port' must be an integer port; got {port_raw!r}")

    resources = runtime.get("resources") or {}
    cpu = _parse_cpu(resources.get("cpu", "1"))
    memory = _parse_memory(resources.get("memory", "1Gi"))
    timeout = runtime.get("timeout_per_case_s", 120)
    if not isinstance(timeout, int) or not 0 < timeout <= MAX_TIMEOUT_PER_CASE_S:
        raise ManifestError(
            f"Field 'runtime.timeout_per_case_s' must be in (0, {MAX_TIMEOUT_PER_CASE_S}]; "
            f"got {timeout!r}")

    capabilities = data.get("capabilities") or {}
    secrets = []
    for entry in capabilities.get("secrets") or []:
        name = str(entry)
        if not _SECRET_NAME_RE.fullmatch(name):
            raise ManifestError(
                f"Field 'capabilities.secrets' accepts environment-variable NAMES only "
                f"(UPPER_SNAKE_CASE); {name!r} looks like a value")
        secrets.append(name)
    llm_endpoints = tuple(str(e) for e in capabilities.get("llm_endpoints") or [])

    tools = []
    for index, entry in enumerate(data.get("tools") or []):
        path = f"tools[{index}]"
        name = str(_require(entry, "name", f"{path}.name"))
        sensitivity = str(entry.get("sensitivity", "low"))
        if sensitivity not in ("low", "high"):
            raise ManifestError(f"Field '{path}.sensitivity' must be 'low' or 'high'")
        schema = entry.get("input_schema")
        if not isinstance(schema, dict):
            raise ManifestError(f"Field '{path}.input_schema' must be a JSON-schema mapping")
        tools.append(ToolSpec(name=name, sensitivity=sensitivity, input_schema=schema,
                              verification_required=bool(entry.get("verification_required"))))

    return AgentManifest(
        agent_id=agent_id,
        version=version,
        display_name=str(data.get("display_name") or agent_id),
        description=str(data.get("description") or ""),
        image_digest=image,
        protocol=protocol,
        port=port_raw,
        cpu=cpu,
        memory=memory,
        timeout_per_case_s=timeout,
        secrets=tuple(secrets),
        llm_endpoints=llm_endpoints,
        tools=tuple(tools),
        raw=yaml_text,
    )
