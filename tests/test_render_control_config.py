from __future__ import annotations

import os
import tomllib
from pathlib import Path

from pytest import MonkeyPatch

from deploy.runtime.render_control_config import (
    DEFAULT_PASSWORD_HASH,
    database_url,
    main,
    render_control_config,
)


def test_database_url_defaults_to_loopback() -> None:
    assert database_url({}) == (
        "postgresql://tasklattice:development@127.0.0.1:5432/tasklattice"
    )


def test_database_url_percent_encodes_credentials() -> None:
    env = {
        "POSTGRES_USER": "demo user",
        "POSTGRES_PASSWORD": "p@ss/word",
        "POSTGRES_DB": "agent eval",
    }

    assert database_url(env) == (
        "postgresql://demo%20user:p%40ss%2Fword@127.0.0.1:5432/agent%20eval"
    )


def test_rendered_config_is_valid_toml_with_required_demo_values() -> None:
    rendered = render_control_config(
        {
            "TASKLATTICE_PUBLIC_URL": "http://demo.local",
            "TASKLATTICE_ADMIN_USERNAME": "demo-admin",
        }
    )

    config = tomllib.loads(rendered)
    assert config["server"]["public_url"] == "http://demo.local"
    assert config["database"]["url"] == database_url({})
    assert config["auth"]["local"] == {
        "enabled": True,
        "initial_super_admin_username": "demo-admin",
        "initial_super_admin_password_hash": DEFAULT_PASSWORD_HASH,
    }
    assert config["auth"]["oidc"]["enabled"] is False
    assert config["smtp"]["enabled"] is False


def test_main_writes_config_to_requested_path(
    tmp_path: Path, monkeypatch: MonkeyPatch
) -> None:
    output = tmp_path / "runtime" / "control.toml"
    monkeypatch.setenv("TASKLATTICE_CONFIG", str(output))
    monkeypatch.setenv("POSTGRES_DB", "custom-db")

    main(os.environ)

    config = tomllib.loads(output.read_text(encoding="utf-8"))
    assert config["database"]["url"].endswith("/custom-db")
