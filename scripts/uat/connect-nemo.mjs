// Local-only setup. Secrets stay in ignored files and are never printed.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const directory = resolve(root, ".artifacts/uat-nemo");
const nemo = parseEnv(readFileSync(resolve(directory, ".env"), "utf8"));
const db = parseEnv(readFileSync(resolve(root, ".artifacts/uat-mariadb/.env"), "utf8"));
const port = Number(process.env.NEMO_LOCAL_PORT ?? 18083);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("NEMO_LOCAL_PORT must be a valid port.");
const base = `http://127.0.0.1:${port}`;
async function json(path, options = {}) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`NeMo ${path} returned HTTP ${response.status}`);
  return { response, data: await response.json() };
}
await json("/health/ready");
const tokenFile = resolve(directory, "marketplace-token.json");
let issued = existsSync(tokenFile) ? JSON.parse(readFileSync(tokenFile, "utf8")) : null;
if (issued) {
  const response = await fetch(base + "/api/v1/account/identity", { headers: { Authorization: `Bearer ${issued.secret}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) issued = null;
}
if (!issued) {
  const loginRequest = (email, password) => ({ method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(20000) });
  const email = "user@marketplace.local", credentials = loginRequest(email, nemo.NEMO_USER_PASSWORD);
  let response = await fetch(base + "/api/auth/sign-in/email", credentials);
  if (response.status === 401) {
    // Published NeMo images bootstrap an administrator, not a business user.
    const admin = await json("/api/auth/sign-in/email", loginRequest("admin@marketplace.local", nemo.NEMO_ADMIN_PASSWORD));
    const adminCookie = admin.response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    if (!adminCookie) throw new Error("NeMo did not issue an administrator session");
    await json("/api/auth/admin/create-user", { method: "POST", headers: { "Content-Type": "application/json", Origin: base, Cookie: adminCookie }, body: JSON.stringify({ email, password: nemo.NEMO_USER_PASSWORD, name: "Marketplace Local User", role: "user" }) });
    await new Promise(resolve => setTimeout(resolve, 11000));
    response = await fetch(base + "/api/auth/sign-in/email", loginRequest(email, nemo.NEMO_USER_PASSWORD));
  }
  if (!response.ok) throw new Error(`NeMo business account sign-in returned HTTP ${response.status}`);
  const login = { response };
  const cookie = login.response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  if (!cookie) throw new Error("NeMo did not issue a login session");
  issued = (await json("/api/v1/account/access-tokens", { method: "POST", headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie }, body: JSON.stringify({ name: "Marketplace local UAT", expiresInDays: 30, permissions: { policies: "write", guardrails: "write", playground: "write", runtime: "read", runners: "read", routers: "write", endpoints: "write" } }) })).data;
  writeFileSync(tokenFile, JSON.stringify(issued, null, 2), { mode: 0o600 });
}
mkdirSync(directory, { recursive: true });
const config = {
  HOST: "127.0.0.1", NITRO_HOST: "127.0.0.1", PORT: "18082", NITRO_PORT: "18082",
  MARKETPLACE_DATA_MODE: "live", MARKETPLACE_CRUD_ONLY: "true",
  GUARD_API_URL: base + "/api/v1", MARKETPLACE_PUBLIC_ORIGIN: "http://127.0.0.1:18082",
  MARKETPLACE_DEMO_TOKEN: issued.secret,
  MARKETPLACE_DATABASE_URL: `mariadb://marketplace_test:${encodeURIComponent(db.MARIADB_PASSWORD)}@127.0.0.1:13306/marketplace_uat`,
  MARKETPLACE_F5_MOCK: "false",
};
writeFileSync(resolve(directory, "marketplace.env"), Object.entries(config).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
console.log("Local NeMo connection configured. Token and database credentials saved privately; token expires " + issued.token.expiresAt);
