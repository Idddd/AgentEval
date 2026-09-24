import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { entitySchema, advanceProcessing, type Entity } from '../src/features/business-demo/model';
import { normalizeDemo } from '../src/features/business-demo/unified-demo';

export class DemoConflict extends Error {}
export class SharedDemoStore {
  private db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS demo_snapshot (id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL)');
  }
  read(): {revision: number; items: Entity[]} {
    const row = this.db.prepare('SELECT revision,payload FROM demo_snapshot WHERE id=1').get() as {revision: number; payload: string} | undefined;
    if (!row) return {revision: 0, items: []};
    return {revision: row.revision, items: z.array(entitySchema).parse(JSON.parse(row.payload))};
  }
  write(revision: number, items: Entity[]) {
    const parsed = normalizeDemo(z.array(entitySchema).max(10000).parse(items));
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
    const next = advanceProcessing(current.items, Date.now());
    return next === current.items ? current : this.write(current.revision, next);
  }
  close() { this.db.close(); }
}

const stores = new Map<string, SharedDemoStore>();
export async function sharedDemoApi(request: Request, env = process.env) {
  const headers = { 'Cache-Control': 'no-store' };
  if ((env.MARKETPLACE_DATA_MODE ?? 'mock') !== 'mock' || !env.MARKETPLACE_DEMO_DB_FILE) return Response.json({error: 'Shared demo is not enabled.'}, {status: 404, headers});
  try {
    if (request.method !== 'GET' && request.method !== 'PUT') return Response.json({error: 'Method not allowed'}, {status: 405, headers});
    if (request.method === 'PUT') {
      const origin = request.headers.get('origin');
      const allowed = env.MARKETPLACE_PUBLIC_ORIGIN || new URL(request.url).origin;
      if (!origin || origin !== allowed || request.headers.get('sec-fetch-site') === 'cross-site') return Response.json({error: 'Origin not allowed'}, {status: 403, headers});
      if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error: 'JSON required'}, {status: 415, headers});
    }
    let store = stores.get(env.MARKETPLACE_DEMO_DB_FILE);
    if (!store) { store = new SharedDemoStore(env.MARKETPLACE_DEMO_DB_FILE); stores.set(env.MARKETPLACE_DEMO_DB_FILE, store); }
    if (request.method === 'GET') return Response.json(store.tick(), {headers});
    const body = await request.text();
    if (body.length > 8_000_000) return Response.json({error: 'Demo data exceeds 8 MB.'}, {status: 413, headers});
    const input = z.object({revision: z.number().int().nonnegative(), items: z.array(entitySchema).max(10000)}).parse(JSON.parse(body));
    return Response.json(store.write(input.revision, input.items), {headers});
  } catch (error) {
    const status = error instanceof DemoConflict ? 409 : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503;
    return Response.json({error: status === 409 ? (error as Error).message : status === 400 ? 'Invalid demo data.' : 'Shared storage unavailable. Changes were not saved.'}, {status, headers});
  }
}
