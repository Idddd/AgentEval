import { useEffect, useRef, useState } from 'react';
import { entitySchema, type Entity } from './model';
import { z } from 'zod';
const schema = z.object({revision: z.number().int(), items: z.array(entitySchema)});

export function useSharedState(enabled: boolean, initial: () => Entity[]) {
  const [items, setItems] = useState(initial);
  const current = useRef(items);
  const revision = useRef(0);
  const writing = useRef(false);
  const [ready, setReady] = useState(!enabled);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const accept = (snapshot: z.infer<typeof schema>) => {
    revision.current = snapshot.revision; current.current = snapshot.items; setItems(snapshot.items);
  };
  async function request(method = 'GET', value?: unknown) {
    const response = await fetch('/api/demo-state', {method, cache: 'no-store', ...(value ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)} : {})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Shared storage unavailable. Changes were not saved.');
    return schema.parse(data);
  }
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    async function load() {
      if (writing.current) return;
      try {
        let snapshot = await request();
        if (!snapshot.revision) {
          try { snapshot = await request('PUT', {revision: 0, items: current.current}); }
          catch { snapshot = await request(); if (!snapshot.revision) throw new Error('Cannot initialize shared storage.'); }
        }
        if (!active || writing.current) return;
        if (snapshot.revision > revision.current) accept(snapshot);
        setReady(true); setError('');
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Cannot connect to shared storage.'); }
    }
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => { active = false; clearInterval(timer); };
  }, [enabled, attempt]);
  function commit(update: (items: Entity[]) => Entity[]): void | Promise<void> {
    if (!enabled) { const next = update(current.current); current.current = next; setItems(next); return; }
    if (!ready || writing.current) throw new Error('Shared data is loading or saving. Please try again.');
    const next = update(current.current);
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
