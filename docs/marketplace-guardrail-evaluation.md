# Independent Guardrail evaluation in AI Marketplace

Open **Guardrail Evaluation** in the Tech workbench on Marketplace (port 18082), select a Guardrail revision, then select **Evaluate / Run evaluation**. The same panel reports submission, progress, completion, runner failures, and per-case results. Recent runs and reports are recovered from the evaluation backend when the panel is reopened.

## Internal deployment

Set `MARKETPLACE_EVALUATION_URL` on the Marketplace **server** to the independent evaluation service URL (origin or complete `/api/v1/evaluations` base). With an existing authenticated V3 deployment, a URL is sufficient when the backend allows the default project and the published target's ID, revision number and provider already correspond to the Marketplace Guardrail. The target must define a default Guardrail endpoint and versioned published datasets; temporary upload targets are not supported by this panel. Provisioning the target and connecting it to the real Guardrail happen in the evaluation service, not in Marketplace.

- If target IDs differ, set `MARKETPLACE_EVALUATION_BINDINGS` as JSON, for example `{"banking-guardrail@2":"banking-release-suite"}`. The backend version must still be 2. Each target/version belongs to one Marketplace Guardrail.
- If enabled on the service, configure `MARKETPLACE_EVALUATION_PROJECT_ID` and supply `MARKETPLACE_EVALUATION_TOKEN` as a server-side secret. Only the Marketplace server contacts the evaluation API. Use trusted TLS (e.g. `NODE_EXTRA_CA_CERTS` for an internal CA), not disabled verification.
- Helm equivalents: `marketplace.evaluationUrl`, `evaluationProjectId`, `evaluationBindings`, and `evaluationTokenSecret` / `evaluationTokenKey` under `marketplace`. In strict V3 (`marketplace.demoRoles: false`), only authenticated Tech can run or read evaluations. In shared V3 Demo, all workbench roles can run and view evaluations in their workspace. Use a dedicated UAT project and keep this instance behind the internal access boundary. Role switching is not authentication.
- Reports are independent evidence. **Provider acceptance for sign-off** remains separate and is still required by the existing release workflow. A missing configuration or backend failure does not generate simulated results.

When submission is not acknowledged, retrying reuses the original request ID. If the pinned evaluation configuration has changed, check **Recent runs** before starting a new evaluation. If status/report polling loses the connection, it retries and then offers **Refresh result** without starting another run.

### V3 Demo connection page

With empty Evaluate deployment settings, open **Connections → Independent Evaluate**, enter the HTTPS service hostname or its complete API base on port 443, then choose **Test Evaluate URL** and **Save Evaluate URL**. The server probes the target catalog before saving to the existing connection store. Refreshing the page reads the saved selection. Deployment URL, destination allowlist and Evaluate token may all remain blank. The manual setup uses verified TLS and a DNS hostname; loopback and link-local destinations are excluded for shared deployments.

For an operator-managed default, copy the [Evaluate Helm values template](../deploy/values.evaluation.example.yaml) outside the source repository and set the real API URL in the deployment. Strict mode uses deployment-managed settings. Configuring a destination list restricts the shared page to those destinations and the deployment URL. A configured Evaluate token pins requests to the deployment URL.

If the deployment URL is unavailable, open **Connections → Independent Evaluate**. Enter a deployment-approved alternate address and select **Test Evaluate URL**. If it works, select **Save Evaluate fallback** to validate and activate it. **Use deployment Evaluate URL** removes only that override. Both actions leave NeMo, F5, and database settings untouched. The connection test only reads the target catalog; it does not start an evaluation or verify downstream scanning. An invalid or no longer approved saved fallback disables only Evaluate until explicitly changed or restored.

Configure `marketplace.evaluationAllowedUrls` (environment: comma-separated `MARKETPLACE_EVALUATION_ALLOWED_URLS`) to approve alternate hosts. The deployment's own `evaluationUrl` is always approved. Local loopback listeners can also test loopback URLs. An authenticated Evaluate deployment pins its Token to the deployment URL; change that URL and Token in deployment config. Project ID, Token and cross-ID bindings remain service-side. Reports and jobs remain with the backend that processed them; switching the URL does not transfer, restart, or automatically reroute work.

The **Evaluate activity log** shows the last 20 tests, saves, restores and submissions on the current server, with time, HTTP status, duration and request reference. It resets on server restart; structured server logs include the same events. It contains no credentials or test contents. For proxy deployments, set `marketplace.publicOrigin` to the browser-facing Marketplace origin and serve `/api` from the same address.

