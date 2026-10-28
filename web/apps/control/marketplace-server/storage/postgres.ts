import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { StoreError, type Row, type Source } from "../marketplace-db";
import type { MarketplacePersistence } from "./persistence";
import { databaseConfig } from "./config";

const migrations = [
  `CREATE TABLE IF NOT EXISTS marketplace_schema_versions (version INT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS marketplace_records (id VARCHAR(36) PRIMARY KEY, source VARCHAR(16) NOT NULL, remote_id VARCHAR(255), payload JSONB NOT NULL, UNIQUE(source,remote_id))`,
  `CREATE TABLE IF NOT EXISTS marketplace_imports (source VARCHAR(16) PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS marketplace_requests (request_key VARCHAR(100) PRIMARY KEY, fingerprint TEXT NOT NULL, record_id VARCHAR(36) NOT NULL REFERENCES marketplace_records(id))`,
  `CREATE TABLE IF NOT EXISTS marketplace_documents (id VARCHAR(100) PRIMARY KEY, payload JSONB NOT NULL)`,
];

export class PostgresPersistence implements MarketplacePersistence {
  private context = new AsyncLocalStorage<PoolClient>();
  private constructor(private pool: Pool, private lockKey: string) {}
  static async open(env: NodeJS.ProcessEnv) {
    const config = databaseConfig(env);
    if (config.dialect !== "postgresql") throw new Error("PostgreSQL URL required");
    const { host, port, database, user, password, ssl, schema } = config;
    const pool = new Pool({ host, port, database, user, password, ssl: ssl ?? false,
      options: `-c search_path=${schema}`, max: 5, connectionTimeoutMillis: 5_000,
      statement_timeout: 12_000, lock_timeout: 10_000, application_name: "marketplace-v2" });
    // pg removes idle failed clients; handle the event without logging credentials or crashing Node.
    pool.on("error", () => { console.error("Marketplace PostgreSQL idle connection lost; the pool will reconnect."); });
    const lockKey = createHash("sha256").update(`marketplace:${database}:${schema}`).digest().readBigInt64BE().toString();
    const store = new PostgresPersistence(pool, lockKey);
    try {
      await store.exclusive(() => store.transaction(async () => {
        for (const sql of migrations) await store.query(sql);
        const versions = await store.query<{ version: number }>("SELECT version FROM marketplace_schema_versions");
        if (versions.some(row => row.version > 2)) throw new Error("Database schema is newer than this application");
        await store.query("INSERT INTO marketplace_schema_versions(version) VALUES(1),(2) ON CONFLICT DO NOTHING");
      }));
      return store;
    } catch (error) { await pool.end(); throw error; }
  }
  private async query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<T[]> {
    return (await (this.context.getStore() ?? this.pool).query<T>(sql, values)).rows;
  }
  async readDocument<T>(id: string): Promise<T | undefined> {
    return (await this.query<{ payload: T }>("SELECT payload FROM marketplace_documents WHERE id=$1", [id]))[0]?.payload;
  }
  async writeDocument(id: string, value: unknown) {
    await this.query("INSERT INTO marketplace_documents(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", [id, JSON.stringify(value)]);
  }
  async rows() { return (await this.query<{ payload: Row }>("SELECT payload FROM marketplace_records")).map(row => row.payload); }
  async put(row: Row) {
    await this.query("INSERT INTO marketplace_records(id,source,remote_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET remote_id=excluded.remote_id,payload=excluded.payload",
      [row.id, row.source, row.remoteId ?? null, JSON.stringify(row)]);
  }
  async hasImport(source: Source) { return (await this.query("SELECT source FROM marketplace_imports WHERE source=$1", [source])).length > 0; }
  async markImport(source: Source) { await this.query("INSERT INTO marketplace_imports(source) VALUES($1)", [source]); }
  async request(key: string) { return (await this.query<{ fingerprint: string; record_id: string }>("SELECT fingerprint,record_id FROM marketplace_requests WHERE request_key=$1", [key]))[0]; }
  async addRequest(key: string, fingerprint: string, id: string) { await this.query("INSERT INTO marketplace_requests(request_key,fingerprint,record_id) VALUES($1,$2,$3)", [key, fingerprint, id]); }
  private async connection<T>(fn: (client: PoolClient) => Promise<T>) {
    const existing = this.context.getStore();
    if (existing) return fn(existing);
    const client = await this.pool.connect();
    let failed = false;
    const onError = () => { failed = true; };
    client.on("error", onError);
    try {
      const result = await this.context.run(client, () => fn(client));
      if (failed) throw new StoreError(503, "Marketplace database connection was interrupted.");
      return result;
    }
    catch (error) { failed = true; throw error; }
    // Destroy on failure so an uncertain transaction or session lock never returns to the pool.
    finally {
      client.release(failed);
      // Keep the listener on destroyed clients to absorb late socket errors until close.
      if (!failed) client.off("error", onError);
    }
  }
  async transaction<T>(fn: () => Promise<T>) {
    return this.connection(async client => {
      await client.query("BEGIN");
      try { const result = await fn(); await client.query("COMMIT"); return result; }
      catch (error) { await client.query("ROLLBACK"); throw error; }
    });
  }
  async exclusive<T>(fn: () => Promise<T>) {
    return this.connection(async client => {
      // Session lock spans remote HTTP calls; no SQL transaction stays open during those calls.
      try { await client.query("SELECT pg_advisory_lock($1::bigint)", [this.lockKey]); }
      catch (error) {
        if (["55P03", "57014"].includes((error as { code?: string }).code ?? "")) throw new StoreError(503, "Marketplace is busy. Retry shortly.");
        throw error;
      }
      try { return await fn(); }
      finally { await client.query("SELECT pg_advisory_unlock($1::bigint)", [this.lockKey]); }
    });
  }
  async close() { await this.pool.end(); }
}
