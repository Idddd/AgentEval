from __future__ import annotations

import json
import os
from collections.abc import Mapping
from pathlib import Path
from urllib.parse import quote


DEFAULT_PASSWORD_HASH = (
    "$2b$12$Zx2mCLJZ0n/iY4Tq.Z3eXu0O.z5SHM.pKJyNNurKX/Z7CD5HHOg.e"
)


def database_url(env: Mapping[str, str]) -> str:
    user = quote(env.get("POSTGRES_USER", "tasklattice"), safe="")
    password = quote(env.get("POSTGRES_PASSWORD", "development"), safe="")
    database = quote(env.get("POSTGRES_DB", "tasklattice"), safe="")
    return f"postgresql://{user}:{password}@127.0.0.1:5432/{database}"


def _toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def render_control_config(env: Mapping[str, str]) -> str:
    public_url = env.get(
        "TASKLATTICE_PUBLIC_URL", "http://127.0.0.1:18082"
    )
    username = env.get("TASKLATTICE_ADMIN_USERNAME", "admin")
    password_hash = env.get(
        "TASKLATTICE_ADMIN_PASSWORD_HASH", DEFAULT_PASSWORD_HASH
    )
    session_key = env.get(
        "TASKLATTICE_SESSION_SIGNING_KEY",
        "tasklattice-local-development-secret",
    )
    return f'''schema_version = 1

[server]
public_url = {_toml_string(public_url)}

[database]
url = {_toml_string(database_url(env))}

[auth]
session_signing_key = {_toml_string(session_key)}

[auth.local]
enabled = true
initial_super_admin_username = {_toml_string(username)}
initial_super_admin_password_hash = {_toml_string(password_hash)}

[auth.oidc]
enabled = false
display_name = "SSO"
issuer = ""
client_id = ""
client_secret = ""

[runner]
url = "http://127.0.0.1:9090"
token = "local-dev-token"

[litellm]
url = "http://127.0.0.1:4000"
master_key = ""

[smtp]
enabled = false
host = ""
port = 587
secure = false
username = ""
password = ""
from_address = ""
from_name = "TaskLattice"
reply_to = ""
'''


def main(env: Mapping[str, str] | None = None) -> None:
    values = os.environ if env is None else env
    output = Path(
        values.get("TASKLATTICE_CONFIG", "/run/agenteval/control.toml")
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_control_config(values), encoding="utf-8")


if __name__ == "__main__":
    main()
