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
  NextStepCallout,
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
  it('opens the matching workflow tab from a recommended lifecycle node', async () => {
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

  it('navigates to the destination exposed by the next-step action', async () => {
    const onNavigate = vi.fn();
    render(
      <NextStepCallout
        step={{
          tab: 'dataset',
          label: 'Prepare and publish Test Cases',
          description: 'A published Dataset is required before you can run this evaluation.',
        }}
        onNavigate={onNavigate}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Prepare and publish Test Cases' }),
    );
    expect(onNavigate).toHaveBeenCalledWith('dataset');
  });
});

describe('Catalog drawer progressive disclosure', () => {
  async function openCompletedSkill(tabName: 'Skill' | 'Dataset' | 'Result') {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Document Summarization demo-document-summarization/ }),
    );
    await userEvent.click(screen.getByRole('tab', { name: tabName }));
    return within(screen.getByRole('tabpanel', { name: tabName }));
  }

  it('shows only the latest report until Skill details are opened', async () => {
    const panel = await openCompletedSkill('Skill');

    expect(panel.getByText('Latest report')).not.toBeNull();
    expect(panel.queryByText('Configuration')).toBeNull();
    expect(panel.getByText('Next step')).not.toBeNull();
    await userEvent.click(panel.getByRole('button', { name: 'Details' }));

    expect(panel.getByText('Configuration')).not.toBeNull();
    expect(panel.getByText('Report history')).not.toBeNull();
  });

  it('keeps Dataset editing behind Details and leads with generation', async () => {
    const panel = await openCompletedSkill('Dataset');

    expect(panel.getByRole('combobox', { name: 'Dataset' })).not.toBeNull();
    expect(panel.getByRole('button', { name: 'Generate Dataset' })).not.toBeNull();
    expect(panel.queryByText('Draft cases')).toBeNull();
    expect(panel.getByText('Next step')).not.toBeNull();
    await userEvent.click(panel.getByRole('button', { name: 'Details' }));

    expect(panel.getByText('Draft cases')).not.toBeNull();
    expect(panel.getByText('Evaluation history')).not.toBeNull();
  });

  it('shows only Summary and Reason until Result details are opened', async () => {
    const panel = await openCompletedSkill('Result');

    expect(panel.getByText('Summary')).not.toBeNull();
    expect(panel.getByText('Reason')).not.toBeNull();
    expect(panel.queryByText('Test Results')).toBeNull();
    expect(panel.getByText('Next step')).not.toBeNull();
    await userEvent.click(panel.getByRole('button', { name: 'Details' }));

    expect(panel.getByText('Test Results')).not.toBeNull();
    expect(panel.getByText('Failure reasons')).not.toBeNull();
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
    await userEvent.click(screen.getByRole('tab', { name: 'Evaluation' }));
    return within(screen.getByRole('tabpanel', { name: 'Evaluation' }));
  }

  it('blocks Guardrail evaluation actions for non-admin roles', async () => {
    roleState.value = 'member';
    const panel = await openGuardrailEvaluation();

    expect(panel.getByText('Admin only')).not.toBeNull();
    expect(panel.queryByRole('button', { name: 'Start evaluation' })).toBeNull();
    expect(panel.queryByRole('button', { name: 'Run again' })).toBeNull();
  });

  it('keeps Guardrail evaluation actions available to admins', async () => {
    const panel = await openGuardrailEvaluation();

    expect(panel.queryByText('Admin only')).toBeNull();
    expect(panel.getAllByRole('button', { name: 'Start evaluation' }).length).toBeGreaterThan(0);
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
