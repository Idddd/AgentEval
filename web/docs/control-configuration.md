# Control Plane configuration

TaskLattice Control reads one TOML file. Production starts only when
`TASKLATTICE_CONFIG` points to a valid file. The Helm chart renders this file
as the `control.toml` entry in the TaskLattice Secret and mounts it read-only at
`/etc/tasklattice/control.toml`.

```toml
schema_version = 1

[server]
# Optional for Local authentication; required when auth.oidc.enabled = true.
public_url = "https://tasklattice.example.com"
internal_url = "http://tasklattice-control"

[database]
url = "postgresql://tasklattice:password@postgresql:5432/tasklattice"

[auth]
session_signing_key = "replace-with-a-long-random-secret"

[auth.local]
enabled = true
initial_super_admin_username = "admin"
initial_super_admin_password_hash = "$2b$12$REPLACE_WITH_A_REAL_BCRYPT_HASH"

[auth.oidc]
enabled = true
display_name = "Company SSO"
issuer = "https://identity.example.com/realms/tasklattice"
client_id = "tasklattice-control-plane"
client_secret = "replace-me"

[runner]
url = "http://tasklattice-runner:9090"
token = "replace-me"

[litellm]
url = "http://tasklattice-litellm:4000"
master_key = "replace-me"

[smtp]
enabled = true
host = "smtp.example.com"
port = 587
secure = false
username = "tasklattice@example.com"
password = "replace-me"
from_address = "tasklattice@example.com"
from_name = "TaskLattice"
reply_to = "support@example.com"
```

At least one authentication provider must be enabled. `server.public_url` is
optional for Local authentication and has no relationship to the Kubernetes
Service type. When OIDC is enabled, it is required and redirect URIs are
derived as `<server.public_url>/auth/sso/callback`; scopes are fixed to
`openid profile email`. Internal callbacks prefer `server.internal_url`, so
they do not depend on a public LoadBalancer, Route, or Ingress address.

SMTP is optional, but invitations to email addresses that do not already map
to a TaskLattice user are rejected unless `smtp.enabled = true`. SMTP also
requires `server.public_url`; invitation emails use it as the browser-visible
sign-in link. Set `secure = true` for implicit TLS, normally on port 465. For
port 587, keep `secure = false` so the transport can upgrade with STARTTLS.
`username` and `password` must either both be configured or both be empty for
an unauthenticated internal relay. SMTP credentials live inside
`control.toml`, so the file must remain a Secret.

## Identity ownership

The TOML file enables authentication providers. PostgreSQL remains the source
of truth for users, credentials, system roles, account status, personal
preferences, and Project memberships.

When Local authentication is enabled, the initial Super Administrator values
are used only if the database has no Super Administrator or the SQL-seeded
administrator has no credential yet. They never overwrite a database password.
Local login and My Account password changes use the bcrypt hash in
`local_credentials`.

OIDC login identifies an external identity by the exact `(issuer, subject)`
pair. The first successful login creates a local `users` row and a
`user_identities` mapping. Later logins resolve the same local user even when
the IdP username or email changes. An email collision with another local user
is rejected instead of automatically linking accounts.

TaskLattice sessions use the local `users.id` as their subject. Project
authorization is loaded exclusively from `project_members`, including for the
bootstrap Super Administrator. The system-level `super_administrator` role is
reserved for platform setup, administration, and cross-Project audit
capabilities; it never grants implicit access to Project business operations.

The configuration file contains credentials and must be treated as a secret.
Do not commit a deployed `control.toml`; `control.example.toml` is the tracked
template.

For complete SSO integration tests, the Helm Chart can generate this OIDC
section and deploy a preconfigured ephemeral Keycloak instance. Enable it with
`keycloak.enabled=true` and set `keycloak.publicUrl` to an address reachable
from both users' browsers and the Control pod. See the Chart README for test
users and deployment examples.
