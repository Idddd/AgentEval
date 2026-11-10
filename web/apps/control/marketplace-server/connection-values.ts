import { readFileSync, statSync } from "node:fs";
import type { ConnectionValue, ConnectionValues } from "../src/features/nmgr/connection-values";
import type { ConnectionSettings } from "./nmgr-connection-config";

type Kind = "token" | "password" | "url" | "database" | "text";
const definitions: Array<[string, string, Kind, string?]> = [
  ["nemoUrl", "GUARD_API_URL", "url"],
  ["nemoToken", "GUARD_API_TOKEN", "token", "GUARD_API_TOKEN_FILE"],
  ["f5Url", "F5_API_URL", "url"],
  ["f5Token", "F5_API_TOKEN", "token", "F5_API_TOKEN_FILE"],
  ["databaseUrl", "MARKETPLACE_DATABASE_URL", "database"],
  ["databasePassword", "MARKETPLACE_DATABASE_PASSWORD", "password"],
  ["workspaceId", "MARKETPLACE_WORKSPACE_ID", "text"],
  ["f5AdminIds", "F5_PROJECT_ADMIN_IDS", "text"],
];

function inspect(env: NodeJS.ProcessEnv, key: string, kind: Kind, fileKey?: string): ConnectionValue {
  // Match the actual clients: NeMo selects a defined file variable; F5 a nonempty one.
  const useFile = fileKey && (key === "GUARD_API_TOKEN" ? env[fileKey] !== undefined : !!env[fileKey]);
  const result: ConnectionValue = { source: useFile ? fileKey! : key, status: "missing", preview: "" };
  let raw = env[key];
  if (key === "MARKETPLACE_DATABASE_PASSWORD" && raw === undefined) {
    try {
      const password = new URL(env.MARKETPLACE_DATABASE_URL!).password;
      if (password) { raw = decodeURIComponent(password); result.source = "MARKETPLACE_DATABASE_URL (password)"; }
    } catch { /* The URL diagnostic reports invalid database URLs. */ }
  }
  if (useFile) {
    result.path = env[fileKey!]!;
    try {
      const file = statSync(result.path!);
      if (!file.isFile() || file.size > 64_000) return { ...result, status: "unreadable", code: "invalid_secret_file" };
      raw = readFileSync(result.path!, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return { ...result, status: "unreadable", code: code && ["ENOENT", "EACCES", "EPERM", "EISDIR"].includes(code) ? code : "file_read_failed" };
    }
  }
  if (raw === undefined) return result;
  const value = kind === "token" ? raw.trim() : raw;
  result.length = value.length;
  result.trimmed = raw !== value;
  if (!value) return { ...result, status: "empty" };
  result.status = "loaded";
  if (kind === "token" || kind === "password") {
    // Passwords never reveal a suffix; short tokens remain completely masked.
    result.preview = "••••••••" + (kind === "token" && value.length >= 12 && !/\s/.test(value) ? value.slice(-4) : "");
    if (kind === "token" && (key === "GUARD_API_TOKEN" ? !/^[A-Za-z0-9._~+\/-]+=*$/.test(value) : /\s/.test(value) || /^[\[{"']/.test(value))) {
      result.status = "invalid";
      result.preview = "••••••••";
      result.code = /^Bearer\s/i.test(value) ? "bearer_prefix" : "token_format";
    }
  } else if (kind === "url" || kind === "database") {
    try {
      const url = new URL(value);
      if (kind === "url") {
        const suffix = key === "F5_API_URL" ? "/backend/v1" : "/api/v1";
        if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash || !url.pathname.replace(/\/$/, "").endsWith(suffix) || key === "F5_API_URL" && url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error();
        result.preview = url.toString();
      } else {
        if (!["postgres:", "postgresql:", "mysql:", "mariadb:"].includes(url.protocol) || !url.hostname) throw new Error();
        if (url.username) url.username = "***";
        if (url.password) url.password = "***";
        for (const name of [...url.searchParams.keys()]) url.searchParams.set(name, "***");
        url.hash = "";
        result.preview = url.toString();
      }
    } catch { result.status = "invalid"; result.code = "url_format"; }
  } else result.preview = value.slice(0, 4096);
  return result;
}

/** Diagnostic projection only: never modifies credentials or calls a remote service. */
export function connectionValues(effective: NodeJS.ProcessEnv, deployment: NodeJS.ProcessEnv, saved: ConnectionSettings | null): ConnectionValues {
  return Object.fromEntries(definitions.map(([field, key, kind, fileKey]) => {
    const current = inspect(effective, key, kind, fileKey);
    const overridden = !!saved?.[field as keyof ConnectionSettings] || field.startsWith("f5") && saved?.f5Mode === "disabled";
    if (overridden) current.source = "Saved settings";
    return [field, { effective: current, deployment: inspect(deployment, key, kind, fileKey), overridden }];
  }));
}
