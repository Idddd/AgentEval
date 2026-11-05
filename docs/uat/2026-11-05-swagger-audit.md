# V3 page/API and Swagger contract audit

Verified 2026-11-05 against the current Marketplace V3 implementation. This is the NMGR integration application, not the separate TaskLattice `/api/v1` control-plane API or legacy Marketplace CRUD/simulation contracts.

## Result

- Swagger documents 12 HTTP operations, 29 named request/response schemas and 14 page/capability mappings.
- Existing live V3 screens obtain state from `GET /api/nmgr/workspace` and execute workflow changes with `POST /api/nmgr/commands`. The shared endpoint is intentional; every screen does not require a separate route.
- Connection configuration/probes, runtime flags, health, readiness, individual resource observation and the NeMo discovery header are documented.
- Fixed previously unconstrained/missing response fields: imports, published Policy bindings, F5 Scanner/Project identities, entity revisions, evaluation evidence/results, jobs, actors, audit, connection status, readiness and runtime configuration.
- Required fields, optional/nullable values, enum values, conditional bearer authentication, errors and diagnostic correlation headers are described. Request schemas continue to derive from the actual Zod validators.
- `/api/endpoints` now includes `pages`, with page roles, supported operations, command types, response field paths and limitations. The same mapping is visible at the top of Swagger.

## Live coverage

| Page | Data / operation |
|---|---|
| Connection settings | connection GET/POST/DELETE, connection/test POST, runtime GET, ready GET |
| Control Intents / Guardrail Requests / detail | workspace; create/edit/revise/implement/request/withdraw/advance/reconcile |
| Configure Profiles / detail | workspace and bindings; create/edit/revise/request/withdraw/advance/reconcile |
| Guardrail Evaluation | workspace runs/evidence; evaluate/advance/reconcile |
| Guardrail / Profile Signoff | workspace and audit; approve/reject |
| Guardrail / Profile Deployment | workspace and jobs; deploy/advance/reconcile |
| Dashboard / Profile operations drawer | workspace configuration and pinned releases, read-only |
| Trace | workspace audit, configuration workflow history only |

## Remaining backend gaps

These are explicitly marked `mock-only` or `unavailable`, not advertised as working endpoints:

- Measure, scan details, feedback and feedback closure: V2 browser-local examples/placeholders; no live V3 endpoint.
- Runtime traffic metrics and conversation scan traces: disconnected. Workflow audit is available, runtime traces are not.
- Runtime Bypass / Kill Switch / Monitoring / Preventing: V3 controls disabled; no runtime-mode mutation API.
- Tech runners and protection monitoring: V2 placeholder views.

This audit does not implement those backend capabilities or turn existing Mock examples into live data.

## Verification

- 57 tests passed in eight relevant suites. Tests compile every schema, resolve references, validate command examples, reject incorrect nested types, cover visible navigation/browser API calls, and validate actual NeMo/F5 workflow and connection-handler outputs against Swagger.
- TypeScript and production build passed.
- Production HTTP audit passed: 15 actual responses against 29 schemas, including 39 real persisted resources, role-specific snapshots, NeMo Policy/Guardrail observations, connection probes and a deliberately invalid command rejected before any mutation.
- Browser rendered OpenAPI 3.1, all 29 schemas, the coverage table and conditional Authorize control without a rendering error.
- Independent review found two incorrect map-field descriptions; corrected to `bindings[resourceId@businessVersion].publishedRefs`.

Repeat the non-business-mutating HTTP audit after starting a configured local V3:

```powershell
node scripts/uat/validate-v3-openapi.mjs http://127.0.0.1:18087
```

The script reads the served OpenAPI document, validates live responses and probes existing configured connections. Optional strict-mode authorization comes from `V3_USER_TOKEN`, never a command-line token. It does not create or release business resources. Database readiness may initialize application tables on a fresh database, consistent with the existing readiness endpoint.

Local documentation: `http://127.0.0.1:18087/api/docs`; schema JSON: `/api/openapi.json`; machine-readable operation/page inventory: `/api/endpoints`.
