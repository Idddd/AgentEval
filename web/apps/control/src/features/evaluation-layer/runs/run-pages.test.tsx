/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvaluationLayerProvider } from '../mock-provider';
import { EvaluationRunDetail, EvaluationRunSetup } from './run-pages';

vi.mock('@/hooks/use-project', () => ({
  useCurrentProjectId: () => 'individual',
}));

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>(
    '@tanstack/react-router',
  );
  return { ...actual, useNavigate: () => vi.fn() };
});

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

describe('Evaluation run setup', () => {
  it('reuses the latest run Guardrail packs and requires at least one selection', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationRunSetup onRunCreated={vi.fn()} />
      </EvaluationLayerProvider>,
    );

    expect(screen.getByText('Test coverage')).not.toBeNull();
    expect(screen.getByRole('combobox', { name: 'Business Dataset' })).not.toBeNull();
    const packs = screen.getByRole('group', { name: 'Guardrail Test Packs' });
    expect((within(packs).getByRole('checkbox', { name: 'Select Universal Safety Baseline' }) as HTMLInputElement).checked).toBe(true);
    expect((within(packs).getByRole('checkbox', { name: 'Select Agent Prompt Injection' }) as HTMLInputElement).checked).toBe(true);
    expect(within(packs).queryByText('MCP Tool Authorization')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('waiting for an Admin decision');
    expect((screen.getByRole('button', { name: 'Start evaluation' }) as HTMLButtonElement).disabled).toBe(true);

    for (const template of within(packs).getAllByRole('checkbox')) await userEvent.click(template);
    expect(within(packs).getByText('Select at least one Guardrail test pack before running the evaluation.')).not.toBeNull();
  });
});
