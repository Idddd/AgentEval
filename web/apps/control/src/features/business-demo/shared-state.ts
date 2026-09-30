import { useEffect, useRef, useState } from 'react';
import { entitySchema, enforceMandatory, advanceProcessing, type Entity } from './model';
import { z } from 'zod';
import { compactTraces, assertStorageCapacity } from './trace-retention';
const schema = z.object({revision: z.number().int(), items: z.array(entitySchema)});

export const BROWSER_DEMO_KEY = 'tali-browser-demo-v1';
export function useSharedState(initial: () => Entity[], browserOnly = false) {
  const [items, setItems] = useState<Entity[]>([]);
  const current = useRef(items);
  const revision = useRef(0);
  const writing = useRef(false);
  const local = useRef<z.infer<typeof schema>>({revision:0,items:[]});
  const localAvailable = useRef(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const accept = (snapshot: z.infer<typeof schema>) => {
    revision.current = snapshot.revision; current.current = snapshot.items; setItems(snapshot.items);
  };
  async function request(method = 'GET', value?: unknown) {
    if (browserOnly) {
      if (localAvailable.current) {
        try { const saved = localStorage.getItem(BROWSER_DEMO_KEY); if (saved) local.current = schema.parse(JSON.parse(saved)); }
        catch { localAvailable.current = false; }
      }
      if (method === 'PUT') {
        const candidate = schema.parse(value);
        if (candidate.revision !== local.current.revision) throw new Error('Cases changed in another tab. Reload and try again.');
        local.current = {revision:candidate.revision+1,items:candidate.items};
      } else {
        const next = compactTraces(enforceMandatory(advanceProcessing(local.current.items,Date.now())));
        if (next !== local.current.items) local.current = {revision:local.current.revision+1,items:next};
      }
      if (localAvailable.current) {
        try { localStorage.setItem(BROWSER_DEMO_KEY,JSON.stringify(local.current)); }
        catch { localAvailable.current = false; }
      }
      return local.current;
    }
    const response = await fetch('/api/demo-state', {method, cache: 'no-store', ...(value ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)} : {})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Shared storage unavailable. Changes were not saved.');
    return schema.parse(data);
  }
  useEffect(() => {
    let active = true;
    async function load() {
      if (writing.current) return;
      try {
        let snapshot = await request();
        if (!snapshot.revision) {
          try { snapshot = await request('PUT', {revision: 0, items: compactTraces(initial())}); }
          catch { snapshot = await request(); if (!snapshot.revision) throw new Error('Cannot initialize shared storage.'); }
        }
        if (!active || writing.current) return;
        if (snapshot.revision !== revision.current) accept(snapshot);
        setReady(true); setError('');
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Cannot connect to shared storage.'); }
    }
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => { active = false; clearInterval(timer); };
  }, [attempt, browserOnly]);
  function commit(update: (items: Entity[]) => Entity[]): void | Promise<void> {
    if (!ready || writing.current) throw new Error('Shared data is loading or saving. Please try again.');
    const candidate=update(current.current); if(candidate===current.current)return; const next = compactTraces(enforceMandatory(candidate)); assertStorageCapacity(next);
    writing.current = true; setBusy(true);
    return request('PUT', {revision: revision.current, items: next}).then(snapshot => {
      accept(snapshot); setError('');
    }).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : 'Changes were not saved.';
      setError(message); throw new Error(message);
    }).finally(() => { writing.current = false; setBusy(false); });
  }
  return {items, commit, ready, error, busy, retry: () => setAttempt(value => value + 1)};
}
