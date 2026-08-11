/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  EvaluationLayerCase,
  EvaluationLayerRunResult,
  EvaluationLayerTrace,
} from '../model';
import { GuardrailReport, guardrailReportMetrics } from './guardrail-report';

afterEach(cleanup);

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

  it('renders the Guardrail metrics and decision evidence', () => {
    render(
      <GuardrailReport
        cases={cases}
        results={results}
        traces={[] as EvaluationLayerTrace[]}
      />,
    );

    expect(screen.getByText('3 / 3')).not.toBeNull();
    expect(screen.getByText('1 / 1')).not.toBeNull();
    expect(screen.getByText('4 / 4')).not.toBeNull();
    expect(screen.getByText('Decision details')).not.toBeNull();
  });
});
