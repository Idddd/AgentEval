# AI Marketplace UI demo

The behavior below describes `MARKETPLACE_DATA_MODE=mock` (the default).
For live/auto deployment and the supported Controller OpenAPI operations, see
[Guard OpenAPI connection](guard-openapi-connection.md).

## Pages

- `/guardrails`: registry, search, status/scope filters, pagination and creation drawer. Selecting or saving a Guardrail opens its detail page.
- `/guardrails/:guardrailId`: full Guardrail detail page, scope, pinned Policy versions/statuses and latest Policy statuses. View and edit Policies in a drawer without leaving the Guardrail; edit ready Policies by creating a new version. Processing Policies are read-only. Guardrail drafts can be edited here. Legacy `?item=` links redirect to this page.
- `/policies`: registry, search, status and owner checkbox filters, pagination, create and detail drawer.
- `/templates`: compatibility redirect to `/policies`.

The light sidebar layout is retained. Red is the brand/accent color; processing, ready and attention statuses retain separate semantic colors. Placeholder search/help controls and technical configuration are removed.

## Mock behavior

The sidebar account menu switches between Admin and the owners present in the
local dataset (initially ISS, Compliance and RMG). New records use the selected
owner; switching or editing never transfers ownership of existing records. The
selection persists separately under `ai-marketplace.active-owner.v1`. This is
not an authorization or visibility filter. Live mode offers Switch account,
which disconnects and requires the other user's Guard token instead.

Policy creation takes a name and plain-language rule text. Guardrail creation selects one or more ready Policy versions, plus a name, use case, BUSU, location, agent type and data type. Guardrails no longer accept a second copy of rule text. A named draft can be saved before the rest of the form is complete.

Guardrails store immutable Policy references (`policyId`, `version`, `name`, `text`). Detail links open that exact Policy version; Policy details list all linked Guardrail Profiles and their pinned versions. Creating a new version of a ready Policy archives the previous ready revision. Existing references remain unchanged, including while the new revision is a draft or processing. Previously ready revisions remain selectable; unfinished new revisions are not selectable. List rows show the Policy count or reverse Guardrail count.

Submitting starts a one-second local simulation. A Policy becomes `Ready`; a Guardrail becomes `Review`, never automatically approved or published. A seeded `Needs input` Policy demonstrates updating rules and resubmitting. Demo labels are intentionally omitted from the interface; all business data and processing remain simulated.

`src/features/business-demo/model.ts` contains the model, validation, seed data, filtering and mock transitions. `provider.tsx` owns runtime mode selection and separate mock/live providers. `catalog.tsx` renders both registries and drawers. No Guard backend requests are made in mock mode. `Ready` is not evidence of an actual validation run in this mode.

Data is stored under the isolated browser key `ai-marketplace.business-demo.v1` with schema version 2. Refresh resumes pending simulations using their submission timestamps. Version 1 data in this key is migrated in place: standalone Guardrail rule text becomes a separate ready mock Policy and a pinned reference, retaining the exact text and Guardrail ID. Migration does not mean a real review has occurred. Other legacy application storage keys are untouched. If browser storage cannot be written, the UI warns that changes only last until refresh. This is a demo, not a durable or multi-user audit store; use sample rules, not confidential production documents.

Runtime logo/favicon configuration and Docker volume replacement remain supported; see [runtime-branding.md](runtime-branding.md). Branding endpoints are independent of the mock business data.

## Check

From `web/apps/control`:

```sh
node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 18082
node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/features/business-demo
node ../../node_modules/vite/bin/vite.js build
```

Tests cover draft/submission requirements, scope fields, mock transitions, refresh persistence, malformed storage, queries, pagination, unsaved-change protection, Policy selection, forward/reverse links, immutable revisions, unavailable references and idempotent migration.

## Version 0.2.3

The registry, navigation, breadcrumbs and actions use **Guardrail Profile**
(or **Guardrail Profiles** for plural labels). Filters are always-visible checkboxes with an All option.
The All location covers every location. Policies also support owner filtering.

Details are directly editable, with Save and Cancel appearing after changes.
Active Guardrails must be deactivated before deletion. Deactivation returns a
Guardrail to Ready; Ready profiles offer Active and Delete. Pending changes
must be saved or discarded before a lifecycle action. Delete requires a dialog
confirmation. Policies referenced by a Guardrail cannot be deleted until unlinked.
Legacy Deactivated profiles migrate to Ready, and Deprecated mock profiles are
removed from the local dataset. Ready Policy edits create a new revision while
existing Guardrail references retain the previous immutable revision.

## Version 0.2.4

Details display values with edit icons revealed on hover or keyboard focus.
Active Guardrail Profiles must be deactivated before editing. Policy rows offer
edit and unlink actions; selecting a name opens its details. A plus button opens
the Policy picker, which closes after clicking outside and allows row selection.
Each Policy has a version selector: existing bindings remain pinned until saved,
new selections default to the latest Ready version, and unfinished versions are
disabled. Switching versions updates rule text without changing persisted data
until Save. Policy detail version switching keeps the drawer open and protects
unsaved edits. The Policies registry supports Updated sorting before pagination.
Mock processing completes after one second, plus the polling interval.
