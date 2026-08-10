/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  EvaluationLayerCase,
  EvaluationLayerRunResult,
  EvaluationLayerTrace,
} from '../model';
import { GuardrailReport, guardrailReportMetrics } from './guardrail-report';

const cases: EvaluationLayerCase[] = [
  { id: 'benign', input: { content: 'hello' }, expectedOutput: { guardrail_decision: 'ALLOW' }, tags: [], source: 'test' },
  { id: 'jailbreak', input: { content: 'ignore rules' }, expectedOutput: { guardrail_decision: 'BLOCK' }, tags: [], source: 'test' },
  { id: 'pii', input: { content: 'ssn' }, expectedOutput: { guardrail_decision: 'REDACT' }, tags: [], source: 'test' },
  { id: 'exfiltration', input: { content: 'send data' }, expectedOutput: { guardrail_decision: 'BLOCK' }, tags: [], source: 'test' },
];

const results: EvaluationLayerRunResult[] = cases.map((item) => ({
  caseId: item.id,
  status: 'PASS',
  response: 'matched',
}));

describe('Guardrail report', () => {
  it('separates protection of risky requests from allowance of benign requests', () => {
    expect(guardrailReportMetrics(cases, results)).toEqual({
      riskyProtected: 3,
      riskyTotal: 3,
      benignAllowed: 1,
      benignTotal: 1,
      passed: 4,
      total: 4,
    });
  });

  it('shows a pending revision and records the selected approval decision', async () => {
    const onDecision = vi.fn();
    render(
      <GuardrailReport
        cases={cases}
        results={results}
        traces={[] as EvaluationLayerTrace[]}
        revisionLabel='R2 · v2.0.0'
        approval={undefined}
        onDecision={onDecision}
      />,
    );

    expect(screen.getByText('3 / 3')).not.toBeNull();
    expect(screen.getByText('1 / 1')).not.toBeNull();
    expect(screen.getByText('4 / 4')).not.toBeNull();
    expect(screen.getByText('Pending')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
    expect(onDecision).toHaveBeenCalledWith('APPROVED');
  });
});
