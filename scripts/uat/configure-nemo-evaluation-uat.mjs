// Reuse local UAT credentials without putting them in command-line arguments.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const directory = resolve(import.meta.dirname, "../../.artifacts/uat-nemo");
const config = parseEnv(readFileSync(resolve(directory, "marketplace.env"), "utf8"));
const accounts = JSON.parse(readFileSync(resolve(directory, "v2-test-accounts.json"), "utf8"));
if (!accounts.tech?.id || !accounts.tech.email || !accounts.tech.password) throw new Error("Run connect-v2.mjs first.");
const { MARKETPLACE_DEMO_TOKEN: _unused, ...base } = config;
function save(name, values) {
  writeFileSync(resolve(directory, name), Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
}
const common = {
  ...base,
  MARKETPLACE_V3_DEMO: "false",
  MARKETPLACE_WORKSPACE_ID: "nemo-evaluation-uat",
  MARKETPLACE_EVALUATION_URL: "http://127.0.0.1:18001",
};
save("marketplace-nemo-strict.env", { ...common, PORT: "18086", NITRO_PORT: "18086", MARKETPLACE_PUBLIC_ORIGIN: "http://127.0.0.1:18086" });
save("marketplace-nemo-ui.env", {
  ...common,
  MARKETPLACE_V2_LOCAL_ACCESS: "true",
  MARKETPLACE_V2_LOCAL_ACTOR_ID: accounts.tech.id,
  MARKETPLACE_NEMO_AUTH_MODE: "password",
  GUARD_USERNAME: accounts.tech.email,
  GUARD_PASSWORD: accounts.tech.password,
});
if (!accounts.tech.secret) throw new Error("Run connect-v2.mjs to issue the local demo service token.");
save("marketplace-nemo-demo.env", {
  ...common,
  MARKETPLACE_V3_DEMO: "true",
  MARKETPLACE_NEMO_TLS: "verify",
  GUARD_API_TOKEN: accounts.tech.secret,
  MARKETPLACE_CONNECTION_DIR: resolve(directory, "demo-connection").replaceAll("\\", "/"),
  MARKETPLACE_EVALUATION_URL: "",
  MARKETPLACE_EVALUATION_ALLOWED_URLS: common.MARKETPLACE_EVALUATION_URL,
});
console.log("Configured separate strict, loopback Tech browser and shared Demo UAT profiles; no credentials printed.");
