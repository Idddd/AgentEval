# Local V1 / V2 interfaces

The `integration/nmgr-v0217` branch contains the v0.2.17 interface (V1) and
the NMGR workbench imported through PR #9 (V2).

Both interfaces run in the same application:

| Entry | Interface |
| --- | --- |
| `/v1/` | Existing Profiles / Guardrails interface |
| `/v2/` | NMGR role workbenches |

The entry paths resolve to `/v1/guardrails` and `/v2/guardrails`. Internal
navigation keeps the active prefix. Existing unprefixed bookmarks default to
V1. Change the URL prefix to switch interfaces; the workbench has no V1 / V2 buttons.

V2 also supports role links, for example
`/v2/guardrails?role=tech`, `?role=user`, and `?role=approver`.
Its fragment links still locate specific workbench screens and records.
V1 configuration-version query parameters keep their original meaning.

## Hidden V2 configuration import

Open `/v2/import` directly. This page has no workbench menu item or import button
in either main interface. V1 retains its existing two-section navigation.

Choose a JSON file or paste JSON, validate the preview, then confirm the import.
Download `/nmgr-import-example.json` for a complete Guardrail / Profile example.
Accepted formats are an array of configurations, `{ "entities": [...] }`, or
`{ "guardrails": [...], "profiles": [...] }`. Array records require a `kind` of
`Guardrail` or `Profile`; separate arrays supply that field automatically.

Each record requires a unique `id`, `name`, and `description`. Profiles require
`refs` containing valid Guardrail IDs. The reference may point to an existing
Guardrail or another Guardrail in the file. Existing deployed mandatory Guardrails
must be included for the selected jurisdiction. Optional scanner `config` uses
the existing `scannerType`, `direction`, `content`, `versionName`, and
`versionDescription` fields. Profiles also accept `threshold` (0–100%),
`thresholdMetric`, and a positive integer `thresholdWindow` in minutes.

Imports add drafts and audit entries without overwriting existing IDs. Supplied
approval status, deployment, test evidence, and history are not imported. A newly
imported Guardrail must follow the normal technical implementation, testing,
approval, and deployment workflow before a referencing Profile can activate.
Invalid batches, cancelled previews, and failed browser-storage writes retain
the existing workspace. Confirmation revalidates the latest stored workspace.
Files are limited to 1 MB and 200 configurations.

The existing V2 technical test dataset upload remains available separately.

The two interfaces retain their separate browser storage keys. V2 uses local
simulated data and does not add backend authentication, inference, or deployment.

## Start a local preview on Windows

Install the repository dependencies in `web` if needed, then run these commands
from `web/apps/control` in PowerShell:

```powershell
$env:TALI_UI_DEMO = 'true'
node ../../node_modules/vite/bin/vite.js build --config vite.preview.config.ts
node ../../node_modules/vite/bin/vite.js preview --config vite.preview.config.ts --host 127.0.0.1 --port 18085 --strictPort
```

Open `http://127.0.0.1:18085/v1/` or `http://127.0.0.1:18085/v2/`.
The preview configuration serves both interfaces; `TALI_UI_DEMO` selects the
local static build, while the URL selects the interface.

## Verification

```powershell
node ../../node_modules/prisma/build/index.js generate --config prisma.config.ts
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts
node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
```

The Prisma generation step prepares the existing server test dependencies; it
does not require a database migration or a running database for this preview.
