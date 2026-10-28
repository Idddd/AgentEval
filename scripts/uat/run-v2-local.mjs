// Local-only helper: existing UAT credentials are passed in memory to Docker,
// never copied into a new env file, image, command line or console output.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, "../..");
const directory = resolve(root, ".artifacts/uat-nemo");
const config = JSON.parse(readFileSync(resolve(directory, "local-access.json"), "utf8"));
const accounts = JSON.parse(readFileSync(resolve(directory, "v2-test-accounts.json"), "utf8"));
const nemo = accounts[config.nemoAccount], actor = accounts[config.marketplaceActor];
if (!nemo?.email || !nemo?.password || !actor?.id) throw new Error("Configure valid local NeMo and Marketplace actor account keys.");
const name = process.argv[2] ?? "marketplace-v2-local";
const port = process.argv[3] ?? "18082";
const image = "marketplace-v2:local";
if (!/^[a-z0-9-]+$/.test(name) || !/^18\d{3}$/.test(port)) throw new Error("Invalid local container name or port.");
const result = spawnSync("docker", ["run", "-d", "--name", name, "--restart", "unless-stopped", "-p", `127.0.0.1:${port}:8080`,
  "--env-file", resolve(directory, "container-v2.env"),
  "-e", `MARKETPLACE_PUBLIC_ORIGIN=http://127.0.0.1:${port}`,
  "-e", "MARKETPLACE_V2_ACCOUNTS_FILE=/run/config/accounts.json",
  "-e", "MARKETPLACE_V2_LOCAL_ACCESS=true", "-e", "MARKETPLACE_V2_LOCAL_ACTOR_ID",
  "-e", "GUARD_USERNAME", "-e", "GUARD_PASSWORD", "-e", "GUARD_AUTH_ORIGIN=http://127.0.0.1:18083",
  "--mount", `type=bind,source=${resolve(directory, "v2-accounts.json")},target=/run/config/accounts.json,readonly`, image],
  { env: { ...process.env, GUARD_USERNAME: nemo.email, GUARD_PASSWORD: nemo.password, MARKETPLACE_V2_LOCAL_ACTOR_ID: actor.id }, encoding: "utf8" });
if (result.status !== 0) { console.error("Could not create local Marketplace container. Check Docker and whether the name or port is already in use."); process.exit(1); }
console.log(`Started ${name} at http://127.0.0.1:${port}/v3/guardrails; fixed actor: ${actor.name} (${actor.role}).`);
