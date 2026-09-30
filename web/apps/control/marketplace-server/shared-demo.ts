import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { entitySchema, advanceProcessing, enforceMandatory, type Entity } from '../src/features/business-demo/model';
import { compactTraces, assertStorageCapacity, StorageCapacityError } from '../src/features/business-demo/trace-retention';
import { normalizeDemo } from '../src/features/business-demo/unified-demo';

export class DemoConflict extends Error {}
export class SharedDemoStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS demo_snapshot (id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL)');
  }
  read(): {revision: number; items: Entity[]} {
    const row = this.db.prepare('SELECT revision,payload FROM demo_snapshot WHERE id=1').get() as {revision: number; payload: string} | undefined;
    if (!row) return {revision: 0, items: []};
    return {revision: row.revision, items: z.array(entitySchema).parse(JSON.parse(row.payload))};
  }
  write(revision: number, items: Entity[]) {
    const parsed = compactTraces(enforceMandatory(normalizeDemo(z.array(entitySchema).max(10000).parse(items))));
    assertStorageCapacity(parsed);
    if (new Set(parsed.map(item => item.id)).size !== parsed.length) throw new Error('Duplicate record IDs.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.read();
      if (current.revision !== revision) throw new DemoConflict('Shared data changed. Reload and apply your changes again.');
      this.db.prepare('INSERT INTO demo_snapshot(id,revision,payload) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload').run(revision + 1, JSON.stringify(parsed));
      this.db.exec('COMMIT');
      return { revision: revision + 1, items: parsed };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  tick() {
    const current = this.read();
    const next = compactTraces(enforceMandatory(advanceProcessing(current.items, Date.now())));
    return next === current.items ? current : this.write(current.revision, next);
  }
  close() { this.db.close(); }
}

// Keep a process-wide memory copy so a database failure cannot stop the demo.
// This remains shared by all visitors; it is never browser-local storage.
class ResilientDemoStore {
  private database: SharedDemoStore | undefined;
  private snapshot: {revision:number;items:Entity[]} = {revision:0,items:[]};
  constructor(path:string) {
    try { this.database = new SharedDemoStore(path); this.snapshot = this.database.read(); }
    catch (error) { this.fallback(error); }
  }
  private fallback(error:unknown) {
    console.warn('Demo database unavailable; continuing with shared process memory.', error);
    try { this.database?.close(); } catch { /* Already unavailable. */ }
    this.database = undefined;
  }
  read() {
    if (this.database) {
      try { this.snapshot = this.database.read(); }
      catch (error) { this.fallback(error); }
    }
    return this.snapshot;
  }
  write(revision:number,items:Entity[]) {
    const parsed = compactTraces(enforceMandatory(normalizeDemo(z.array(entitySchema).max(10000).parse(items))));
    assertStorageCapacity(parsed);
    if (new Set(parsed.map(item=>item.id)).size !== parsed.length) throw new SyntaxError('Duplicate record IDs.');
    const current = this.read();
    if (current.revision !== revision) throw new DemoConflict('Shared data changed. Reload and apply your changes again.');
    if (this.database) {
      try { this.snapshot = this.database.write(revision,parsed); return this.snapshot; }
      catch (error) {
        if (error instanceof DemoConflict || error instanceof StorageCapacityError || error instanceof z.ZodError) throw error;
        this.fallback(error);
      }
    }
    this.snapshot = {revision:revision+1,items:parsed};
    return this.snapshot;
  }
  tick() {
    const current = this.read();
    const next = compactTraces(enforceMandatory(advanceProcessing(current.items,Date.now())));
    return next === current.items ? current : this.write(current.revision,next);
  }
}
const stores = new Map<string, ResilientDemoStore>();
function permitsWrite(request: Request, configured?: string): boolean {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (!origin || origin === 'null' || site === 'cross-site') return false;
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
    // An explicit deployment allowlist takes precedence. Fetch Metadata is set
    // by browsers and survives TLS termination without trusting forwarded hosts.
    if (configured) return origin === new URL(configured.trim()).origin;
    return site === 'same-origin' || origin === new URL(request.url).origin;
  } catch { return false; }
}
export async function sharedDemoApi(request: Request, env = process.env) {
  const headers = { 'Cache-Control': 'no-store' };
  if ((env.MARKETPLACE_DATA_MODE ?? 'mock') === 'live') return Response.json({error: 'This service uses the live backend.'}, {status: 404, headers});
  try {
    if (request.method !== 'GET' && request.method !== 'PUT') return Response.json({error: 'Method not allowed'}, {status: 405, headers});
    if (request.method === 'PUT') {
      if (!permitsWrite(request, env.MARKETPLACE_PUBLIC_ORIGIN)) return Response.json({error: 'Origin not allowed. Set MARKETPLACE_PUBLIC_ORIGIN to the public site origin (https://your-host).'}, {status: 403, headers});
      if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error: 'JSON required'}, {status: 415, headers});
    }
    const databasePath=env.MARKETPLACE_DEMO_STORAGE === 'memory' ? ':memory:' : env.MARKETPLACE_DEMO_DB_FILE || ':memory:';
    let store = stores.get(databasePath);
    if (!store) { store = new ResilientDemoStore(databasePath); stores.set(databasePath, store); }
    if (request.method === 'GET') {
      const snapshot = store.tick();
      if (new URL(request.url).searchParams.get('download') === '1') return Response.json({format:'tali-demo',version:1,exportedAt:new Date().toISOString(),items:snapshot.items}, {headers:{...headers,'Content-Disposition':'attachment; filename="tali-demo-backup.json"'}});
      return Response.json(snapshot, {headers});
    }
    const body = await request.text();
    if (body.length > 8_000_000) return Response.json({error: 'Demo data exceeds 8 MB.'}, {status: 413, headers});
    const raw = JSON.parse(body);
    if (raw.backup) {
      const backup = z.object({format:z.literal('tali-demo'),version:z.literal(1),items:z.array(entitySchema).max(10000)}).parse(raw.backup);
      const ids = new Set(backup.items.map(item => item.id));
      const policies = new Set(backup.items.filter(item => item.kind === 'policies').map(item => item.id));
      if (ids.size !== backup.items.length || backup.items.some(item => item.policies.some(ref => !policies.has(ref.policyId)))) return Response.json({error:'Backup contains duplicate IDs or missing Guardrails.'},{status:400,headers});
      raw.items = backup.items;
    }
    const input = z.object({revision: z.number().int().nonnegative(), items: z.array(entitySchema).max(10000)}).parse(raw);
    return Response.json(store.write(input.revision, input.items), {headers});
  } catch (error) {
    const status = error instanceof StorageCapacityError ? 413 : error instanceof DemoConflict ? 409 : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503;
    if (status === 503) console.error('Shared demo storage failed:', error);
    return Response.json({error: status === 413 || status === 409 ? (error as Error).message : status === 400 ? 'Invalid demo data.' : 'Shared storage unavailable. Changes were not saved.'}, {status, headers});
  }
}
