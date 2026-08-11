/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
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

function reportView(decisionMode: 'inline' | 'hidden' = 'inline') {
  return (
    <EvaluationLayerProvider projectId='individual'>
      <EvaluationReportDetail
        reportId='report-permission-baseline'
        embedded
        decisionMode={decisionMode}
      />
    </EvaluationLayerProvider>
  );
}

describe('Evaluation report Developer changes', () => {
  it('separates Business Dataset results from Guardrail Test Pack results', () => {
    render(reportView('hidden'));

    expect(screen.getByText('Business Dataset results')).not.toBeNull();
    expect(screen.getByText('Guardrail Test Pack results')).not.toBeNull();
    expect(screen.getAllByText('Office Assistant Core Scenarios').length).toBe(2);
    expect(screen.getByText('Universal Safety Baseline')).not.toBeNull();
    expect(screen.getByText('Agent Prompt Injection')).not.toBeNull();
    expect(screen.getByText('Failed cases')).not.toBeNull();
    expect(screen.getAllByText('guardrail-agent-instruction-override').length).toBeGreaterThanOrEqual(2);
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

    expect(screen.getByText('Run the permission guard before EmployeeQueryTool execution.')).not.toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Run the permission guard/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finish without changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply selected changes' })).toBeNull();
    expect(screen.getByText('Reflection changes are available to Developers in the standalone report.')).not.toBeNull();
  });
});
