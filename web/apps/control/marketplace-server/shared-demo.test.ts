import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SharedDemoStore, sharedDemoApi } from './shared-demo';
import { blankDraft, seedEntities, type Entity } from '../src/features/business-demo/model';
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(dir => rmSync(dir, {recursive: true, force: true})));
const item: Entity = { ...blankDraft, id: 'one', kind: 'policies', name: 'Shared', owner: 'Compliance', text: 'Protect data', status: 'Needs input', version: 1, revisions: [], createdAt: 1, updatedAt: 1 };
it('serves shared memory when the database path cannot open',async()=>{
 const env={MARKETPLACE_DATA_MODE:'mock',MARKETPLACE_DEMO_DB_FILE:'\u0000invalid-database'};
 const response=await sharedDemoApi(new Request('http://demo/api/demo-state'),env);
 expect(response.status).toBe(200);
 const {revision}=await response.json();
 const saved=await sharedDemoApi(new Request('http://demo/api/demo-state',{method:'PUT',headers:{origin:'http://demo','content-type':'application/json'},body:JSON.stringify({revision,items:[item]})}),env);
 expect(saved.status).toBe(200);
 const next=await (await sharedDemoApi(new Request('http://demo/api/demo-state'),env)).json();
 expect(next.items[0].name).toBe('Shared');
});
it('continues sharing and saving in memory when SQLite fails',async()=>{
 const env={MARKETPLACE_DATA_MODE:'mock',MARKETPLACE_DEMO_DB_FILE:join(mkdtempSync(join(tmpdir(),'fallback-')),'demo.sqlite')};
 directories.push(join(env.MARKETPLACE_DEMO_DB_FILE,'..'));
 const read=async()=> (await sharedDemoApi(new Request('http://demo/api/demo-state'),env)).json();
 const save=(revision:number,name:string)=>sharedDemoApi(new Request('http://demo/api/demo-state',{method:'PUT',headers:{origin:'http://demo','content-type':'application/json'},body:JSON.stringify({revision,items:[{...item,name}]})}),env);
 expect((await save(0,'Before failure')).status).toBe(200);
 const failure=vi.spyOn(SharedDemoStore.prototype,'write').mockImplementation(()=>{throw new Error('SQLITE_READONLY')});
 try{
  expect((await save(1,'After failure')).status).toBe(200);
  expect((await read()).items[0].name).toBe('After failure');
  expect((await save(1,'Stale')).status).toBe(409);
  expect((await save(2,'Shared memory')).status).toBe(200);
  expect((await read()).items[0].name).toBe('Shared memory');
 }finally{failure.mockRestore()}
});
it('accepts browser same-origin writes behind TLS termination without trusting cross-site requests', async()=>{
 const send=(site:string,origin:string,configured?:string)=>sharedDemoApi(new Request('http://internal:8080/api/demo-state',{method:'PUT',headers:{origin,'sec-fetch-site':site,'content-type':'application/json'},body:'{}'}),{MARKETPLACE_DATA_MODE:'mock',...(configured?{MARKETPLACE_PUBLIC_ORIGIN:configured}:{})});
 // Invalid data should reach payload validation (400), not origin rejection (403).
 expect((await send('same-origin','https://demo.example')).status).toBe(400);
 expect((await send('cross-site','https://attacker.example')).status).toBe(403);
 expect((await send('same-site','https://sibling.example')).status).toBe(403);
 expect((await send('same-origin','null')).status).toBe(403);
 expect((await send('same-origin','https://demo.example','https://other.example')).status).toBe(403);
 expect((await send('same-origin','https://demo.example','https://demo.example/')).status).toBe(400);
});
it('memory mode ignores an unusable legacy file path and exports shared cases', async () => {
 const env={MARKETPLACE_DATA_MODE:'mock',MARKETPLACE_DEMO_STORAGE:'memory',MARKETPLACE_DEMO_DB_FILE:'/proc/unwritable/demo.sqlite'};
 const response=await sharedDemoApi(new Request('http://demo/api/demo-state?download=1'),env);
 expect(response.status).toBe(200);
 expect(response.headers.get('content-disposition')).toContain('attachment');
 expect(await response.json()).toMatchObject({format:'tali-demo',version:1,items:expect.any(Array)});
});
it('persists mandatory bindings and restores attempted removals',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mandatory-demo-'));directories.push(dir);
 const path=join(dir,'demo.sqlite');const store=new SharedDemoStore(path);
 const required={...item,status:'Ready' as const,mandatory:true,mandatoryLocations:['SG' as const]};
 const profile={...seedEntities().find(p=>p.kind==='guardrails')!,location:'SG',policies:[]};
 const first=store.write(0,[required,profile]);
 expect(first.items.find(p=>p.id===profile.id)!.policies[0]!.policyId).toBe(required.id);
 const next=store.write(first.revision,first.items.map(p=>p.id===profile.id?{...p,policies:[]}:p));
 expect(next.items.find(p=>p.id===profile.id)!.policies).toHaveLength(1);
 store.close();const reopened=new SharedDemoStore(path);
 expect(reopened.read().items.find(p=>p.id===profile.id)!.policies).toHaveLength(1);reopened.close();
});
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
it('uses the database in mock mode and rejects cross-origin writes', async () => {
  expect((await sharedDemoApi(new Request('http://demo/api/demo-state'), {MARKETPLACE_DATA_MODE:'live'})).status).toBe(404);
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

it('enables database sharing without an opt-in flag',async()=>{
 const response=await sharedDemoApi(new Request('http://demo/api/demo-state'),{MARKETPLACE_DATA_MODE:'mock',MARKETPLACE_DEMO_DB_FILE:':memory:'});
 expect(response.status).toBe(200);
});
it('restores exported cases for other clients and rejects corrupt or stale imports',async()=>{
 const env={MARKETPLACE_DATA_MODE:'mock',MARKETPLACE_DEMO_STORAGE:'memory'};
 const read=async()=> (await sharedDemoApi(new Request('http://demo/api/demo-state'),env)).json();
 const restore=(revision:number,backup:unknown)=>sharedDemoApi(new Request('http://demo/api/demo-state',{method:'PUT',headers:{origin:'http://demo','content-type':'application/json'},body:JSON.stringify({revision,backup})}),env);
 const exported=await (await sharedDemoApi(new Request('http://demo/api/demo-state?download=1'),env)).json();
 const before=await read();
 expect((await restore(before.revision,{...exported,items:[{...item,name:'Restored case'}]})).status).toBe(200);
 const after=await read();
 expect(after.items[0].name).toBe('Restored case');
 expect((await restore(before.revision,exported)).status).toBe(409);
 expect((await restore(after.revision,{...exported,items:[{id:'broken'}]})).status).toBe(400);
 expect((await restore(after.revision,{...exported,items:[item,item]})).status).toBe(400);
 expect((await read()).items).toEqual(after.items);
 expect((await restore(after.revision,exported)).status).toBe(200);
});
