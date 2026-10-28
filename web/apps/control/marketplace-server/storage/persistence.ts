import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Row, Source } from "../marketplace-db";

type Result<T> = T | Promise<T>;
export interface MarketplacePersistence {
  rows(): Result<Row[]>;
  put(row: Row): Result<void>;
  hasImport(source: Source): Result<boolean>;
  markImport(source: Source): Result<void>;
  request(key: string): Result<{ fingerprint: string; record_id: string } | undefined>;
  addRequest(key: string, fingerprint: string, id: string): Result<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
  close(): Result<void>;
}

export class SqlitePersistence implements MarketplacePersistence {
  private db: DatabaseSync;
  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, source TEXT NOT NULL, remote_id TEXT, payload TEXT NOT NULL, UNIQUE(source, remote_id));
      CREATE TABLE IF NOT EXISTS imports (source TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS requests (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, record_id TEXT NOT NULL REFERENCES records(id));
      PRAGMA user_version=1;`);
  }
  rows() { return (this.db.prepare("SELECT payload FROM records").all() as { payload: string }[]).map(row => JSON.parse(row.payload) as Row); }
  put(row: Row) { this.db.prepare("INSERT INTO records(id,source,remote_id,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET remote_id=excluded.remote_id,payload=excluded.payload").run(row.id, row.source, row.remoteId ?? null, JSON.stringify(row)); }
  hasImport(source: Source) { return !!this.db.prepare("SELECT source FROM imports WHERE source=?").get(source); }
  markImport(source: Source) { this.db.prepare("INSERT INTO imports(source) VALUES(?)").run(source); }
  request(key: string) { return this.db.prepare("SELECT fingerprint,record_id FROM requests WHERE key=?").get(key) as { fingerprint: string; record_id: string } | undefined; }
  addRequest(key: string, fingerprint: string, id: string) { this.db.prepare("INSERT INTO requests(key,fingerprint,record_id) VALUES(?,?,?)").run(key, fingerprint, id); }
  async transaction<T>(fn: () => Promise<T>) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const value = await fn(); this.db.exec("COMMIT"); return value; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  exclusive<T>(fn: () => Promise<T>) { return fn(); }
  close() { this.db.close(); }
}
