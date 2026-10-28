import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const db = resolve(root, ".artifacts/uat-mariadb"), nemo = resolve(root, ".artifacts/uat-nemo");
for (const directory of [db, nemo]) { mkdirSync(directory, { recursive: true }); writeFileSync(resolve(directory, ".gitignore"), "*\n"); }
const secret = () => randomBytes(24).toString("hex");
const save = (file, values) => { if (!existsSync(file)) writeFileSync(file, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 }); };
save(resolve(db, ".env"), { MARIADB_ROOT_PASSWORD: secret(), MARIADB_PASSWORD: secret() });
save(resolve(nemo, ".env"), { NEMO_DB_PASSWORD: secret(), NEMO_RUNNER_TOKEN: secret(), NEMO_METRICS_TOKEN: secret(), NEMO_AUTH_SECRET: secret(), NEMO_ADMIN_PASSWORD: secret(), NEMO_USER_PASSWORD: secret(), NEMO_LOG_KEY: randomBytes(32).toString("base64"), NEMO_LOCAL_SECRETS_DIR: nemo.replaceAll("\\", "/") });
const privateKey = resolve(nemo, "private.pem"), publicKey = resolve(nemo, "public.pem");
if (existsSync(privateKey) !== existsSync(publicKey)) throw new Error("Incomplete existing signing key pair; restore its missing file.");
if (!existsSync(privateKey)) {
  const pair = generateKeyPairSync("ed25519", { privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  writeFileSync(privateKey, pair.privateKey, { mode: 0o600 }); writeFileSync(publicKey, pair.publicKey);
}
console.log("Local credentials initialized; existing credentials retained. No credentials printed.");
