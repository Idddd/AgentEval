import { expect, it } from 'vitest';
import { defaultDemo, replaceLegacyExamples } from './default-demo';
import { entitySchema, seedEntities } from './model';
import { readUnified } from './evaluation';

it('provides customer and internal profiles linked to the supplied banking, governance and PII rules',()=>{
 const items=defaultDemo(10000);
 const profiles=items.filter(p=>p.kind==='guardrails');
 expect(profiles).toHaveLength(2);
 expect(profiles[0]!.policies).toHaveLength(2);
 const policies=items.filter(p=>p.kind==='policies');
 expect(policies).toHaveLength(3);
 expect(policies.map(p=>p.workflow!.config!.direction).sort()).toEqual(['both','request','response']);
 expect(profiles[1]!.policies.map(p=>p.policyId)).toEqual(['default-internal-agent-governance','default-pii-response']);
 for(const policy of policies){
  expect(policy.workflow!.config!.content).toMatch(/Treat.*untrusted/);
  expect(policy.workflow!.config!.content).toContain('ALLOW');
  expect(policy.workflow!.config!.content).toContain('BLOCK');
  expect(policy.workflow!.config!.content).not.toMatch(/Generate a|Create a scanner/i);
  expect(policy.workflow!.evaluation!.results[0]!.fail).toBe(0);
 }
 expect(items.every(p=>entitySchema.safeParse(p).success)).toBe(true);
 const detected=profiles[0]!.runtime!.events.filter(e=>e.decision==='would_block');
 expect(detected.map(e=>e.direction).sort()).toEqual(['request','response']);
 expect(detected.every(e=>!!e.scannedContent)).toBe(true);
});
it('replaces built-in examples without losing manually created records',()=>{
 const custom={...seedEntities()[0]!,id:'manual-profile',policies:[]};
 const items=replaceLegacyExamples([...seedEntities(),custom],10000);
 expect(items.find(p=>p.id==='manual-profile')).toEqual(custom);
 expect(items.some(p=>p.id==='customer-interaction')).toBe(false);
 expect(items.filter(p=>p.kind==='guardrails')).toHaveLength(3);
});
it('preserves F5 applied input and scan direction without generating another prompt',()=>{
 const config=readUnified({F5:JSON.stringify({direction:'response',config:{type:'custom',input:'Final detection instructions: BLOCK email addresses.'},version:{name:'v1'}})});
 expect(config.direction).toBe('response');
 expect(config.content).toBe('Final detection instructions: BLOCK email addresses.');
});
