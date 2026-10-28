import { expect, it, vi } from "vitest";
const open = vi.hoisted(() => vi.fn());
vi.mock("./storage/database", () => ({ openDatabase: open }));
import { openMarketplaceStore } from "./marketplace-store";
it("rejects failed startup recovery, closes its pool, and permits a fresh open", async () => {
  const close = vi.fn();
  const broken = { rows: vi.fn().mockRejectedValue(new Error("Temporary connection loss")), exclusive: (fn: () => Promise<unknown>) => fn(), close };
  const healthy = { ...broken, rows: vi.fn().mockResolvedValue([]), close: vi.fn() };
  open.mockResolvedValueOnce(broken).mockResolvedValueOnce(healthy);
  const env = { MARKETPLACE_DATABASE_URL: "mariadb://localhost/test" };
  await expect(openMarketplaceStore(env)).rejects.toThrow("Temporary connection loss");
  expect(close).toHaveBeenCalledOnce();
  const retry = await openMarketplaceStore(env);
  expect(await retry.list()).toEqual([]);
  await retry.close();
  expect(healthy.close).toHaveBeenCalledOnce();
});
