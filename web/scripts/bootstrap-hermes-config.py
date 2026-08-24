#!/opt/hermes/.venv/bin/python3
"""Apply TaskLattice inference routing without weakening Hermes' hash anchor."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile

import yaml


HASH_LINE = re.compile(r"^([0-9a-f]{64})  (.+)$")
MCP_LINE = re.compile(
    r"^# nemoclaw-hermes-mcp-state-v1 intended=([0-9a-f]{64}) applied=([0-9a-f]{64})$"
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require_directory(path: Path) -> None:
    metadata = path.lstat()
    if not stat.S_ISDIR(metadata.st_mode):
        raise RuntimeError(f"Refusing non-directory Hermes path: {path}")


def require_regular_file(path: Path) -> None:
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
        raise RuntimeError(f"Refusing non-regular Hermes file: {path}")


def atomic_write(path: Path, data: bytes, mode: int) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        if hasattr(os, "fchmod"):
            os.fchmod(descriptor, mode)
        else:
            os.chmod(temporary, mode)
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def mcp_digest(config: Path, builder: Path, guard: Path) -> str:
    result = subprocess.run(
        [
            sys.executable,
            "-I",
            str(builder),
            "--guard",
            str(guard),
            "--config",
            str(config),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=15,
    )
    value = result.stdout.strip()
    if not re.fullmatch(r"[0-9a-f]{64}", value):
        raise RuntimeError("Hermes MCP digest builder returned an invalid digest")
    return value


def parse_anchor(anchor: bytes, config: Path, env: Path) -> tuple[str, str, str]:
    lines = anchor.decode("utf-8").splitlines()
    if len(lines) != 3:
        raise RuntimeError("Hermes hash anchor has an unexpected shape")
    config_match = HASH_LINE.fullmatch(lines[0])
    env_match = HASH_LINE.fullmatch(lines[1])
    mcp_match = MCP_LINE.fullmatch(lines[2])
    if not config_match or config_match.group(2) != str(config):
        raise RuntimeError("Hermes config hash anchor is invalid")
    if not env_match or env_match.group(2) != str(env):
        raise RuntimeError("Hermes env hash anchor is invalid")
    if not mcp_match or mcp_match.group(1) != mcp_match.group(2):
        raise RuntimeError("Hermes MCP hash anchor is not in a clean state")
    return config_match.group(1), env_match.group(1), mcp_match.group(1)


def use_environment_key_in_section(
    config: str, section_name: str, credential_placeholder: str
) -> str:
    section = re.search(
        rf"(?m)^{re.escape(section_name)}:\n(?P<body>(?:^[ \t].*\n)+)",
        config,
    )
    if not section:
        raise RuntimeError(f"Hermes config does not contain a {section_name} section")
    body, count = re.subn(
        r"(?m)^    api_key: (?:sk-OPENSHELL-PROXY-REWRITE|\"\"|\"openshell:resolve:env:[^\"]+\")$",
        f"    api_key: {json.dumps(credential_placeholder)}",
        section.group("body"),
        count=1,
    )
    if count != 1:
        raise RuntimeError(
            f"Hermes {section_name} credential field has an unexpected shape"
        )
    body = re.sub(r"(?m)^    key_env: OPENAI_API_KEY\n", "", body)
    return config[: section.start("body")] + body + config[section.end("body") :]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--hash-file", type=Path, required=True)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--template-endpoint", required=True)
    parser.add_argument("--template-model", required=True)
    parser.add_argument(
        "--mcp-digest-builder",
        type=Path,
        default=Path("/usr/local/lib/nemoclaw/build-hermes-mcp-digest.py"),
    )
    parser.add_argument(
        "--runtime-config-guard",
        type=Path,
        default=Path("/usr/local/lib/nemoclaw/hermes-runtime-config-guard.py"),
    )
    args = parser.parse_args()

    config = args.config
    hash_file = args.hash_file
    if not config.is_absolute() or not hash_file.is_absolute():
        raise RuntimeError("Hermes bootstrap paths must be absolute")
    if config.parent != hash_file.parent:
        raise RuntimeError("Hermes config and hash anchor must share a directory")
    env = config.parent / ".env"
    require_directory(config.parent.parent)
    require_directory(config.parent)
    for path in (
        config,
        env,
        hash_file,
        args.mcp_digest_builder,
        args.runtime_config_guard,
    ):
        require_regular_file(path)
    original_config = config.read_bytes()
    original_env = env.read_bytes()
    original_anchor = hash_file.read_bytes()
    config_hash, env_hash, anchored_mcp = parse_anchor(original_anchor, config, env)
    if digest(original_config) != config_hash or digest(original_env) != env_hash:
        raise RuntimeError("Hermes persisted inputs already differ from the image anchor")
    if mcp_digest(config, args.mcp_digest_builder, args.runtime_config_guard) != anchored_mcp:
        raise RuntimeError("Hermes MCP configuration already differs from the image anchor")

    current = original_config.decode("utf-8")
    if (
        args.template_endpoint not in current
        and args.endpoint not in current
    ) or (
        args.template_model not in current
        and args.model not in current
    ):
        raise RuntimeError("Hermes config does not contain the expected inference template")
    updated = current.replace(args.template_endpoint, args.endpoint).replace(
        args.template_model, args.model
    )
    document = yaml.safe_load(updated)
    upstream = document.get("_nemoclaw_upstream", {}).get("provider")
    if not isinstance(upstream, str) or not upstream:
        raise RuntimeError("Hermes config does not declare its upstream provider")
    credential_placeholder = os.environ.get("OPENAI_API_KEY", "")
    if not re.fullmatch(
        r"openshell:resolve:env:[A-Za-z0-9_]*OPENAI_API_KEY",
        credential_placeholder,
    ):
        raise RuntimeError(
            "OPENAI_API_KEY is not an OpenShell environment credential placeholder"
        )

    model_section = re.search(r"(?m)^model:\n(?P<body>(?:^[ \t].*\n)+)", updated)
    if not model_section:
        raise RuntimeError("Hermes config does not contain a model section")
    model_body = model_section.group("body")
    model_body, provider_count = re.subn(
        r"(?m)^  provider: (?:custom|" + re.escape(upstream) + r")$",
        "  provider: custom",
        model_body,
        count=1,
    )
    model_body, model_key_count = re.subn(
        r"(?m)^  api_key: (?:sk-OPENSHELL-PROXY-REWRITE|\"\"|\"openshell:resolve:env:[^\"]+\")$",
        f"  api_key: {json.dumps(credential_placeholder)}",
        model_body,
        count=1,
    )
    if provider_count != 1 or model_key_count != 1:
        raise RuntimeError("Hermes model credential fields have an unexpected shape")
    updated = (
        updated[: model_section.start("body")]
        + model_body
        + updated[model_section.end("body") :]
    )

    updated = use_environment_key_in_section(
        updated, "providers", credential_placeholder
    )
    updated = use_environment_key_in_section(
        updated, "custom_providers", credential_placeholder
    )
    validated = yaml.safe_load(updated)
    if (
        validated.get("model", {}).get("provider") != "custom"
        or validated.get("model", {}).get("api_key") != credential_placeholder
    ):
        raise RuntimeError("Hermes model provider migration did not apply")
    providers = validated.get("providers", {})
    custom = validated.get("custom_providers", [])
    if providers.get(upstream, {}).get("api_key") != credential_placeholder or not any(
        item.get("name") == upstream and item.get("api_key") == credential_placeholder
        for item in custom
        if isinstance(item, dict)
    ):
        raise RuntimeError("Hermes provider credential placeholder migration did not apply")
    updated_config = updated.encode("utf-8")
    config_mode = config.stat().st_mode & 0o7777
    anchor_mode = hash_file.stat().st_mode & 0o7777

    try:
        atomic_write(config, updated_config, config_mode)
        if mcp_digest(config, args.mcp_digest_builder, args.runtime_config_guard) != anchored_mcp:
            raise RuntimeError("Inference routing unexpectedly changed Hermes MCP configuration")
        updated_anchor = (
            f"{digest(updated_config)}  {config}\n"
            f"{digest(original_env)}  {env}\n"
            f"# nemoclaw-hermes-mcp-state-v1 intended={anchored_mcp} applied={anchored_mcp}\n"
        ).encode("utf-8")
        atomic_write(hash_file, updated_anchor, anchor_mode)
    except BaseException:
        atomic_write(config, original_config, config_mode)
        atomic_write(hash_file, original_anchor, anchor_mode)
        raise


if __name__ == "__main__":
    main()