If the page reports `evaluation_url_not_allowed`, check the HTTPS hostname and port for direct setup, or the destination policy when configured. Set `marketplace.evaluationUrl` to the API base reachable from the Marketplace Pod, or add an exact alternate to `marketplace.evaluationAllowedUrls` when using a manual fallback without a deployment Token. The browser origin whitelist controls inbound access to Marketplace and does not approve Evaluate destinations.

After applying the deployment values, run **Test Evaluate URL**. The probe reads `/api/v1/evaluations/targets?limit=1` and expects a JSON object with `items` and `total`. The activity log distinguishes a local rejection, DNS or TLS failure, an upstream HTTP error, and an incompatible response. An upstream redirect or HTML response indicates that the configured route may serve the web UI or a login page. Use the API service or a gateway route that serves the API directly.

## Local smoke test

Start the independent backend and its runner separately. With the local target `local-guardrail-smoke` (v1, published synthetic dataset, default `mock-guardrail` endpoint), launch from `web/apps/control` in PowerShell:

```powershell
$env:HOST='127.0.0.1'
$env:MARKETPLACE_DATA_MODE='mock'
$env:MARKETPLACE_DEMO_STORAGE='browser'
$env:MARKETPLACE_EVALUATION_URL='http://127.0.0.1:18001'
$env:MARKETPLACE_EVALUATION_BINDINGS='{"default-banking-restrictions@1":"local-guardrail-smoke"}'
node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 18082 --strictPort
```

Open [the bound Guardrail in Marketplace V2](http://127.0.0.1:18082/v2/guardrails?role=tech&independentEvaluation=1#Guardrail/tests/default-banking-restrictions), then click **Evaluate** and **Run evaluation**. The local endpoint returns simulated classifications; pass/fail counts may vary. Only the task, progress and report integration are being validated. This path requires the explicit `independentEvaluation=1` opt-in, loopback access, and a revision binding. Ordinary V2 Mock remains browser-only.

## Intranet-style local UAT with NeMo

Use the compatible NeMo Controller and Runner at commit `9a1971b81b38e2848641289cf7ce51aab544be28` as documented in [Local NeMo UAT](uat/local-nemo.md). The older published 0.2.4 images have different business-user permissions; do not reuse their Postgres volume with the compatible images. The evaluation API listens on 18001, NeMo Controller on 18085, Runner on 18091, and Marketplace on 18082. None requires a public port.

From the repository root, with the compatible images tagged `agenteval-guard-controller:9a1971b` / `agenteval-guard-runner:9a1971b` and the local evaluator already running:

```powershell
$env:NEMO_LOCAL_PORT='18085'
node scripts/uat/init-local.mjs
./scripts/uat/init-nemo-mtls.ps1   # use -OpenSsl with an absolute path if needed
docker compose -p agenteval-uat-db --env-file .artifacts/uat-mariadb/.env -f deploy/compose.mariadb-test.yml up -d --wait
docker compose -p agenteval-uat-nemo-compatible --env-file .artifacts/uat-nemo/.env -f deploy/compose.nemo-local.yml -f deploy/compose.nemo-local-mtls.yml up -d --wait
node scripts/uat/connect-nemo.mjs
node scripts/uat/connect-v2.mjs
node scripts/uat/configure-nemo-evaluation-uat.mjs
./scripts/uat/start-marketplace.ps1 -Build -Profile marketplace-nemo-strict
$env:V2_SMOKE_URL='http://127.0.0.1:18086'
node scripts/uat/smoke-v2.mjs
node scripts/uat/provision-nemo-evaluation-runtime.mjs
# Set EVAL_LOCAL_SECRET_DIR to the evaluator's local secret mount source directory.
docker compose -p agenteval-uat-bridge --env-file .artifacts/uat-nemo/.env -f deploy/compose.nemo-evaluation-bridge.yml up -d
node scripts/uat/provision-nemo-evaluation-suite.mjs
# Stop an existing dev instance on 18082 before starting the browser profile.
./scripts/uat/start-marketplace.ps1 -Profile marketplace-nemo-ui
```

Open `http://127.0.0.1:18082/v3/guardrails` as the fixed local Tech actor and select the Guardrail ID in `.artifacts/uat-nemo/v2-smoke-result.json`. The separate strict API on 18086 checks real NeMo business-account credentials and Marketplace roles; the browser profile is loopback-only and does not simulate an actual corporate SSO login screen. The bridge binds only to the Docker networks and switches the evaluator's shared local token to the real NeMo endpoint credential. The Runner executes the published keyword policy; no model credentials are needed for the synthetic keyword cases. The production evaluator should target its real endpoint using its own credential configuration; this bridge is not for production.

To test shared roles instead, stop the instance on 18082 and start with `-Profile marketplace-nemo-demo`. The local Demo profile intentionally leaves the Evaluate URL unset and approves `http://127.0.0.1:18001` so it can be tested and saved from **Connections**.
