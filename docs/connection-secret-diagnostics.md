# V3 connection Secret diagnostics

Open `/v3/guardrails#connection`. The configuration screen shows the values the server received, independently of backend availability. `GET /api/nmgr/connection` includes an optional `values` map; Swagger documents the same response.

- `missing`: the environment variable was not supplied. Check the deployment's Secret name/key and environment mapping. The service does not query the Kubernetes API and cannot determine why an injection is missing.
- `empty`: a variable/file was received but contains no usable value.
- `unreadable`: the configured file could not be read; `ENOENT` means missing, `EACCES`/`EPERM` means access denied.
- `invalid`: the value was read but has an incompatible format, such as a Bearer prefix, JSON instead of a plain token, or an invalid API URL.
- `loaded`: read successfully; authentication and permissions still require the existing Test buttons.

Each field shows the effective source and safe preview. When saved settings override deployment settings, both are shown. Use deployment settings removes the existing shared manual overrides; refresh alone does not change configuration. Secret environment injections require a Pod restart after a Secret change; refresh reads the current process environment and re-reads mounted token files.

Tokens at least 12 characters long reveal only their last four characters and length. Short/invalid tokens and all passwords are masked. Database URLs hide credentials and query values. Previews are not copied into editable fields or submitted as credentials. Responses use `Cache-Control: no-store`; raw file errors and secret contents are not logged or returned. No NeMo/F5 requests are made for this diagnostic read.
