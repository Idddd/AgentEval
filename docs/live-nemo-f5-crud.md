# Local Nemo live + F5 simulated API

Implemented 2026-09-21 for the local UI at port 18082.

## Runtime

Set these **server runtime** settings:

```dotenv
MARKETPLACE_DATA_MODE=live
MARKETPLACE_CRUD_ONLY=true
MARKETPLACE_F5_MOCK=true
F5_MOCK_DATA_FILE=/persistent/local/path/f5-data.json
GUARD_API_URL=http://127.0.0.1:18083/api/v1
HOST=127.0.0.1
MARKETPLACE_PUBLIC_ORIGIN=http://127.0.0.1:18082
```

`MARKETPLACE_DEMO_TOKEN` is the existing server-only local Guard credential.
Its loopback restrictions remain enforced. The F5 simulation also requires this
configuration and verifies the incoming identity against Guard. This is a local
integration setup, not a shared intranet authentication solution.

## Behavior

- Nemo list/create/update/delete uses the real Guard Controller and PostgreSQL.
- F5 `/api/f5/policies` and `/api/f5/guardrails` provide list, detail, POST,
  PATCH and DELETE. Their payload is the Marketplace entity contract, **not a
  claim of wire compatibility with the F5 vendor API**.
- F5 initializes sample records once, persists mutations through serialized
  atomic JSON file replacement, and preserves data across restarts. Run one
  server process per data file; use a database before multi-replica deployment.
- Source filters and same-source bindings work with both API-backed datasets.
- Multi-source Policy creation creates independent records. Partial success
  retains the successful record and removes that source from the retry selection.
- No new evaluation, publication or activation requests are performed in CRUD
  mode. The Guard proxy rejects publication and validation POSTs in this mode.
- New Nemo Policy text is saved as description with an explicitly unimplemented
  source file and missing flow. It is a real **Draft**, not an executable
  implementation. It cannot be published without configuring actual rules and
  satisfying the backend's validation requirements. Existing executable drafts
  are preserved on metadata edits.
- Nemo profiles can bind existing published Policy versions. New unpublished
  Nemo drafts cannot yet be selected. Built-in policies remain read-only, and
  active profiles remain locked; no fake deactivation is provided.
- F5 `Ready` means configuration stored in the simulation, not evaluation passed.
- F5 PATCH requires `expectedVersion`; deletion blocks referenced policies.
- With `MARKETPLACE_DB_FILE` configured, the independent Marketplace SQLite
  database owns complete records and business metadata. The browser reads/writes
  `/api/marketplace/*`; server adapters synchronize supported fields to Nemo/F5.
  Metadata-only edits stay in this database and support filtering across browsers.
  See [Marketplace database](marketplace-database.md) for persistence and sync behavior.
  Previous browser mock data is not migrated.

## Verification

- Unit/UI checks cover source isolation, multi-source creation, persistence,
  version conflicts, dependency-aware deletion, CRUD-only no-eval requests,
  proxy deletion and authentication boundaries.
- Local API audit created, read, updated and deleted isolated Policy and Profile
  fixtures on both sources. Invalid credentials and foreign Origin were rejected.
- No eval or publication was requested by the audit.

The local ignored configuration is `.artifacts/guard-local/frontend.env` and
F5 storage is `.artifacts/guard-local/f5-data.json`. Do not commit credentials
or local runtime data. The normal frontend build and restart apply changes.
