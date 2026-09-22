# Marketplace database and provider synchronization

Marketplace owns complete Policy and Guardrail Profile records in an independent
SQLite database (Node 24 built-in SQLite, one server process). The browser uses
Marketplace CRUD endpoints, not provider writes. Business fields are stored here;
provider adapters use explicit field allowlists. Nemo continues using its existing
Controller database and F5 continues using the local simulated API. No evaluation,
publication or activation is introduced.

Records have stable Marketplace IDs, a provider ID, local revision, last provider
snapshot and durable synchronization state. Existing provider records are imported
once per source, with references translated to Marketplace IDs. Writes commit locally
before contacting the provider. Successful writes update the provider mapping;
failures retain the local record and expose a retry action. Deletion is a tombstone
until provider deletion succeeds. Referenced policies cannot be deleted.

Create requests have idempotency keys. An interrupted or ambiguous remote creation
is not repeated blindly. Local CRUD uses optimistic revision checks. Local-only
metadata edits do not write to providers. Imports do not overwrite locally owned
business fields. The existing local Guard identity and module permissions protect
the endpoints; this does not add shared intranet authentication or multi-tenancy.

Runtime: `MARKETPLACE_DB_FILE` is an absolute persistent SQLite path. Back up this
file using SQLite backup/checkpoint tooling; keep it outside release directories.
WAL mode and foreign keys are enabled. A shared multi-replica deployment should
move this repository interface to PostgreSQL and use leased background jobs.

The browser-local metadata experiment is replaced by database fields. No credentials
are stored in records or shipped to browsers. Browser mock data is not automatically
imported. Initial upstream import failures are reported and may be retried.

Local deployment uses `.artifacts/guard-local/marketplace.sqlite`. The existing
`frontend.env` enables this path. API routes:

- `GET /api/marketplace/items` — local records and initial-import warnings.
- `POST /api/marketplace/{policies|guardrails}` — `{draft}` plus `Idempotency-Key`.
- `GET/PATCH/DELETE /api/marketplace/{kind}/{id}` — reads and optimistic updates;
  PATCH uses `{draft, expectedRevision}`, DELETE uses `{expectedRevision}`.
- `POST /api/marketplace/{kind}/{id}/sync` — retry/reconcile a failed operation.

Sync retries are explicit in this first version; no autonomous background worker
or continuous inbound synchronization is enabled. After initial import, edit records
through Marketplace. Upstream changes made in other tools are not automatically
merged. Provider credentials still use the existing local Guard identity setup.
Nemo policies remain drafts until actual implementations are provided and validated;
database synchronization does not imply deployment or successful evaluation.

Validation covers database reopen, source isolation, optimistic conflicts,
idempotent creation, field allowlisting, dependency protection, failed deletion,
ambiguous creation reconciliation, and local API CRUD against both providers.
