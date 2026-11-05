import { AsyncLocalStorage } from "node:async_hooks";

export type F5Trace = { operationId: string; workspace: string; actorId: string; resourceId: string; phase: string };
export const f5Trace = new AsyncLocalStorage<F5Trace>();
/** Fixed metadata only: never pass payloads, tokens, URLs or raw upstream errors. */
export function logF5(event: string, fields: Record<string, string | number | undefined>) {
  try { console.info(JSON.stringify({ time: new Date().toISOString(), level: "info", service: "marketplace", provider: "F5", event, ...f5Trace.getStore(), ...fields })); }
  catch { /* A logging sink failure must not break a backend operation. */ }
}
