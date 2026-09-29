# AI Marketplace UI

This directory contains the current Guardrails and Profiles UI.
See the [project README](../README.md) for features, shared database behavior
and the current release.

## Development

Requires Node.js 22+ and npm. Run from this directory:

```sh
npm ci
npm run dev:control -- --host 127.0.0.1 --port 18082
```

Open [Profiles](http://127.0.0.1:18082/guardrails) or
[Guardrails](http://127.0.0.1:18082/policies).

Mock mode uses server-side SQLite automatically. The first visit initializes
a new database from existing browser records or default examples. Subsequent
visitors use the same database. No database enable flag is required.

## Build

```sh
npm run build:control
npm run start:control
```

## UI source

| Path | Purpose |
| --- | --- |
| `apps/control/src/features/business-demo/` | UI, workflows, statistics and shared state |
| `apps/control/marketplace-server/` | SQLite API, Guard proxy, settings and branding |
| `../deploy/Dockerfile.marketplace` | Published image and embedded source |
| `../deploy/helm/tali-ui-demo/` | Current Helm chart |

## Documentation

- [Docker, Helm, JFrog and source export](../docs/marketplace-release.md)
- [Live Guard API connection](../docs/guard-openapi-connection.md)
- [Runtime branding](../docs/runtime-branding.md)
- [Verification commands](../README.md#verification)
