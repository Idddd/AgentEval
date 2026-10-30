import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ConnectionStore } from "./nmgr-connection-store";

it("persists shared settings across store instances without plaintext on disk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nmgr-connection-"));
  try {
    const settings = {
      nemoUrl: "https://nemo.private/api/v1",
      nemoToken: "private-business-token",
      databaseUrl: "postgres://app:private-password@db.private/marketplace",
    };
    const first = new ConnectionStore(dir);
    expect(await first.read()).toBeNull();
    await first.save(settings);
    expect(await new ConnectionStore(dir).read()).toEqual(settings);
    const raw = await readFile(join(dir, "connection.json"), "utf8");
    for (const value of Object.values(settings))
      expect(raw).not.toContain(value);
    await first.clear();
    expect(await new ConnectionStore(dir).read()).toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("rejects corrupted data rather than returning fabricated configuration", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nmgr-connection-"));
  try {
    const store = new ConnectionStore(dir);
    await store.save({ nemoToken: "private-token" });
    const { writeFile } = await import("node:fs/promises");
    const file = join(dir, "connection.json"),
      raw = JSON.parse(await readFile(file, "utf8"));
    raw.tag = Buffer.alloc(16).toString("base64");
    await writeFile(file, JSON.stringify(raw));
    await expect(store.read()).rejects.toThrow(/saved connection/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
