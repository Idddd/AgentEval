/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvaluationLayerProvider } from '../mock-provider';
import { cloneEvaluationLayerFixtures } from '../fixture-validation';
import { createEvaluationLayerStore } from '../mock-store';
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
  it('shows the immutable Policy versions behind a Guardrail release', () => {
    const state = cloneEvaluationLayerFixtures();
    const template = state.guardrailTemplates.find((item) => item.name === 'Universal Safety Baseline')!;
    template.sourcePolicies = [
      { id: 'prompt', version: '1', name: 'Prompt Injection Protection', description: '', ruleCount: 1, testCaseCount: 2 },
      { id: 'pii', version: '2', name: 'Sensitive Data Protection', description: '', ruleCount: 2, testCaseCount: 3 },
    ];
    template.runtimePosture = { safetyLevel: 'strict', outputDelivery: 'full_buffered' };

    render(
      <EvaluationLayerProvider projectId='individual' store={createEvaluationLayerStore(state)}>
        <EvaluationRunSetup onRunCreated={vi.fn()} />
      </EvaluationLayerProvider>,
    );

    const packs = screen.getByRole('group', { name: 'Safety checks' });
    expect(within(packs).getByText('2 pinned Policies · 5 tests')).not.toBeNull();
    expect(within(packs).getByText('Prompt Injection Protection · v1')).not.toBeNull();
    expect(within(packs).getByText('Sensitive Data Protection · v2')).not.toBeNull();
    expect(within(packs).getByText('strict · full buffered')).not.toBeNull();
  });

  it('reuses the latest run Guardrail packs and keeps the baseline selection required', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationRunSetup onRunCreated={vi.fn()} />
      </EvaluationLayerProvider>,
    );

    expect(screen.getByText('Test coverage')).not.toBeNull();
    expect(screen.getByRole('combobox', { name: 'Business Dataset' })).not.toBeNull();
    const packs = screen.getByRole('group', { name: 'Safety checks' });
    const required = within(packs).getByRole('checkbox', { name: 'Select Universal Safety Baseline' }) as HTMLInputElement;
    const optional = within(packs).getByRole('checkbox', { name: 'Select Agent Prompt Injection' }) as HTMLInputElement;
    expect(required.checked).toBe(true);
    expect(required.disabled).toBe(true);
    expect(optional.checked).toBe(true);
    expect(optional.disabled).toBe(false);
    expect(within(packs).queryByText('MCP Tool Authorization')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('waiting for an Admin decision');
    expect((screen.getByRole('button', { name: 'Start evaluation' }) as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(optional);
    expect(optional.checked).toBe(false);
    expect(within(packs).getByText(/1 selected · \d+ safety cases/)).not.toBeNull();
    expect(within(packs).queryByText('Choose at least one safety check before running the evaluation.')).toBeNull();
  });
});
