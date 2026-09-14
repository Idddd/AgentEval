# Guard OpenAPI connection

Baseline: tasklattice-guard `main` / `7b33ef8`, Controller OpenAPI 3.1,
`controller/openapi/controller.openapi.json` (82 paths, 98 operations).
The remote update could not be verified because GitHub was unreachable.

## One image, runtime configuration

`docker-compose.marketplace.yml` accepts these environment variables at container
startup. They are not Vite build variables; changing modes does not require rebuilding.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MARKETPLACE_DATA_MODE` | `mock` | `mock`, `live`, or `auto` |
| `GUARD_API_URL` | empty | Controller base URL **including `/api/v1`** |
| `GUARD_POLICY_AUTHORING_URL` | empty | Optional business-text-to-programmable-Policy service; see below |
| `MARKETPLACE_PUBLIC_ORIGIN` | empty | Exact browser origin behind a reverse proxy, e.g. `https://marketplace.internal.example` (no trailing slash) |

Mock:

```sh
docker compose -f docker-compose.marketplace.yml up -d --build
```

Live (PowerShell):

```powershell
$env:MARKETPLACE_DATA_MODE = "live"
$env:GUARD_API_URL = "https://guard.internal.example/api/v1"
docker compose -f docker-compose.marketplace.yml up -d --force-recreate
```

Use `MARKETPLACE_DATA_MODE=auto` for initial-connect fallback. An authenticated
initial read that cannot reach the backend opens the local dataset with an
`Offline · Local data` status and a Reconnect action. Authentication errors,
permission errors, invalid JSON/contracts, business validation errors and all
write failures **never trigger fallback**. Once connected, failed refreshes keep
the last remote snapshot with an error, not a replacement mock dataset.
An invalid runtime configuration fails closed.

Container URLs must be reachable **from the container**. `localhost` is the
frontend container itself. For a host service on Docker Desktop use
`http://host.docker.internal:<port>/api/v1`; for another Compose service use its
service DNS name. Prefer HTTPS for internal deployments. The compose file binds
the UI to host loopback by default; put an authenticated TLS reverse proxy in
front of it for intranet access.
Set `MARKETPLACE_PUBLIC_ORIGIN` to that proxy's external origin when it differs
from the origin seen by the Node server, so the write-origin check works over TLS.

## Authentication

In live/auto mode, each user connects with their own Guard personal access token.
The token stays in browser memory, is discarded on disconnect/reload, and is
never written to localStorage, sessionStorage, a Docker environment variable,
the bundle or request logs. Read requires `policies:read` and `guardrails:read`;
write requires the corresponding write permissions plus the Controller admin
account role. Approval-role mapping is **not** implemented by this frontend.

The server forwards the user's Bearer header through same-origin `/api/guard/*`.
It does not forward cookies or use a shared administrator credential. This
avoids browser-to-Controller CORS and does not pretend the UI's legacy local
administrator label is a backend authenticated identity. Proxy routes are
allowlisted; redirects, deletion, account/token administration and arbitrary
upstreams are blocked. Nothing bypasses Controller authorization.

## Connected behavior

- Lists and Guardrail details come from `/policies`, `/guardrails`, and
  `/guardrails/{id}`. The current Controller returns complete collections;
  search/pagination remain local to these returned records.
- Policy surfaces represent immutable published versions. Editable text/name
  comes from `implementation_detail`; `published_versions` supplies pinned
  references. Built-in rule policies are read-only.
- Guardrail writes use `name`, `runtimeProfile`, and `draftConfig.policyBindings`.
  Existing runtime settings, parameter values, overrides and pinned versions are
  preserved when unrelated fields are edited. Version identifiers remain strings.
- Unsupported BUSU/Location/Use Case fields are hidden in live editors, not sent
  to non-existent API fields or falsely saved in the browser.
- Submit saves a draft, then starts `/validation-runs`. Polls target the returned
  run ID. Only a result for the current draft revision changes its validation
  status. Run handles (not tokens or backend records) survive refresh in
  sessionStorage, namespaced by backend.
- Validation success means `Validated`, not approved, published, or active.
  Publish is a separate confirmed action with `expectedDraftRevision`.
  Guardrail compilation is read from version status; `202` never means active.
- Partial success is reported explicitly: a saved draft followed by a failed
  validation request stays saved. Check/refresh the record before retrying.
  Uncertain POSTs are never retried automatically.
- Live data is not written to the mock localStorage namespace. Mock processing
  timers only run in mock mode. There is no automatic migration from mock to live.

## Text-only Policy authoring: explicit integration boundary

The current Guard OpenAPI creates a Policy from a **programmable draft**, not
raw rule prose. `/authoring/intent-analyses` returns an intent summary; it does
not generate executable Policy sources. This UI does not generate fake Colang
or call that summary a completed Policy.

Without `GUARD_POLICY_AUTHORING_URL`, live users can view policies, bind published
versions, and validate/publish existing custom policies. Text-only create/edit
shows `Rule authoring is not configured` and cannot submit. Mock mode retains
the complete text-entry demonstration.

To enable live text creation, deploy a trusted authoring service and set this
variable to its **full endpoint URL**. This is a proposed extension contract,
not an endpoint claimed to exist in Guard. It receives the user's Guard Bearer
header, so only configure a trusted service within the same authentication
boundary. The service must authorize the caller and generate/validate policy
code on the backend, not rely on the UI.

Request:

```json
{ "name": "Privacy", "text": "Keep customer data private.", "policyId": "only-for-edits", "expectedDraftRevision": 3 }
```

Response:

```text
{ owner: string, draft: <Guard postPoliciesRequest.properties.draft> }
```

The frontend submits the generated draft to Guard with the entered name and
text as `description`. It does not automatically publish it. The extension must
return a real valid draft including `guardrail_category`, `sources`, and
`rail_bindings`; all remaining constraints are enforced by Guard's Zod schemas.
Controller's description limit is 2,000 characters. Processing details remain
off the business UI. Human review/approval and additional business metadata
storage require separate backend contracts and are not fabricated here.

## Verification

From `web/apps/control`:

```sh
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/features/business-demo marketplace-server
node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node ../../node_modules/vite/bin/vite.js build
node scripts/guard-connection-smoke.mjs
```

The smoke test uses a local contract fixture and the production server. It does
not contact or mutate a deployed Guard instance. Real backend end-to-end testing
requires its URL, per-user token, configured compiler/Runner and (for text-only
Policy creation) the authoring extension above.
