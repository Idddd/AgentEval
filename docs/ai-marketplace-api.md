# AI Marketplace: UI and API contract

> Superseded for the active Guardrails/Policies UI: see
> [Guard OpenAPI connection](guard-openapi-connection.md) for runtime mock/live/auto
> modes and the Controller contract. The facade proposal below is historical.

> Design rollback: the active routes currently reuse the original Guardrails
> and Policy Library UI, with the AI Marketplace name and two sidebar entries.
> They use the original session mock providers. The adapter and proposed scope
> below are retained for future integration, not the current screen behavior.

## Scope

This branch turns the AgentEval frontend into a business-facing marketplace with
exactly two sections: `/guardrails` and `/templates`. Both support list, search,
business-area filtering, sorting, pagination, detail, and creation. Templates
can prefill a new Guardrail. Detail is addressable via `?item=<id>`; starting a
Guardrail from a template uses `/guardrails?template=<id>`.

There is no edit, delete, evaluation, deployment, approval, runtime/endpoint
management, or administration UI. Creating a Guardrail captures business intent
as a draft; it does not activate protection. Old project URLs redirect to the
Marketplace. The standalone UI does not mount the legacy authentication/project
providers or start their database jobs. Backend access control will be enforced
by the future API; the current sample workspace does not claim a signed-in user.

## Adapter boundary

`web/apps/control/src/features/marketplace/contracts.ts` is the executable Zod
contract; `api.ts` implements the HTTP and local preview adapters. The future
backend is a **Marketplace facade**, not a drop-in connection to Guard Controller.
Guard v0.2.4 has no independent business-template CRUD resource; `/templates`
below is deliberately a proposed Marketplace contract.

Default configuration makes **no backend requests**. Set
`VITE_MARKETPLACE_API_BASE_URL=/api/v1/marketplace` (when a same-origin facade is
available), or an absolute API base URL, to opt into HTTP. Vite reads this at
development startup/build time. Cross-origin integration requires backend CORS;
the adapter only sends cookies to same-origin URLs. SSO/cross-origin credential
support should be agreed when implementing the facade. Never embed Guard admin
credentials or Endpoint secrets in a `VITE_` variable.

## Endpoints

All paths are relative to `VITE_MARKETPLACE_API_BASE_URL`.

| Method | Path | Request | Success response |
| --- | --- | --- | --- |
| GET | `/guardrails` | None | `200 { items: MarketplaceResource[], count: number }` |
| GET | `/guardrails/{id}` | URL-encoded ID | `200 MarketplaceResource` |
| POST | `/guardrails` | `CreateResourceInput` | `201 MarketplaceResource`, status `draft` |
| GET | `/templates` | None | `200 { items: MarketplaceResource[], count: number }` |
| GET | `/templates/{id}` | URL-encoded ID | `200 MarketplaceResource` |
| POST | `/templates` | `CreateResourceInput` | `201 MarketplaceResource`, status `available` |

List endpoints return the complete collection for this initial UI; search,
filtering, sorting, and six-item pagination operate locally. Server pagination
is a future contract change and must not silently truncate these collections.
All responses are JSON, validated before rendering. Errors use an appropriate
HTTP status and `{ "message": "A user-facing explanation" }`.

Example creation body:

```json
{
  "name": "Customer support assistant",
  "description": "Answer product questions without exposing customer information.",
  "businessArea": "Customer service",
  "protections": ["personal-data", "topic-boundaries", "accurate-responses"],
  "checkpoints": ["input", "output"],
  "allowedTopics": ["Product information", "Order support"],
  "restrictedTopics": ["Other customers’ personal data"],
  "templateId": "template-customer-care"
}
```

Example response adds server-owned metadata:

```json
{
  "id": "guardrail-123",
  "kind": "guardrails",
  "name": "Customer support assistant",
  "description": "Answer product questions without exposing customer information.",
  "businessArea": "Customer service",
  "protections": ["personal-data", "topic-boundaries", "accurate-responses"],
  "checkpoints": ["input", "output"],
  "allowedTopics": ["Product information", "Order support"],
  "restrictedTopics": ["Other customers’ personal data"],
  "templateId": "template-customer-care",
  "status": "draft",
  "createdBy": "Business team",
  "createdAt": "2026-09-14T09:00:00Z",
  "updatedAt": "2026-09-14T09:00:00Z"
}
```

Names: 1–100 characters; descriptions: 1–2000 characters; at least one protection
and checkpoint. Topic lists allow at most 20 non-empty entries, each at most 200
characters. `templateId` is optional. The UI trims names/descriptions/topics and
omits blank topic lines before creating. Supported enums are in `contracts.ts`.

## Mapping to Guard v0.2.4

Source baseline: `tasklattice-guard/main`, `7b33ef8` (v0.2.4).

| Business field | Backend responsibility / Guard field |
| --- | --- |
| `name` | `POST /api/v1/guardrails` → `name` |
| `description`, `businessArea` | Marketplace metadata, stored by the facade; not invented Guard fields |
| `allowedTopics`, `restrictedTopics` | Guard `draftConfig.allowedTopics` / `restrictedTopics` |
| `protections` | Resolve suitable published Policy IDs/versions and rule settings server-side → `draftConfig.policyBindings` |
| `checkpoints` | `policyBindings[].enabledRails`, restricted in this UI to currently executable `input` / `output` |
| `templateId` | Resolve a reusable business-intent snapshot; no arbitrary code compilation in the browser |
| `status` | Facade supplies business-readable draft/availability metadata; not an enforcement-health claim |

The backend also owns `runtimeProfile`, `safetyLevel`, `outputDelivery`, model
bindings, authorization, version pinning, compilation, signing, validation and
deployment. Business protection identifiers are **intent identifiers**, not real
Guard Policy IDs. The frontend never manufactures policy versions or reports
test success. No Policy execution, LLM calls, or Guard Controller/Runner code was
added or changed.

Future runtime integration must use Guard's current
`/runtime/v1/endpoints/{endpoint_id}/...` paths. The older Relay
`/runtime/v1/integrations/...` paths are not used by Marketplace.

## Failure and preview behavior

- With no configured API: mock list/detail/create; zero HTTP calls.
- With an API: first read probes it. A timeout (3 seconds), network failure,
  unavailable catalog (404), throttling (429), 5xx, or non-contract payload
  switches the current adapter session to local preview. A banner explains the
  fallback. Reloading constructs a new client and retries the configured API.
- HTTP 401/403 and other validation/client errors remain errors, not sample data.
  A missing detail (404) stays missing rather than showing an unrelated item.
- Once in preview, all new items are local. Browser persistence is namespaced
  under `ai-marketplace.resources.v1`, isolated from legacy stores and API data.
  If storage is denied/full, entries remain in memory for the session.
- Live POST requests are never automatically retried or converted to mock
  success. An uncertain response preserves the form and asks the user to check
  the catalog before retrying. Future backend idempotency can extend this contract.
- Sample Guardrails are drafts. Preview copy explicitly says that no live
  traffic is protected. Reusing a template does not mutate the template.

## Verification

From `web/apps/control`:

```sh
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/features/marketplace
node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node ../../node_modules/vite/bin/vite.js build
```

API tests cover offline persistence, malformed responses, timeout/network/HTTP
fallback, real auth errors, list/detail/create contracts, uncertain submissions,
validation, and legacy navigation. Browser checks cover the two catalog views,
creation from scratch/from a template, detail, search/filtering, reload and mobile
layout.
