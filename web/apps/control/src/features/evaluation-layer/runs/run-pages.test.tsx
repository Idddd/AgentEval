/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvaluationLayerProvider } from '../mock-provider';
import { EvaluationRunDetail } from './run-pages';

vi.mock('@/hooks/use-project', () => ({
  useCurrentProjectId: () => 'individual',
}));

afterEach(cleanup);

describe('Evaluation run detail', () => {
  it('keeps execution details collapsed until the user opens Details', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationRunDetail runId='run-skill-summary-baseline' embedded />
      </EvaluationLayerProvider>,
    );

    expect(screen.getByText('Evaluation complete')).not.toBeNull();
    expect(screen.queryByText('All Cases have deterministic results and the Report is ready.')).toBeNull();
    expect(screen.queryByText('Execution log')).toBeNull();
    expect(screen.queryByText('Case progress')).toBeNull();

    const details = screen.getByRole('button', { name: 'Details' });
    expect(details.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(details);

    expect(screen.getByText('Execution log')).not.toBeNull();
    expect(screen.getByText('Case progress')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Hide details' }).getAttribute('aria-expanded')).toBe('true');
  });
});
