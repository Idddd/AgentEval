import { describe, expect, it } from 'vitest';
import { blankDraft, enforceMandatory, includeMandatory, isMandatoryFor, saveEntity, seedEntities, validateDraft, type Entity } from './model';

const policy: Entity = {...seedEntities().find(p=>p.kind==='policies')!, id:'required', status:'Ready', version:1, revisions:[], mandatory:true, mandatoryLocations:['SG']};
const profile: Entity = {...seedEntities().find(p=>p.kind==='guardrails')!, id:'profile', status:'Ready', location:'SG', policies:[]};
describe('Mandatory Guardrails',()=>{
 it('matches target regions and all-region profiles',()=>{
  expect(isMandatoryFor(policy,'SG')).toBe(true);
  expect(isMandatoryFor(policy,'CN')).toBe(false);
  expect(isMandatoryFor(policy,'All')).toBe(true);
  expect(isMandatoryFor({...policy,mandatoryLocations:['All']},'CN')).toBe(true);
 });
 it('automatically binds existing profiles without duplicating refs',()=>{
  const items=enforceMandatory([policy,profile,{...profile,id:'cn',location:'CN'}]);
  expect(items[1]!.policies.map(p=>p.policyId)).toEqual(['required']);
  expect(items[2]!.policies).toEqual([]);
  expect(enforceMandatory(items)).toBe(items);
 });
 it('adds required refs for new profiles and when changing regions',()=>{
  const draft={...profile,policies:[]};
  expect(saveEntity('guardrails',draft,false,1,'new',undefined,[policy]).policies).toHaveLength(1);
  expect(saveEntity('guardrails',draft,false,1,profile.id,{...profile,location:'CN'},[policy]).policies).toHaveLength(1);
 });
 it('rejects removing a mandatory binding but allows removal outside its scope',()=>{
  const existing=enforceMandatory([policy,profile])[1]!;
  expect(()=>saveEntity('guardrails',{...existing,policies:[]},false,1,existing.id,existing,[policy])).toThrow(/Mandatory/);
  expect(saveEntity('guardrails',{...existing,location:'CN',policies:[]},false,1,existing.id,existing,[policy]).policies).toEqual([]);
 });
 it('waits for approved versions and retains existing pinned versions',()=>{
  expect(includeMandatory([], [{...policy,status:'Draft'}], 'SG')).toEqual([]);
  const revised={...policy,status:'Draft' as const,version:2,revisions:[{version:1,name:policy.name,text:policy.text}]};
  const old=includeMandatory([], [revised], 'SG');
  expect(old[0]!.version).toBe(1);
  expect(includeMandatory(old,[{...revised,status:'Ready'}],'SG')).toBe(old);
 });
 it('requires a target region for mandatory creation',()=>{
  expect(validateDraft('policies',{...blankDraft,name:'Required',mandatory:true},false).mandatoryLocations).toBeTruthy();
 });
});
