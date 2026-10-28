import { MarketplaceStore } from "./marketplace-db";
import { openDatabase } from "./storage/database";

export async function openMarketplaceStore(env: NodeJS.ProcessEnv) {
  const persistence = env.MARKETPLACE_DATABASE_URL ? await openDatabase(env) : env.MARKETPLACE_DB_FILE;
  if (!persistence) throw new Error("Marketplace storage is not configured");
  const store = new MarketplaceStore(persistence);
  try { await store.initialize(); return store; }
  catch (error) { await store.close().catch(() => undefined); throw error; }
}
