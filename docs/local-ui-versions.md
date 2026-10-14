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
V1. Use the V1 / V2 links in either header to switch interfaces.

V2 also supports role links, for example
`/v2/guardrails?role=tech`, `?role=user`, and `?role=approver`.
Its fragment links still locate specific workbench screens and records.
V1 configuration-version query parameters keep their original meaning.

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
