/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvaluationLayerProvider } from '../mock-provider';
import { cloneEvaluationLayerFixtures } from '../fixture-validation';
import { workspaceRows } from './workspace-view-model';
import {
  CatalogList,
  EvaluationCatalogPage,
  LifecycleNode,
  WorkspaceActionBar,
} from './catalog-page';

const roleState = vi.hoisted(() => ({ value: 'admin' }));

vi.mock('@/hooks/use-project', () => ({
  useCurrentProjectId: () => 'individual',
}));

vi.mock('@/hooks/use-project-permissions', () => ({
  useEffectiveProjectRole: () => roleState.value,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

afterEach(() => {
  roleState.value = 'admin';
  cleanup();
});

describe('Catalog discovery', () => {
  it('does not offer manual target creation in the evaluation catalog', () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Evaluations' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Create target' })).toBeNull();
    expect(screen.queryByText('Frontend demo')).toBeNull();
  });

  it('places Sort beside the view controls instead of a target count', () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );

    const sort = screen.getByRole('combobox', { name: 'Sort' });
    const viewControls = screen.getByRole('button', { name: 'Cards' }).parentElement;

    expect(sort.closest('label')?.parentElement).toBe(viewControls?.parentElement);
    expect(screen.queryByText(/evaluation targets$/i)).toBeNull();
  });
});

