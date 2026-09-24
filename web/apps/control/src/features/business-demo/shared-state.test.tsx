/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSharedState } from './shared-state';
import { blankDraft, type Entity } from './model';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const item: Entity = {...blankDraft,id:'demo',kind:'policies',name:'Saved record',text:'Private data',status:'Draft',owner:'Admin',version:1,revisions:[],createdAt:1,updatedAt:1};
it('initializes once and loads server data instead of stale browser data after refresh', async () => {
  let state = {revision:0, items:[] as Entity[]};
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    if (init.method === 'PUT') { const next = JSON.parse(init.body); if (next.revision !== state.revision) return Response.json({error:'Shared data changed'}, {status:409}); state = {revision:state.revision+1,items:next.items}; }
    return Response.json(state);
  }));
  const first = renderHook(() => useSharedState(true, () => [item]));
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  await act(async () => { await first.result.current.commit(items => items.map(value => ({...value,name:'Edited'}))); });
  first.unmount();
  const second = renderHook(() => useSharedState(true, () => [item]));
  await waitFor(() => expect(second.result.current.ready).toBe(true));
  expect(second.result.current.items[0]?.name).toBe('Edited');
  await act(async () => { await second.result.current.commit(() => []); });
  second.unmount();
  const third = renderHook(() => useSharedState(true, () => [item]));
  await waitFor(() => expect(third.result.current.ready).toBe(true));
  expect(third.result.current.items).toEqual([]);
});
it('does not claim a failed server write was saved', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => init.method === 'GET' ? Response.json({revision:1,items:[item]}) : Response.json({error:'Storage unavailable'}, {status:503})));
  const view = renderHook(() => useSharedState(true, () => []));
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  await act(async () => { await expect(view.result.current.commit(() => [])).rejects.toThrow('Storage unavailable'); });
  expect(view.result.current.items).toHaveLength(1);
  expect(view.result.current.error).toBe('Storage unavailable');
});
