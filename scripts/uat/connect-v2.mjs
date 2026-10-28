// Local test accounts only. The release package never contains this directory.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../.."), directory = resolve(root, ".artifacts/uat-nemo");
const env = parseEnv(readFileSync(resolve(directory, ".env"), "utf8")), base = "http://127.0.0.1:18083";
async function call(path, body, cookie) {
  const response = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`NeMo ${path}: HTTP ${response.status}`);
  return { data: await response.json(), cookie: response.headers.getSetCookie().map(s => s.split(";")[0]).join("; ") };
}
const file = resolve(directory, "v2-test-accounts.json");
const saved = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
const admin = await call("/api/auth/sign-in/email", { email: "admin@marketplace.local", password: env.NEMO_ADMIN_PASSWORD });
for (const [key, role, name] of [["user", "User", "UAT Author"], ["approver", "User Admin", "UAT Approver"], ["tech", "IT Admin", "UAT Engineer"]]) {
  if (saved[key]?.secret && saved[key]?.id && (await fetch(`${base}/api/v1/account/identity`, { headers: { Authorization: `Bearer ${saved[key].secret}` } })).ok) continue;
  if (!saved[key]) {
    const email = key === "user" ? "user@marketplace.local" : `v2-${key}@marketplace.local`;
    const password = key === "user" ? env.NEMO_USER_PASSWORD : randomBytes(24).toString("hex");
    if (key !== "user") await call("/api/auth/admin/create-user", { email, password, name, role: "user" }, admin.cookie);
    saved[key] = { email, password, role, name };
    writeFileSync(file, JSON.stringify(saved, null, 2), { mode: 0o600 });
  }
  // Better Auth deliberately throttles rapid password logins from one IP.
  await new Promise(resolve => setTimeout(resolve, 11000));
  const account = saved[key], login = await call("/api/auth/sign-in/email", { email: account.email, password: account.password });
  account.id = login.data.user.id;
  if (!account.secret || !(await fetch(`${base}/api/v1/account/identity`, { headers: { Authorization: `Bearer ${account.secret}` } })).ok) {
    const token = await call("/api/v1/account/access-tokens", { name: "Marketplace V2 local verification", expiresInDays: 30, permissions: { policies: "write", guardrails: "write", runtime: "read", runners: "read", playground: "write", routers: "read", endpoints: "read" } }, login.cookie);
    account.secret = token.data.secret;
  }
  writeFileSync(file, JSON.stringify(saved, null, 2), { mode: 0o600 });
}
const accounts = Object.fromEntries(Object.values(saved).map(a => [a.id, { name: a.name, role: a.role, unit: "ISS" }]));
const mapping = resolve(directory, "v2-accounts.json");
writeFileSync(mapping, JSON.stringify(accounts, null, 2));
const configFile = resolve(directory, "marketplace.env"), config = parseEnv(readFileSync(configFile, "utf8"));
config.MARKETPLACE_V2_ACCOUNTS_FILE = mapping.replaceAll("\\", "/");
config.MARKETPLACE_CRUD_ONLY = "false";
config.MARKETPLACE_DEMO_TOKEN = saved.user.secret;
writeFileSync(configFile, Object.entries(config).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("\n") + "\n", { mode: 0o600 });
console.log("Three local V2 accounts configured; credentials remain in ignored files.");
