import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { blankDraft, type Entity } from "../src/features/business-demo/model";
import { openMarketplaceStore } from "./marketplace-store";
import type { MarketplaceStore, ProviderBridge } from "./marketplace-db";

const databaseUrl = process.env.MARKETPLACE_TEST_DATABASE_URL;
const opened: MarketplaceStore[] = [];
afterEach(async () => { for (const store of opened.splice(0)) await store.close(); });

async function open() {
  if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) throw new Error("Use a dedicated _test database");
  const store = await openMarketplaceStore({ MARKETPLACE_DATABASE_URL: databaseUrl, MARKETPLACE_DATABASE_PASSWORD: process.env.MARKETPLACE_TEST_DATABASE_PASSWORD });
  opened.push(store);
  return store;
}
function provider() {
  const records: Entity[] = [];
  let creates = 0;
  const bridge: ProviderBridge = {
    list: async source => records.filter(item => item.source === source),
    save: async (source, kind, draft, old) => {
      if (!old) creates++;
      const saved: Entity = { ...draft, source, kind, id: old?.id ?? randomUUID(), owner: "Engine", status: "Draft", version: 1, revisions: [], createdAt: 1, updatedAt: 1 };
      const index = records.findIndex(item => item.id === saved.id);
      if (index < 0) records.push(saved); else records[index] = saved;
      return saved;
    },
    remove: async (_source, item) => { const index = records.findIndex(row => row.id === item.id); if (index >= 0) records.splice(index, 1); },
  };
  return { bridge, records, creates: () => creates };
}

describe.skipIf(!databaseUrl)("real SQL Marketplace repository", () => {
  it("persists business metadata across connections and serializes conflicting updates", async () => {
    const first = await open(), second = await open(), { bridge } = provider();
    const draft = { ...blankDraft, name: `MariaDB-${randomUUID()}`, text: "保护客户数据", busu: "ISS" };
    const saved = await first.exclusive(() => first.save("policies", draft, "admin", bridge, undefined, undefined, randomUUID()));
    expect((await second.list()).find(row => row.id === saved.id)).toMatchObject({ text: "保护客户数据", busu: "ISS", sync: { state: "synced" } });
    const results = await Promise.allSettled([
      first.exclusive(() => first.save("policies", { ...draft, busu: "RMG" }, "admin", bridge, saved.id, saved.sync!.revision)),
      second.exclusive(() => second.save("policies", { ...draft, busu: "LCS" }, "admin", bridge, saved.id, saved.sync!.revision)),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    const current = (await first.list()).find(row => row.id === saved.id)!;
    await first.exclusive(() => first.remove(current.id, current.sync!.revision, bridge));
  });

  it("deduplicates a retried request after reconnection without creating a second provider record", async () => {
    const first = await open(), { bridge, creates } = provider();
    const draft = { ...blankDraft, name: `Retry-${randomUUID()}`, text: "Reject secrets" }, key = randomUUID();
    const saved = await first.exclusive(() => first.save("policies", draft, "admin", bridge, undefined, undefined, key));
    const second = await open();
    const repeated = await second.exclusive(() => second.save("policies", draft, "admin", bridge, undefined, undefined, key));
    expect(repeated.id).toBe(saved.id);
    expect(creates()).toBe(1);
    await expect(second.exclusive(() => second.save("policies", { ...draft, text: "different" }, "admin", bridge, undefined, undefined, key))).rejects.toMatchObject({ status: 409 });
    await second.exclusive(() => second.remove(saved.id, saved.sync!.revision, bridge));
  });

  it("retains an ambiguous remote create across restart and reconciles without another create", async () => {
    const first = await open(), p = provider(), save = p.bridge.save;
    p.bridge.save = async (...args) => { await save(...args); throw new Error("Connection lost after remote creation"); };
    const draft = { ...blankDraft, name: `Uncertain-${randomUUID()}`, text: "Reject SQL injection" };
    const saved = await first.exclusive(() => first.save("policies", draft, "admin", p.bridge, undefined, undefined, randomUUID()));
    expect(saved.sync?.state).toBe("uncertain");
    const second = await open();
    p.bridge.save = save;
    const reconciled = await second.exclusive(() => second.retry(saved.id, p.bridge));
    expect(reconciled.sync?.state).toBe("synced");
    expect(p.creates()).toBe(1);
    await second.exclusive(() => second.remove(saved.id, reconciled.sync!.revision, p.bridge));
  });
});
