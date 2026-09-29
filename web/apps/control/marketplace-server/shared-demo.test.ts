import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SharedDemoStore, sharedDemoApi } from './shared-demo';
import { blankDraft, seedEntities, type Entity } from '../src/features/business-demo/model';
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(dir => rmSync(dir, {recursive: true, force: true})));
const item: Entity = { ...blankDraft, id: 'one', kind: 'policies', name: 'Shared', owner: 'Compliance', text: 'Protect data', status: 'Needs input', version: 1, revisions: [], createdAt: 1, updatedAt: 1 };
it('persists across restart, migrates labels, and rejects stale overwrites', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shared-demo-')); directories.push(dir);
  const path = join(dir, 'demo.sqlite');
  const store = new SharedDemoStore(path);
  expect(store.read().revision).toBe(0);
  const saved = store.write(0, [item]);
  expect(saved.items[0]?.owner).toBe('LCS');
  expect(saved.items[0]?.status).toBe('Submitted');
  expect(() => store.write(0, [])).toThrow('changed');
  store.close();
  const reopened = new SharedDemoStore(path);
  expect(reopened.read()).toEqual(saved);
  reopened.write(saved.revision, []);
  expect(reopened.read().items).toEqual([]);
  expect(() => reopened.write(0, [item])).toThrow('changed');
  reopened.close();
});
it('keeps the API opt-in and rejects cross-origin writes', async () => {
  expect((await sharedDemoApi(new Request('http://demo/api/demo-state'), {})).status).toBe(404);
  const env = {MARKETPLACE_DATA_MODE:'mock', MARKETPLACE_DEMO_DB_FILE:':memory:', MARKETPLACE_PUBLIC_ORIGIN:'https://demo.example'};
  expect((await sharedDemoApi(new Request('http://demo/api/demo-state', {method:'PUT',headers:{origin:'https://other.example','content-type':'application/json'},body:'{}'}), env)).status).toBe(403);
  const send = (revision: number, items: Entity[]) => sharedDemoApi(new Request('http://demo/api/demo-state', {method:'PUT',headers:{origin:'https://demo.example','content-type':'application/json'},body:JSON.stringify({revision,items})}), env);
  expect((await send(0, [item])).status).toBe(200);
  expect((await send(0, [])).status).toBe(409);
  const response = await sharedDemoApi(new Request('http://demo/api/demo-state'), env);
  expect((await response.json()).items[0].name).toBe('Shared');
});

it('compacts trace details before SQLite persistence and preserves counters',()=>{
 const store=new SharedDemoStore(':memory:');
 try{
 const p=seedEntities().find(x=>x.kind==='guardrails')!;
 p.runtime={approval:'off',events:Array.from({length:250},(_,i)=>({id:`e${i}`,traceId:`t${i}`,stageId:'legacy',guardrailId:p.policies[0]!.policyId,guardrailName:'Guardrail',version:1,profileSnapshot:'configuration',agent:'Agent',mode:'monitoring' as const,decision:'allow' as const,enforced:false,receivedAt:Date.now()-5000-i,startedAt:Date.now()-5000-i,completedAt:Date.now()-4000-i,durationMs:1000,message:'Passed'}))};
 const saved=store.write(0,[p]);
 const runtime=store.read().items[0]!.runtime!;
 expect(runtime.events.length).toBe(200);
 expect(runtime.rollups?.reduce((n,r)=>n+r.count,0)).toBe(50);
 expect(()=>store.write(saved.revision,[{...p,text:'x'.repeat(2100000)}])).toThrow(/capacity/i);
 expect(store.read().revision).toBe(saved.revision);
 }finally{store.close()}
});
