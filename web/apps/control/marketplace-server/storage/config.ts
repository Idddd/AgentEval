import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export function databaseConfig(env: NodeJS.ProcessEnv) {
  try {
    if (env.MARKETPLACE_DATABASE_PASSWORD_REQUIRED === "true" && env.MARKETPLACE_DATABASE_PASSWORD === undefined) throw new Error();
    const url = new URL(env.MARKETPLACE_DATABASE_URL!);
    const dialect = ["postgres:", "postgresql:"].includes(url.protocol) ? "postgresql" : ["mysql:", "mariadb:"].includes(url.protocol) ? "mariadb" : undefined;
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!dialect || !url.hostname || !url.username || !database || database.includes("/") || url.hash) throw new Error();
    const allowed = dialect === "postgresql" ? ["sslmode", "schema"] : [];
    for (const key of url.searchParams.keys()) if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error();
    const mode = url.searchParams.get("sslmode");
    if (mode && !["disable", "require", "verify-ca", "verify-full"].includes(mode)) throw new Error();
    if (env.MARKETPLACE_DB_TLS && !["true", "false"].includes(env.MARKETPLACE_DB_TLS)) throw new Error();
    const explicitTls = env.MARKETPLACE_DB_TLS === "true" || !!env.MARKETPLACE_DB_CA_FILE;
    if (mode === "disable" && explicitTls) throw new Error();
    const tls = explicitTls || !!mode && mode !== "disable";
    const schema = url.searchParams.get("schema") ?? "public";
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error();
    return { dialect, host: url.hostname.replace(/^\[|\]$/g, ""), port: Number(url.port || (dialect === "postgresql" ? 5432 : 3306)),
      database, schema, user: decodeURIComponent(url.username), password: env.MARKETPLACE_DATABASE_PASSWORD ?? decodeURIComponent(url.password),
      ssl: tls ? { rejectUnauthorized: true, ...(env.MARKETPLACE_DB_CA_FILE ? { ca: readFileSync(env.MARKETPLACE_DB_CA_FILE, "utf8") } : {}) } : undefined };
  } catch { throw new Error("Invalid Marketplace database configuration"); }
}

export function databaseCacheKey(env: NodeJS.ProcessEnv) {
  return createHash("sha256").update(JSON.stringify([env.MARKETPLACE_DATABASE_URL, env.MARKETPLACE_DATABASE_PASSWORD, env.MARKETPLACE_DB_TLS, env.MARKETPLACE_DB_CA_FILE])).digest("hex");
}
