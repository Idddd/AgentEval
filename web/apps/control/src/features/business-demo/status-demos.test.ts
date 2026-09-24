import { describe, expect, it } from 'vitest';
import { addStatusDemos, addFailureDemo, ensurePolicySources, balanceStatusDemos } from './status-demos';
import { advanceProcessing, entitySchema } from './model';

describe('homepage status examples', () => {
  it('keeps one example of each non-ready status and balances only once', () => {
    const items = balanceStatusDemos(ensurePolicySources(addFailureDemo(addStatusDemos([], null, 1000), null, 1000)), null, 1000);
    for (const status of ['Draft', 'Evaluating', 'Pending approve', 'Needs input']) expect(items.filter(item => item.status === status)).toHaveLength(1);
    expect(items.filter(item => item.status === 'Ready')).toHaveLength(4);
    items.forEach(item => expect(entitySchema.safeParse(item).success).toBe(true));
    expect(balanceStatusDemos(items, JSON.stringify({balancedStatusesVersion: 1}))).toBe(items);
  });
  it('fills missing sources without changing workflow stages or selected sources', () => {
    const items = addStatusDemos([], null, 1000);
    const normalized = ensurePolicySources(items);
    expect(normalized.every(item => item.workflow?.sources?.length)).toBe(true);
    expect(normalized.map(item => item.workflow?.stage)).toEqual(items.map(item => item.workflow?.stage));
    expect(normalized[2]?.workflow?.sources).toEqual(['F5']);
    expect(ensurePolicySources(normalized)).toEqual(normalized);
  });
  it('adds one explicit failure fixture with detailed errors without restoring deleted fixtures', () => {
    const items = addFailureDemo([], null, 1000);
    expect(entitySchema.safeParse(items[0]).success).toBe(true);
    expect(items[0]?.workflow?.evaluation?.results.every(r => r.fail === 1 && r.details[0]?.includes('Expected: BLOCK') && r.details[0]?.includes('Actual: ALLOW'))).toBe(true);
    expect(addFailureDemo(items, null)).toBe(items);
    expect(addFailureDemo([], JSON.stringify({failureDemoVersion: 1}))).toEqual([]);
  });
  it('covers every workflow stage with valid records', () => {
    const items = addStatusDemos([], null, 1000);
    expect(items.map(item => item.workflow?.stage)).toEqual(['Draft', 'Awaiting Agent Wizard', 'Configuring', 'Evaluating', 'Pending approve', 'Needs input', 'Ready']);
    items.forEach(item => expect(entitySchema.safeParse(item).success).toBe(true));
    expect(items.find(item => item.status === 'Pending approve')?.workflow?.evaluation?.results.every(result => result.status === 'completed')).toBe(true);
  });
  it('preserves existing records and does not duplicate or restore deleted demos', () => {
    const existing = addStatusDemos([], null, 1000);
    expect(addStatusDemos(existing, null, 2000)).toEqual(existing);
    const remaining = existing.slice(1);
    expect(addStatusDemos(remaining, JSON.stringify({statusDemosVersion: 1}), 2000)).toBe(remaining);
  });
  it('keeps the evaluating preview visible without freezing normal evaluations', () => {
    const preview = addStatusDemos([], null, 1000).find(item => item.status === 'Evaluating')!;
    expect(advanceProcessing([preview], 10000)[0]!.status).toBe('Evaluating');
    const normal = { ...preview, workflow: { ...preview.workflow!, statusPreview: false } };
    expect(advanceProcessing([normal], 10000)[0]!.status).toBe('Pending approve');
  });
});
