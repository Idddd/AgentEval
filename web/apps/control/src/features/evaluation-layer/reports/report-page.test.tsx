/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvaluationLayerProvider } from '../mock-provider';
import { EvaluationReportDetail } from './report-page';

const roleState = vi.hoisted(() => ({ value: 'admin' }));

vi.mock('@/hooks/use-project', () => ({
  useCurrentProjectId: () => 'individual',
}));

vi.mock('@/hooks/use-project-permissions', () => ({
  useEffectiveProjectRole: () => roleState.value,
}));

afterEach(() => {
  roleState.value = 'admin';
  cleanup();
});

function reportView(
  decisionMode: 'inline' | 'hidden' = 'inline',
  reportId = 'report-permission-baseline',
) {
  return (
    <EvaluationLayerProvider projectId='individual'>
      <EvaluationReportDetail
        reportId={reportId}
        embedded
        decisionMode={decisionMode}
      />
    </EvaluationLayerProvider>
  );
}

describe('Evaluation report Developer changes', () => {
  it('keeps source groups in Test Results without repeating their counts in Summary', () => {
    render(reportView('hidden'));

    expect(screen.queryByText('Business Dataset results')).toBeNull();
    expect(screen.queryByText('Guardrail Test Pack results')).toBeNull();
    expect(screen.getByText('Business Dataset')).not.toBeNull();
    expect(screen.getAllByText('Office Assistant Core Scenarios').length).toBe(2);
    expect(screen.getByText('Universal Safety Baseline')).not.toBeNull();
    expect(screen.getByText('Agent Prompt Injection')).not.toBeNull();
    expect(screen.getByText('Failed cases')).not.toBeNull();
    expect(screen.getAllByText('guardrail-agent-instruction-override').length).toBeGreaterThanOrEqual(2);

    const failure = screen.getByText('Failure reasons').closest('[data-slot="card"]');
    const reflection = screen.getByText('Suggestion').closest('[data-slot="card"]');
    const results = screen.getByText('Test Results').closest('[data-slot="card"]');
    expect(failure?.parentElement).toBe(reflection?.parentElement);
    expect(failure!.compareDocumentPosition(results!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(reflection!.compareDocumentPosition(results!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.queryByText('Comparison')).toBeNull();
  });

  it('shows simulated Tool Evidence and a one-line cost summary when traces have no tool calls', () => {
    render(reportView('hidden', 'report-skill-summary-baseline'));

    const evidence = within(screen.getByText('Tool Evidence').closest('[data-slot="card"]')! as HTMLElement);
    expect(evidence.getAllByText('Demo')).toHaveLength(4);
    expect(evidence.getAllByText('Skill invocation')).toHaveLength(4);

    const usage = within(screen.getByText('Usage & Cost').closest('[data-slot="card"]')! as HTMLElement);
    expect(usage.getByText('Total cost')).not.toBeNull();
    expect(usage.getByText('USD')).not.toBeNull();
    expect(usage.queryByText('Agent')).toBeNull();
    expect(usage.queryByText('Judge')).toBeNull();
    expect(usage.queryByText('Trace count')).toBeNull();
  });

  it('keeps Tool Evidence compact and expands one output at a time', async () => {
    render(reportView('hidden'));
    const evidence = within(
      screen.getByText('Tool Evidence').closest('[data-slot="card"]')! as HTMLElement,
    );
    const firstTrace = 'demo-weather-guest-allow';
    const secondTrace = 'demo-employee-dept-hr-allow';

    expect(evidence.queryByText(/The weather in Paris is sunny/)).toBeNull();
    const first = evidence.getByRole('button', { name: `View output for ${firstTrace}` });
    expect(first.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(first);
    expect(evidence.getByText(/The weather in Paris is sunny/)).not.toBeNull();
    expect(evidence.getByRole('button', { name: `Hide output for ${firstTrace}` })).not.toBeNull();

    await userEvent.click(
      evidence.getByRole('button', { name: `View output for ${secondTrace}` }),
    );
    expect(evidence.queryByText(/The weather in Paris is sunny/)).toBeNull();
    expect(evidence.getByText(/Alice works in Platform Engineering/)).not.toBeNull();

    await userEvent.click(
      evidence.getByRole('button', { name: `Hide output for ${secondTrace}` }),
    );
    expect(evidence.queryByText(/Alice works in Platform Engineering/)).toBeNull();
  });

  it('allows only the Developer role to apply Reflection after rejection', async () => {
    const view = render(reportView());

    await userEvent.click(screen.getByRole('button', { name: 'Reject evaluation' }));

    expect(screen.queryByRole('button', { name: 'Finish without changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply selected changes' })).toBeNull();
    expect(screen.getByText('Developer access is required to update the Target after rejection.')).not.toBeNull();

    roleState.value = 'ada';
    view.rerender(reportView());
    expect(screen.queryByRole('button', { name: 'Finish without changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply selected changes' })).toBeNull();

    roleState.value = 'member';
    view.rerender(reportView());
    expect(screen.getByRole('button', { name: 'Finish without changes' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Apply selected changes' })).not.toBeNull();
    expect((screen.getByRole('checkbox', { name: /Run the permission guard/ }) as HTMLInputElement).disabled).toBe(false);
  });

  it('keeps continuous-workspace Result details free of Reflection actions', async () => {
    const view = render(reportView());
    await userEvent.click(screen.getByRole('button', { name: 'Reject evaluation' }));

    roleState.value = 'member';
    view.rerender(reportView('hidden'));

    expect(
      screen.getByText(
        'Run the permission guard before EmployeeQueryTool execution to prevent restricted data exposure.',
      ),
    ).not.toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Run the permission guard/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finish without changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply selected changes' })).toBeNull();
    expect(screen.getByText('Suggestions can be applied by Developers in the standalone report.')).not.toBeNull();
  });

  it('presents evidence-backed Suggestions with an enabled no-op Action', async () => {
    render(reportView('hidden'));

    expect(screen.getByText('Suggestion')).not.toBeNull();
    expect(screen.queryByText('Reflection')).toBeNull();
    const suggestion = screen.getByText(
      'Run the permission guard before EmployeeQueryTool execution to prevent restricted data exposure.',
    );
    const action = screen.getByRole('button', { name: 'Action' }) as HTMLButtonElement;

    expect(suggestion).not.toBeNull();
    expect(action.disabled).toBe(false);
    expect(action.className).toContain('bg-blue-600');
    expect(action.className).toContain('text-white');
    expect(action.className).toContain('hover:bg-blue-700');
    await userEvent.click(action);
    expect(suggestion.isConnected).toBe(true);
  });
});
