import { AsyncLocalStorage } from "node:async_hooks";
import { createPool, type Pool, type PoolConnection } from "mariadb";
import { StoreError, type Row, type Source } from "../marketplace-db";
import type { MarketplacePersistence } from "./persistence";
import { databaseConfig } from "./config";

// Deliberately small, restartable migrations. MariaDB DDL is not transactional.
const migrations = [
  `CREATE TABLE IF NOT EXISTS marketplace_schema_versions (version INT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS marketplace_records (id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, source VARCHAR(16) NOT NULL, remote_id VARCHAR(255) COLLATE utf8mb4_bin, payload LONGTEXT NOT NULL CHECK (JSON_VALID(payload)), UNIQUE KEY source_remote (source,remote_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS marketplace_imports (source VARCHAR(16) PRIMARY KEY) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS marketplace_requests (request_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, fingerprint LONGTEXT NOT NULL, record_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, FOREIGN KEY (record_id) REFERENCES marketplace_records(id)) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS marketplace_documents (id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, payload LONGTEXT NOT NULL CHECK (JSON_VALID(payload))) ENGINE=InnoDB`,
];

export class MariaDbPersistence implements MarketplacePersistence {
  private context = new AsyncLocalStorage<PoolConnection>();
  private constructor(private pool: Pool, private lockName: string) {}
  static async open(env: NodeJS.ProcessEnv) {
    const config = databaseConfig(env);
    if (config.dialect !== "mariadb") throw new Error("MariaDB URL required");
    const { host, port, database, user, password, ssl } = config;
    const pool = createPool({ host, port, database, user, password,
      autoJsonMap: false, connectionLimit: 5, connectTimeout: 5_000, acquireTimeout: 10_000, queryTimeout: 10_000,
      ...(ssl ? { ssl } : {}),
    });
    const store = new MariaDbPersistence(pool, `marketplace:${database}`);
    try {
      await store.exclusive(async () => {
        for (const sql of migrations) await store.query(sql);
        const versions = await store.query<{ version: number }[]>("SELECT version FROM marketplace_schema_versions");
        if (versions.some(row => row.version > 2)) throw new Error("Database schema is newer than this application");
        await store.query("INSERT IGNORE INTO marketplace_schema_versions(version) VALUES(1),(2)");
      });
      return store;
    } catch (error) { await pool.end(); throw error; }
  }
  private query<T = unknown>(sql: string, values?: unknown[]): Promise<T> {
    return (this.context.getStore() ?? this.pool).query(sql, values);
  }
  async readDocument<T>(id: string): Promise<T | undefined> {
    const rows = await this.query<{ payload: string }[]>("SELECT payload FROM marketplace_documents WHERE id=?", [id]);
    return rows[0] ? JSON.parse(rows[0].payload) as T : undefined;
  }
  async writeDocument(id: string, value: unknown) {
    await this.query("INSERT INTO marketplace_documents(id,payload) VALUES(?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)", [id, JSON.stringify(value)]);
  }
  async rows() {
    const result = await this.query<{ payload: string }[]>("SELECT payload FROM marketplace_records");
    return result.map(row => JSON.parse(row.payload) as Row);
  }
  async put(row: Row) {
    // Update by primary key only: a conflicting remote ID must never overwrite another record.
    const exists = await this.query<{ id: string }[]>("SELECT id FROM marketplace_records WHERE id=?", [row.id]);
    if (exists.length) await this.query("UPDATE marketplace_records SET remote_id=?,payload=? WHERE id=?", [row.remoteId ?? null, JSON.stringify(row), row.id]);
    else await this.query("INSERT INTO marketplace_records(id,source,remote_id,payload) VALUES(?,?,?,?)", [row.id, row.source, row.remoteId ?? null, JSON.stringify(row)]);
  }
  async hasImport(source: Source) { return (await this.query<unknown[]>("SELECT source FROM marketplace_imports WHERE source=?", [source])).length > 0; }
  async markImport(source: Source) { await this.query("INSERT INTO marketplace_imports(source) VALUES(?)", [source]); }
  async request(key: string) { return (await this.query<{ fingerprint: string; record_id: string }[]>("SELECT fingerprint,record_id FROM marketplace_requests WHERE request_key=?", [key]))[0]; }
  async addRequest(key: string, fingerprint: string, id: string) { await this.query("INSERT INTO marketplace_requests(request_key,fingerprint,record_id) VALUES(?,?,?)", [key, fingerprint, id]); }
  private async connection<T>(fn: (connection: PoolConnection) => Promise<T>) {
    const existing = this.context.getStore();
    if (existing) return fn(existing);
    const connection = await this.pool.getConnection();
    try { return await this.context.run(connection, () => fn(connection)); }
    finally { await connection.release(); }
  }
  async transaction<T>(fn: () => Promise<T>) {
    return this.connection(async connection => {
      await connection.beginTransaction();
      try { const result = await fn(); await connection.commit(); return result; }
      catch (error) { await connection.rollback(); throw error; }
    });
  }
  async exclusive<T>(fn: () => Promise<T>) {
    // Single-replica UAT: a named lock also protects overlap during reconnects.
    // Remote HTTP is outside SQL transactions; durable pending states survive process loss.
    return this.connection(async () => {
      const result = await this.query<{ acquired: number }[]>("SELECT GET_LOCK(?, 10) AS acquired", [this.lockName]);
      if (Number(result[0]?.acquired) !== 1) throw new StoreError(503, "Marketplace is busy. Retry shortly.");
      try { return await fn(); }
      finally { await this.query("SELECT RELEASE_LOCK(?)", [this.lockName]); }
    });
  }
  async close() { await this.pool.end(); }
}
