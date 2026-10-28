import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { openDatabase } from "./database";
import { blankDraft } from "../../src/features/business-demo/model";
import type { Row } from "../marketplace-db";
import { Pool } from "pg";
import { databaseConfig } from "./config";

const url = process.env.MARKETPLACE_TEST_DATABASE_URL;
const env = { MARKETPLACE_DATABASE_URL: url, MARKETPLACE_DATABASE_PASSWORD: process.env.MARKETPLACE_TEST_DATABASE_PASSWORD };
async function open() {
  if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Use an isolated _test database");
  return openDatabase(env);
}
describe.skipIf(!url)("SQL persistence contract", () => {
  it.skipIf(!url?.startsWith("postgres"))("survives loss of a checked-out PostgreSQL connection and reconnects", async () => {
    const db = await open(), { host, port, database, user, password } = databaseConfig(env);
    const killer = new Pool({ host, port, database, user, password });
    const id = randomUUID();
    try {
      await expect(db.exclusive(async () => {
        await db.writeDocument(id, { phase: "pending" });
        const result = await killer.query("SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE datname=current_database() AND application_name='marketplace-v2' AND pid IN (SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted)");
        expect(result.rows).toEqual([{ terminated: true }]);
        await new Promise(resolve => setTimeout(resolve, 80));
        await db.writeDocument(id, { phase: "done" });
      })).rejects.toThrow();
      await db.exclusive(async () => {
        expect(await db.readDocument(id)).toEqual({ phase: "pending" });
        await db.writeDocument(id, { phase: "recovered" });
      });
      expect(await db.readDocument(id)).toEqual({ phase: "recovered" });
    } finally { await db.close(); await killer.end(); }
  });
  it("opens with a separate password and preserves JSON across reconnects", async () => {
    const id = randomUUID(), value = { text: "中文 🔒", nested: [null, false, { value: 42 }], revision: 1 };
    const first = await open();
    try { await first.writeDocument(id, value); } finally { await first.close(); }
    const second = await open();
    try {
      expect(await second.readDocument(id)).toEqual(value);
      await second.writeDocument(id, { ...value, revision: 2 });
      expect(await second.readDocument(id)).toEqual({ ...value, revision: 2 });
      expect(await second.readDocument(randomUUID())).toBeUndefined();
    } finally { await second.close(); }
  });
  it("rolls back all writes on failure and releases exclusive locks after errors", async () => {
    const first = await open(), second = await open(), id = randomUUID();
    try {
      await expect(first.exclusive(() => first.transaction(async () => {
        await first.writeDocument(id, { revision: 1 });
        throw new Error("abort transaction");
      }))).rejects.toThrow("abort transaction");
      expect(await second.readDocument(id)).toBeUndefined();
      await second.exclusive(() => second.transaction(() => second.writeDocument(id, { revision: 2 })));
      expect(await first.readDocument(id)).toEqual({ revision: 2 });
    } finally { await first.close(); await second.close(); }
  });
  it("serializes overlapping connections without losing increments", async () => {
    const first = await open(), second = await open(), id = randomUUID();
    try {
      await first.writeDocument(id, { count: 0 });
      await Promise.all(Array.from({ length: 8 }, (_, i) => {
        const db = i % 2 ? first : second;
        return db.exclusive(async () => {
          const value = (await db.readDocument<{ count: number }>(id))!;
          await new Promise(resolve => setTimeout(resolve, 10));
          await db.writeDocument(id, { count: value.count + 1 });
        });
      }));
      expect(await first.readDocument(id)).toEqual({ count: 8 });
    } finally { await first.close(); await second.close(); }
  });
  it("keeps record identity and idempotency references when remote IDs conflict", async () => {
    const db = await open(), id = randomUUID(), remoteId = randomUUID(), key = randomUUID();
    const row: Row = { id, source: "Guard", remoteId, state: "synced", revision: 1,
      entity: { ...blankDraft, id, source: "Guard", kind: "policies", name: "Contract", owner: "Tester", status: "Draft", version: 1, revisions: [], createdAt: 1, updatedAt: 1 } };
    try {
      await db.transaction(async () => { await db.put(row); await db.addRequest(key, "fingerprint", id); });
      await expect(db.put({ ...row, id: randomUUID() })).rejects.toThrow();
      expect((await db.rows()).find(item => item.id === id)).toEqual(row);
      expect(await db.request(key)).toEqual({ fingerprint: "fingerprint", record_id: id });
      await db.put({ ...row, revision: 2 });
      expect((await db.rows()).find(item => item.id === id)?.revision).toBe(2);
    } finally { await db.close(); }
  });
});