describe('Catalog workflow guidance', () => {
  it('opens the matching workflow section from a recommended lifecycle node', async () => {
    const onClick = vi.fn();
    render(
      <LifecycleNode
        label='Dataset'
        value='Not created'
        detail='Create before run'
        tone='waiting'
        recommended
        onClick={onClick}
      />,
    );

    const node = screen.getByRole('button', { name: 'Open Dataset: Not created' });
    expect(node.getAttribute('aria-current')).toBe('step');
    await userEvent.click(node);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('presents one action for the current workflow step', async () => {
    const onAction = vi.fn();
    render(
      <WorkspaceActionBar
        step={{
          tab: 'dataset',
          label: 'Prepare and publish Test Cases',
          description: 'A published Dataset is required before you can run this evaluation.',
        }}
        action={<button type='button' onClick={onAction}>Prepare Test Cases</button>}
      />,
    );

    expect(screen.getByText('Current step')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Prepare Test Cases' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('Catalog drawer progressive disclosure', () => {
  async function openCompletedSkill() {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Document Summarization demo-document-summarization/ }),
    );
    return within(screen.getByRole('dialog', { name: 'Document Summarization' }));
  }

  it('shows the complete workflow without the five top-level tabs', async () => {
    const drawer = await openCompletedSkill();

    for (const tab of ['Workflow', 'Skill', 'Dataset', 'Evaluation', 'Result']) {
      expect(drawer.queryByRole('tab', { name: tab })).toBeNull();
    }
    expect(drawer.getByRole('region', { name: 'Current step: Result' })).not.toBeNull();
    expect(drawer.getByRole('button', { name: 'Details' })).not.toBeNull();
    expect(drawer.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
  });

  it('shows a three-stage workflow and only the current stage by default', async () => {
    const drawer = await openCompletedSkill();
    const workflow = within(drawer.getByRole('group', { name: 'Evaluation workflow' }));

    expect(workflow.getByText('Test coverage')).not.toBeNull();
    expect(workflow.getByText('Evaluation')).not.toBeNull();
    expect(workflow.getByText('Result')).not.toBeNull();
    expect(workflow.queryByText('Revision')).toBeNull();
    expect(drawer.queryByRole('region', { name: 'Skill & revision' })).toBeNull();
    expect(drawer.getAllByRole('region', { name: /Current step/ })).toHaveLength(1);
    expect(drawer.queryByText('R1')).toBeNull();
  });

  it('keeps revision metadata behind Skill details', async () => {
    const drawer = await openCompletedSkill();

    expect(drawer.queryByText('Revision')).toBeNull();
    expect(drawer.queryByText('Configuration')).toBeNull();
    expect(drawer.queryByText('Target ID')).toBeNull();
    expect(drawer.queryByText('Report history')).toBeNull();
    await userEvent.click(drawer.getByRole('button', { name: 'Details' }));
    const panel = within(drawer.getByRole('region', { name: 'Target details' }));

    expect(panel.getAllByText('Revision').length).toBeGreaterThan(0);
    expect(panel.getByText('Configuration')).not.toBeNull();
    expect(panel.getByText('Target ID')).not.toBeNull();
    expect(panel.getByText('Report history')).not.toBeNull();
    expect((panel.getByRole('button', { name: 'Decision pending' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('combines the Business Dataset and required Guardrail test packs in Test coverage', async () => {
    const drawer = await openCompletedSkill();
    await userEvent.click(drawer.getByRole('button', { name: 'Details' }));
    const panel = within(drawer.getByRole('region', { name: 'Test coverage details' }));

    expect(panel.getByText('Business Dataset')).not.toBeNull();
    expect(panel.getByRole('combobox', { name: 'Dataset' })).not.toBeNull();
    expect(panel.getByRole('button', { name: 'Generate' })).not.toBeNull();
    expect(panel.getByRole('group', { name: 'Guardrail Test Packs' })).not.toBeNull();
    expect((panel.getByRole('checkbox', { name: 'Select Universal Safety Baseline' }) as HTMLInputElement).checked).toBe(true);
    expect(panel.getByText(/2 selected · \d+ safety cases/)).not.toBeNull();
    expect(panel.getByText(/Combined coverage: \d+ business cases \+ \d+ Guardrail cases/)).not.toBeNull();
    expect(panel.getByText('Draft cases')).not.toBeNull();
    expect(panel.getByText('Evaluation history')).not.toBeNull();
  });

  it('keeps default Test coverage focused on Dataset actions', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Invoice Classification demo-invoice-classification/ }),
    );
    const drawer = within(screen.getByRole('dialog', { name: 'Invoice Classification' }));
    const current = within(drawer.getByRole('region', { name: 'Current step: Test coverage' }));

    expect(current.getByRole('combobox', { name: 'Dataset' })).not.toBeNull();
    expect(current.getByRole('button', { name: 'Generate Dataset' })).not.toBeNull();
    expect(current.queryByRole('group', { name: 'Guardrail Test Packs' })).toBeNull();
    expect(current.queryByText(/Combined coverage:/)).toBeNull();
  });

  it('shows only Summary and Reason until Result details are opened', async () => {
    const drawer = await openCompletedSkill();
    const panel = within(drawer.getByRole('region', { name: 'Current step: Result' }));

    expect(panel.getByText('Summary')).not.toBeNull();
    expect(panel.getByText('Reason')).not.toBeNull();
    expect(panel.queryByText('Test Results')).toBeNull();
    expect(drawer.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
    await userEvent.click(drawer.getByRole('button', { name: 'Details' }));

    const details = within(drawer.getByRole('region', { name: 'Result details' }));
    expect(details.getByText('Test Results')).not.toBeNull();
    expect(details.getByText('Failure reasons')).not.toBeNull();
    expect(drawer.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('opens all complete information groups from the global Details action', async () => {
    const drawer = await openCompletedSkill();

    for (const name of ['Target details', 'Test coverage details', 'Evaluation details', 'Result details']) {
      expect(drawer.queryByRole('region', { name })).toBeNull();
    }
    await userEvent.click(drawer.getByRole('button', { name: 'Details' }));

    for (const name of ['Target details', 'Test coverage details', 'Evaluation details', 'Result details']) {
      expect(drawer.getByRole('region', { name })).not.toBeNull();
    }
  });

  it('lets an Admin approve a passing evaluation', async () => {
    const drawer = await openCompletedSkill();
    const result = within(drawer.getByRole('region', { name: 'Current step: Result' }));

    expect(result.getAllByText('Pending approval').length).toBeGreaterThan(0);
    expect(drawer.queryByRole('button', { name: 'Reject' })).toBeNull();
    await userEvent.click(drawer.getByRole('button', { name: 'Approve' }));

    expect(result.getAllByText('Approved').length).toBeGreaterThan(0);
    expect(result.getByText(/Approved by Local Administrator/)).not.toBeNull();
    expect(drawer.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(drawer.getByRole('button', { name: 'View results' })).not.toBeNull();
  });

  it('lets an Admin reject an evaluation with findings for Developer changes', async () => {
    const view = render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Office Assistant demo-permission-compliance/ }),
    );
    const drawer = within(screen.getByRole('dialog', { name: 'Office Assistant' }));
    const result = within(drawer.getByRole('region', { name: 'Current step: Result' }));

    expect(result.getAllByText('Pending rejection').length).toBeGreaterThan(0);
    expect(drawer.queryByRole('button', { name: 'Approve' })).toBeNull();
    await userEvent.click(drawer.getByRole('button', { name: 'Reject' }));

    expect(drawer.getAllByText('Rejected').length).toBeGreaterThan(0);
    expect(drawer.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(drawer.queryByRole('button', { name: 'Update target revision' })).toBeNull();
    expect(drawer.getByText('Waiting for Developer changes')).not.toBeNull();

    roleState.value = 'member';
    view.rerender(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(drawer.getByRole('button', { name: 'Update target revision' }));
    const target = within(drawer.getByRole('region', { name: 'Current step: Test coverage' }));
    expect((target.getByRole('button', { name: 'New revision' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('lets an Admin reject an explicitly failed evaluation', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Customer Service demo-permission-compliance-baseline/ }),
    );
    const drawer = within(screen.getByRole('dialog', { name: 'Customer Service' }));

    expect(drawer.getByRole('button', { name: 'Reject' })).not.toBeNull();
    expect(drawer.queryByRole('button', { name: 'Retry evaluation' })).toBeNull();
    await userEvent.click(drawer.getByRole('button', { name: 'Reject' }));

    expect(drawer.getAllByText('Rejected').length).toBeGreaterThan(0);
    expect(drawer.queryByRole('button', { name: 'Update target revision' })).toBeNull();
    expect(drawer.getByText('Waiting for Developer changes')).not.toBeNull();
  });

  it('keeps evaluation decisions read-only for non-admin roles', async () => {
    roleState.value = 'member';
    const drawer = await openCompletedSkill();

    expect(drawer.getByText('Awaiting Admin decision')).not.toBeNull();
    expect(drawer.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(drawer.queryByRole('button', { name: 'Reject' })).toBeNull();
    expect(drawer.getByRole('button', { name: 'View results' })).not.toBeNull();
  });
});

describe('Guardrail evaluation access', () => {
  async function openGuardrailEvaluation() {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /PII Protection Guardrail demo-pii-guardrail/ }),
    );
    const drawer = within(screen.getByRole('dialog', { name: 'PII Protection Guardrail' }));
    return {
      drawer,
      evaluation: within(drawer.getByRole('region', { name: /Current step/ })),
    };
  }

  it('blocks Guardrail evaluation actions for non-admin roles', async () => {
    roleState.value = 'member';
    const { drawer, evaluation } = await openGuardrailEvaluation();

    expect(evaluation.getAllByText('Admin only')).toHaveLength(2);
    expect(drawer.queryByRole('button', { name: 'Run evaluation' })).toBeNull();
    expect(drawer.queryByRole('button', { name: 'Retry evaluation' })).toBeNull();
    expect(drawer.queryByRole('button', { name: 'Run evaluation again' })).toBeNull();
    expect((drawer.getByRole('button', { name: 'Admin only' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps Guardrail evaluation actions available to admins', async () => {
    const { drawer, evaluation } = await openGuardrailEvaluation();

    expect(evaluation.queryByText('Admin only')).toBeNull();
    expect(drawer.getAllByRole('button', { name: 'Run evaluation' })).toHaveLength(1);

    await userEvent.click(drawer.getByRole('button', { name: 'Details' }));
    const coverage = within(drawer.getByRole('region', { name: 'Test coverage details' }));
    for (const template of coverage.getAllByRole('checkbox')) await userEvent.click(template);
    expect(coverage.getByText('Select at least one Guardrail test pack before running the evaluation.')).not.toBeNull();
    await userEvent.click(drawer.getByRole('button', { name: 'Hide details' }));
    expect(drawer.queryByRole('button', { name: 'Run evaluation' })).toBeNull();
    expect(drawer.getByRole('region', { name: 'Current step: Test coverage' })).not.toBeNull();
  });
});

describe('Catalog list filters', () => {
  it('places the Type filter in the Type column header', async () => {
    const onKindChange = vi.fn();
    render(
      <CatalogList
        rows={[]}
        kind='all'
        onKindChange={onKindChange}
        onOpen={vi.fn()}
      />,
    );

    const typeFilter = screen.getByRole('combobox', { name: 'Type' });
    expect(typeFilter.closest('th')).not.toBeNull();
    await userEvent.selectOptions(typeFilter, 'agent');
    expect(onKindChange).toHaveBeenCalledWith('agent');
  });

  it('shows only Dataset case counts and compact result labels', () => {
    const rows = workspaceRows(cloneEvaluationLayerFixtures());
    const office = rows.find(
      (row) => row.target.id === 'demo-permission-compliance',
    )!;
    const onboarding = rows.find(
      (row) => row.target.id === 'demo-onboarding-assistant',
    )!;
    render(
      <CatalogList
        rows={[office, onboarding]}
        kind='all'
        onKindChange={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    const officeRow = screen.getByText('Office Assistant').closest('tr')!;
    expect(within(officeRow).getByText('6 cases')).not.toBeNull();
    expect(within(officeRow).queryByText('Office Assistant Core Scenarios')).toBeNull();
    expect(within(officeRow).getByText('Findings')).not.toBeNull();
    expect(within(officeRow).queryByText('5 passed · 1 finding')).toBeNull();

    const onboardingRow = screen.getByText('Onboarding Assistant').closest('tr')!;
    expect(within(onboardingRow).getByText('0 cases')).not.toBeNull();
    expect(within(onboardingRow).getAllByText('Not evaluated')).toHaveLength(2);
  });
});
