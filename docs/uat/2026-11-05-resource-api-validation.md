# Independent resource API and V3 navigation validation

Verified on 2026-11-05 against the local production build at `http://127.0.0.1:18087`.
These changes extend v0.2.27; no new release has been published for this implementation yet.

## Delivered

- 36 independent resource operations under `/api/nmgr/v1`, retaining the existing 12 documented operations. Swagger now describes 48 operations, 44 schemas and 14 page mappings.
- Guardrail/Profile lists and detail, implementation, revisions, evaluation candidates/history/detail, approvals, deployments, current jobs and recovery, audit, dashboard and explicit NeMo import.
- Shared existing identity/control-unit scope, concurrency, idempotency, NeMo/F5 synchronization and failure isolation. No database migration, new dependencies or new live mock data.
- Structured `api_request_completed` logs with request/operation IDs, templated routes, timing, safe resource/command metadata and optional F5 operation reference. No tokens, request bodies or query values.
- V3 page/detail hash routing and real TanStack history entries. Browser Back/Forward and refresh restore V3 pages; explicit Mock links remain available.

## Evidence

| Check | Result |
|---|---|
| Complete Control suite | 205 files passed, 3 skipped; 1261 tests passed, 9 skipped |
| Runner and example MCP suites | 26 tests passed, 1 skipped |
| Workspace typechecks | All passed |
| Production build | Passed |
| Real HTTP/OpenAPI audit | 33 responses validated; 44 schemas compiled; 41 persisted resources |
| Legacy/resource API parity | Guardrail/Profile visible IDs and counts matched |
| Browser | User/Tech switch, Profile list/detail, Back, Forward, refresh detail and Back to list stayed in V3 |
| Independent review | Four findings addressed with failing-to-passing regression tests |

Audit command:

```powershell
node scripts/uat/validate-v3-openapi.mjs http://127.0.0.1:18087
```

The HTTP audit queried real configured NeMo and database state and connection probes. It did not create, publish or delete business resources. Invalid requests were rejected before workflow mutation. Automated tests cover new create/idempotency, stale writes, independent approval, pending/uncertain evaluation and existing NeMo/F5 provider workflows.

Review fixes: Profile deployment evaluations included in history/detail; Skip to content no longer overwrites the routing hash; TanStack assigns unique history indexes/keys; connection operation log IDs match Swagger. Special prototype-named query parameters are explicitly rejected.

## Deliberate compatibility choices

- `/api/nmgr/v1` avoids collision with the separately implemented TaskLattice `/api/v1` control-plane API.
- Existing bundled V3 remains a compatible workspace/commands consumer; new independent UI clients can use resource APIs immediately.
- Current job IDs equal resource IDs, and subsequent workflows may replace them. Approvals/deployments expose current resource workflow, not invented immutable history records.
- Import remains synchronous/atomic. Pending provider tasks still need explicit advance/reconcile; no unimplemented autonomous worker is advertised.

## Limits

No real F5 target instance is available; F5 contract, workflow and isolation regression tests passed, but deployment-time target acceptance is still required. Measure, feedback, runtime traffic tracing, Bypass/Kill Switch and runner monitoring remain unavailable capabilities. Dashboard traffic metrics are null, not fabricated zero counts.

See [page-by-page API and debugging guide](../resource-api.md).
