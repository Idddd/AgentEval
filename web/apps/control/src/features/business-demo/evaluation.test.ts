import { expect, it } from 'vitest';
import { createEvaluation, emptyConfig, readUnified, type Source } from './evaluation';
import { advanceProcessing, blankDraft } from './model';
import { configurePolicy, saveBusinessPolicy } from './policy-workflow';

it.each([['Guard'], ['F5'], ['Guard','F5']] as Source[][])('dispatches only configured sources: %j', (...sources: Source[]) => {
  const config = { ...emptyConfig(), content: 'Protect personal data' };
  const run = createEvaluation('policy', 1, config, sources, 100);
  expect(run.results.map(r=>r.source)).toEqual(sources);
  expect(run.results.every(r => r.success === 12 && r.fail === 0 && r.details.length === 0)).toBe(true);
  expect(createEvaluation('policy', 1, config, sources, 100)).toEqual(run);
});
it('keeps old F5 text and Nemo notes during normalization', () => {
  expect(readUnified({F5: JSON.stringify({config:{type:'custom',input:'line one\nline two'},version:{name:'v2'}})}).content).toBe('line one\nline two');
  expect(readUnified({Guard:'original instructions'}).content).toBe('original instructions');
});
it('preserves a long unified draft with at least one source', () => {
  const policy = saveBusinessPolicy({...blankDraft,name:'Long draft',text:'Requirement'},true,'ISS','User',[]);
  const started = configurePolicy([policy],policy.id,'start','Agent Wizard','IT Admin',{});
  const config = {...emptyConfig(),content:'Paragraph\n'.repeat(5000)};
  expect(() => configurePolicy(started,policy.id,'save','Agent Wizard','IT Admin',{},'',config)).toThrow('Select at least one source');
  const saved = configurePolicy(started,policy.id,'save','Agent Wizard','IT Admin',{Guard: JSON.stringify(config)},'',config);
  expect(saved[0]?.workflow?.config?.content).toBe(config.content);
  expect(saved[0]?.workflow?.sources).toEqual(['Guard']);
  expect(() => configurePolicy(saved,policy.id,'complete','Agent Wizard','IT Admin',{},'',config)).toThrow('Select at least one source');
});
it('requires return reason and invalidates results when configuration resumes', () => {
  const policy = saveBusinessPolicy({...blankDraft,name:'Test',text:'Protect data'},true,'ISS','User',[]);
  const started = configurePolicy([policy],policy.id,'start','Agent Wizard','IT Admin',{});
  const pending = advanceProcessing(configurePolicy(started,policy.id,'complete','Agent Wizard','IT Admin',{F5:JSON.stringify({...emptyConfig(),content:'PII'})}), Date.now()+10000);
  expect(() => configurePolicy(pending,policy.id,'return','Admin','Admin',{})).toThrow('reason');
  const returned = configurePolicy(pending,policy.id,'return','Admin','Admin',{},'Review failures');
  const reopened = configurePolicy(returned,policy.id,'start','Agent Wizard','IT Admin',{F5:JSON.stringify({...emptyConfig(),content:'PII'})});
  expect(reopened[0]?.workflow?.evaluation).toBeUndefined();
  expect(reopened[0]?.workflow?.approval).toBeUndefined();
  expect(reopened[0]?.workflow?.stage).toBe('Configuring');
});
