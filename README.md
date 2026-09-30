# AI Marketplace

AI Marketplace manages **Guardrails** and **Profiles**. Current release:
**v0.2.15**, image `ghcr.io/idddd/tali-ui-demo:0.2.15`.

## Current UI

- **Guardrails**: create requirements, implement and evaluate versions, and review readiness.
- **Profiles**: select Guardrails and versions, view statistics, and expand each Guardrail to inspect traces and errors.
- Each Guardrail in a Profile has its own **Monitoring** or **Preventing** mode. Submit the Profile's final mode configuration for approval as a whole. Pending changes do not replace approved modes.
- Monitoring records detections without blocking. Preventing records detections and actual blocks.
- Profile **Bypass** requires confirmation and skips all Guardrail checks. In mock mode, this simulates forwarding to the original upstream without creating traces. Exiting Bypass returns all Guardrails to Monitoring.
- Mock traffic is generated approximately every five seconds while the Profile overview is open and visible, including success, error, detection and, in Preventing mode, block.
- Local accounts include Admin, IT Admin, Line 1.5 and Line 2.

## Start the published image

Requires Docker. SQLite is included; no separate database service is needed.

```sh
docker pull ghcr.io/idddd/tali-ui-demo:0.2.15
docker run -d --name ai-marketplace -p 18082:8080 \
  ghcr.io/idddd/tali-ui-demo:0.2.15
```

Open [Profiles](http://127.0.0.1:18082/guardrails).
Guardrails are at `/policies`; Profiles are at `/guardrails`.

See [deployment and source export](docs/marketplace-release.md) for Helm,
JFrog and the embedded project source, or [runtime branding](docs/runtime-branding.md)
for logo and favicon replacement.

## Shared database and initial data

Mock mode uses server-side SQLite automatically. No enable switch is needed,
and database failures do not fall back to browser-only storage.

- Users of the same service share records; the UI polls about every three seconds.
- A new database is initialized with default examples on the first page visit.
- A revision check allows only the first successful initializer to write. Concurrent visitors read that result instead of appending duplicate examples.
- Once initialized, the database is authoritative. Later visitors do not import browser records. Account selection remains a browser preference.
- The image uses SQLite in memory, with one Pod and one server process. No PVC is required. Server restart clears the cases. Use the unlinked `/api/demo-backup` maintenance page to export and restore cases. See [backup instructions](docs/demo-memory-backup.md).
- Completed trace details are limited to 200 per Profile, 1,000 overall and 24 hours, with an additional size budget. Older details are folded into aggregate statistics. A total state size limit prevents oversized writes.

## Local development

Requires Node.js 22+ and npm.

```sh
cd web
npm ci
npm run dev:control -- --host 127.0.0.1 --port 18082
```

The server defaults to `data/demo.sqlite` relative to its working directory.
`MARKETPLACE_DEMO_DB_FILE` optionally changes the file location.

Build and run from `web/`:

```sh
npm run build:control
npm run start:control
```

## Live Guard connection

Mock is the default. To use a real Guard service, set `MARKETPLACE_DATA_MODE=live`
and `GUARD_API_URL` to its API endpoint. Users connect with personal access
tokens in the UI. Live mode uses the Guard backend instead of mock SQLite.

See [Guard API connection](docs/guard-openapi-connection.md) for supported
operations and optional authoring configuration.

## Verification

From `web/`:

```sh
node node_modules/typescript/bin/tsc -p apps/control/tsconfig.json --noEmit
cd apps/control
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/features/business-demo marketplace-server/shared-demo.test.ts marketplace-server/guard-api.test.ts
```

The [release workflow](.github/workflows/container-images.yml) checks image
startup, default database reads and writes, embedded source integrity and
the Helm chart before completing publication.
