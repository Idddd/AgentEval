/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvaluationLayerProvider } from '../mock-provider';
import { cloneEvaluationLayerFixtures } from '../fixture-validation';
import { createEvaluationLayerStore } from '../mock-store';
import { workspaceRows } from './workspace-view-model';
import {
  CatalogList,
  EvaluationCatalogPage,
  LifecycleNode,
  WorkspaceActionBar,
} from './catalog-page';

const roleState = vi.hoisted(() => ({ value: 'admin' }));
const navigateState = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('@/hooks/use-project', () => ({
  useCurrentProjectId: () => 'individual',
}));

vi.mock('@/hooks/use-project-permissions', () => ({
  useEffectiveProjectRole: () => roleState.value,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: () => navigateState.navigate };
});

afterEach(() => {
  roleState.value = 'admin';
  navigateState.navigate.mockReset();
  cleanup();
});

describe('Catalog discovery', () => {
  it('uses the configured Onboarding Assistant icon in every catalog view and drawer', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );

    const expectUserPlusIcon = (element: HTMLElement | null) => {
      expect(element).not.toBeNull();
      expect(element?.querySelector('.lucide-user-plus')).not.toBeNull();
    };

    const lifecycle = screen.getByRole('button', {
      name: 'Onboarding Assistant demo-onboarding-assistant',
    });
    expectUserPlusIcon(lifecycle);

    await userEvent.click(screen.getByRole('button', { name: 'Cards' }));
    expectUserPlusIcon(screen.getByText('Onboarding Assistant').closest('[role="button"]'));

    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expectUserPlusIcon(screen.getByText('Onboarding Assistant').closest('tr'));

    await userEvent.click(screen.getByRole('button', { name: 'Lifecycle' }));
    await userEvent.click(screen.getByRole('button', {
      name: 'Onboarding Assistant demo-onboarding-assistant',
    }));
    expectUserPlusIcon(screen.getByRole('dialog', { name: 'Onboarding Assistant' }));
  });

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

  it('uses Lifecycle as the first and default catalog view', () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );

    const lifecycle = screen.getByRole('button', { name: 'Lifecycle' });
    const controls = lifecycle.parentElement;

    expect(lifecycle.getAttribute('aria-pressed')).toBe('true');
    expect(Array.from(controls?.querySelectorAll('button') ?? []).map((button) => button.textContent)).toEqual([
      'Lifecycle',
      'Cards',
      'List',
    ]);
    expect(screen.getByRole('list', { name: 'Evaluation lifecycles' })).not.toBeNull();
  });

  it('keeps the starter workflow with its default Dataset first for every lifecycle sort', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );

    const firstLifecycle = () => {
      const first = within(screen.getByRole('list', { name: 'Evaluation lifecycles' }))
        .getAllByRole('listitem')[0];
      if (!first) throw new Error('Expected at least one lifecycle row.');
      return first;
    };

    expect(firstLifecycle().textContent).toContain('Onboarding Assistant');
    expect(firstLifecycle().textContent).toContain('Not started');
    expect(firstLifecycle().textContent).toContain('Demo Default Dataset');
    expect(firstLifecycle().textContent).toContain('Published R1');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'name');
    expect(firstLifecycle().textContent).toContain('Onboarding Assistant');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'stage');
    expect(firstLifecycle().textContent).toContain('Onboarding Assistant');
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
    const nextStep = within(drawer.getByRole('region', { name: 'Next workflow step' }));
    const details = nextStep.getByRole('button', { name: 'Details' });
    const approve = nextStep.getByRole('button', { name: 'Approve' });
    expect(details.parentElement).toBe(approve.parentElement);
    expect(details.nextElementSibling).toBe(approve);
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
    expect(panel.queryByText('Configuration')).toBeNull();
    await userEvent.click(panel.getByRole('button', { name: 'Expand Skill & revision' }));

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
    await userEvent.click(panel.getByRole('button', { name: 'Expand Test coverage' }));

    expect(panel.queryByText('Business Dataset')).toBeNull();
    expect(panel.queryByText('Your representative functional and business scenarios.')).toBeNull();
    expect(panel.queryByRole('combobox', { name: 'Dataset' })).toBeNull();
    expect(panel.getByRole('radiogroup', { name: 'Dataset' })).not.toBeNull();
    expect(panel.queryByRole('button', { name: 'Generate Dataset' })).toBeNull();
    expect(panel.getByRole('group', { name: 'Guardrail Test Packs' })).not.toBeNull();
    expect((panel.getByRole('checkbox', { name: 'Select Universal Safety Baseline' }) as HTMLInputElement).checked).toBe(true);
    expect(panel.getByText(/2 selected · \d+ safety cases/)).not.toBeNull();
    expect(panel.getByText(/Combined coverage: \d+ business cases \+ \d+ Guardrail cases/)).not.toBeNull();
    expect(panel.getByText('Draft cases')).not.toBeNull();
    expect(panel.getByText('Evaluation history')).not.toBeNull();
  });

  it('keeps draft Test coverage focused on Dataset and Guardrail configuration', async () => {
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

    const dataset = current.getByRole('radiogroup', { name: 'Dataset' });
    expect(dataset).not.toBeNull();
    expect(current.getByRole('button', { name: 'New Dataset' })).not.toBeNull();
    expect(current.queryByRole('button', { name: 'Generate Dataset' })).toBeNull();
    expect(current.getByRole('group', { name: 'Guardrail Test Packs' })).not.toBeNull();
    expect(current.queryByText(/Combined coverage:/)).toBeNull();
    expect(current.queryByText('Draft cases')).toBeNull();
    expect(current.queryByText('Evaluation history')).toBeNull();
  });

  it('configures a new Dataset with one required Guardrail and optional packs', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Onboarding Assistant demo-onboarding-assistant' }),
    );
    const drawer = within(screen.getByRole('dialog', { name: 'Onboarding Assistant' }));
    const coverage = within(drawer.getByRole('region', { name: 'Current step: Test coverage' }));
    expect(coverage.queryByRole('combobox', { name: 'Dataset' })).toBeNull();
    const dataset = coverage.getByRole('radio', { name: /Demo Default Dataset/ }) as HTMLInputElement;

    expect(dataset.checked).toBe(true);
    expect(coverage.queryByRole('radio', { name: /Published Demo Dataset/ })).toBeNull();
    expect(coverage.getByRole('button', { name: 'New Dataset' })).not.toBeNull();
    expect(coverage.queryByRole('button', { name: 'Create Dataset' })).toBeNull();
    const defaultCard = within(dataset.closest('label')!);
    expect(defaultCard.getByText('Published')).not.toBeNull();
    expect(defaultCard.getByText('6 cases')).not.toBeNull();
    const packs = within(coverage.getByRole('group', { name: 'Guardrail Test Packs' }));
    const required = packs.getByRole('checkbox', { name: 'Select Universal Safety Baseline' }) as HTMLInputElement;
    const optional = packs.getByRole('checkbox', { name: 'Select Agent Prompt Injection' }) as HTMLInputElement;

    expect(required.checked).toBe(true);
    expect(required.disabled).toBe(true);
    expect(optional.checked).toBe(true);
    expect(optional.disabled).toBe(false);
    expect(packs.getByText('Required')).not.toBeNull();
    expect(packs.getByText('Optional')).not.toBeNull();

    await userEvent.click(optional);
    expect(optional.checked).toBe(false);
    expect(packs.getByText(/1 selected · \d+ safety cases/)).not.toBeNull();

    await userEvent.click(coverage.getByRole('button', { name: 'New Dataset' }));
    expect(screen.getByRole('dialog', { name: 'Create dataset' })).not.toBeNull();
  });

  it('opens the selected Dataset detail from the card action', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Onboarding Assistant demo-onboarding-assistant' }),
    );
    const drawer = within(screen.getByRole('dialog', { name: 'Onboarding Assistant' }));
    const coverage = within(drawer.getByRole('region', { name: 'Current step: Test coverage' }));

    await userEvent.click(coverage.getByRole('button', { name: 'New Dataset' }));
    const createDialog = within(screen.getByRole('dialog', { name: 'Create dataset' }));
    await userEvent.type(createDialog.getByRole('textbox', { name: 'Name *' }), 'Alternate Dataset');
    await userEvent.click(createDialog.getByRole('button', { name: 'Create dataset' }));
    expect(
      (coverage.getByRole('radio', { name: /Alternate Dataset/ }) as HTMLInputElement).checked,
    ).toBe(true);

    await userEvent.click(
      coverage.getByRole('button', { name: 'Open Demo Default Dataset details' }),
    );

    const details = within(drawer.getByRole('region', { name: 'Test coverage details' }));
    expect(details.getByRole('button', { name: 'Collapse Test coverage' })).not.toBeNull();
    expect(details.getByRole('heading', { name: 'Demo Default Dataset' })).not.toBeNull();
    expect(details.getByText('Draft cases')).not.toBeNull();
    expect(details.getByText('Evaluation history')).not.toBeNull();
    expect(
      (details.getByRole('radio', { name: /Demo Default Dataset/ }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('keeps every Dataset card and Guardrail pack visible after switching selection', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Onboarding Assistant demo-onboarding-assistant' }),
    );
    const drawer = within(screen.getByRole('dialog', { name: 'Onboarding Assistant' }));
    const coverage = within(drawer.getByRole('region', { name: 'Current step: Test coverage' }));

    await userEvent.click(coverage.getByRole('button', { name: 'New Dataset' }));
    const createDialog = within(screen.getByRole('dialog', { name: 'Create dataset' }));
    await userEvent.type(createDialog.getByRole('textbox', { name: 'Name *' }), 'Persistent Dataset');
    await userEvent.click(createDialog.getByRole('button', { name: 'Create dataset' }));

    await userEvent.click(coverage.getByRole('radio', { name: /Demo Default Dataset/ }));
    expect(coverage.getByRole('radio', { name: /Demo Default Dataset/ })).not.toBeNull();
    expect(coverage.getByRole('radio', { name: /Persistent Dataset/ })).not.toBeNull();
    expect(coverage.getByRole('group', { name: 'Guardrail Test Packs' })).not.toBeNull();
  });

  it('moves the current action above long stage content when details are open', async () => {
    const drawer = await openCompletedSkill();
    await userEvent.click(drawer.getByRole('button', { name: 'Details' }));

    const details = within(drawer.getByRole('region', { name: 'Result details' }));
    const approve = within(drawer.getByRole('region', { name: 'Next workflow step' }))
      .getByRole('button', { name: 'Approve' });
    const reportPreview = details.getByRole('group', { name: 'Report preview' });
    expect(approve.compareDocumentPosition(reportPreview) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('shows one natural-language Summary until Result details are opened', async () => {
    const drawer = await openCompletedSkill();
    const panel = within(drawer.getByRole('region', { name: 'Current step: Result' }));

    expect(panel.getByRole('status', { name: 'Evaluation outcome: SUCCESS' })).not.toBeNull();
    expect(panel.getByText('Summary')).not.toBeNull();
    expect(panel.getByText('All Document Summarization checks passed.')).not.toBeNull();
    expect(panel.queryByText('Reason')).toBeNull();
    expect(panel.queryByText('Test Results')).toBeNull();
    expect(drawer.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);

    await userEvent.click(panel.getByRole('button', { name: 'View report' }));
    expect(navigateState.navigate).not.toHaveBeenCalled();
    const report = within(drawer.getByRole('region', { name: 'Report details' }));
    expect(report.getByText('Test Results')).not.toBeNull();
    expect(report.getByText('Tool Evidence')).not.toBeNull();
    const navigation = within(drawer.getByRole('region', { name: 'Report navigation' }));
    expect(navigation.getByRole('button', { name: 'Approve evaluation' })).not.toBeNull();
    expect(report.queryByRole('button', { name: 'Approve evaluation' })).toBeNull();
    expect(drawer.queryByRole('region', { name: 'Current step: Result' })).toBeNull();
    await userEvent.click(drawer.getByRole('button', { name: 'Back to Result' }));
    expect(drawer.getByRole('region', { name: 'Current step: Result' })).not.toBeNull();

    await userEvent.click(drawer.getByRole('button', { name: 'Details' }));

    const details = within(drawer.getByRole('region', { name: 'Result details' }));
    expect(details.getByRole('button', { name: 'Collapse Result' })).not.toBeNull();
    expect(details.getByRole('group', { name: 'Report preview' })).not.toBeNull();
    expect(details.getByText('Test results')).not.toBeNull();
    expect(details.getByText('Evidence')).not.toBeNull();
    expect(details.getByText('Usage & cost')).not.toBeNull();
    expect(details.queryByText('Failure reasons')).toBeNull();
    expect(within(drawer.getByRole('region', { name: 'Next workflow step' })).getByRole('button', { name: 'Approve' })).not.toBeNull();

    navigateState.navigate.mockClear();
    await userEvent.click(details.getByRole('button', { name: 'View report: Test results' }));
    expect(navigateState.navigate).not.toHaveBeenCalled();
    expect(within(drawer.getByRole('region', { name: 'Report details' })).getByText('Test Results')).not.toBeNull();
    expect(drawer.getByRole('button', { name: 'Back to Result' })).not.toBeNull();
  });

  it('creates a Dataset directly from expanded Test coverage details', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Onboarding Assistant demo-onboarding-assistant/ }),
    );
    const drawer = within(screen.getByRole('dialog', { name: 'Onboarding Assistant' }));

    await userEvent.click(drawer.getByRole('button', { name: 'Details' }));
    const coverage = within(drawer.getByRole('region', { name: 'Test coverage details' }));
    expect(coverage.getByRole('button', { name: 'Collapse Test coverage' })).not.toBeNull();

    await userEvent.click(coverage.getByRole('button', { name: 'New Dataset' }));
    const createDialog = within(screen.getByRole('dialog', { name: 'Create dataset' }));
    await userEvent.type(createDialog.getByRole('textbox', { name: 'Name *' }), 'One-stop Eval Dataset');
    await userEvent.click(createDialog.getByRole('button', { name: 'Create dataset' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Create dataset' })).toBeNull();
      expect(drawer.getByRole('region', { name: 'Test coverage details' })).not.toBeNull();
      const updatedCoverage = within(drawer.getByRole('region', { name: 'Test coverage details' }));
      expect(updatedCoverage.getByRole('button', { name: 'Collapse Test coverage' })).not.toBeNull();
      expect((updatedCoverage.getByRole('radio', { name: /One-stop Eval Dataset/ }) as HTMLInputElement).checked).toBe(true);
    });
  });

  it('starts Evaluation directly from ready Test coverage with Details closed', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Onboarding Assistant demo-onboarding-assistant/ }),
    );
    const drawer = within(screen.getByRole('dialog', { name: 'Onboarding Assistant' }));
    const nextStep = within(drawer.getByRole('region', { name: 'Next workflow step' }));
    const currentStage = within(drawer.getByRole('region', { name: 'Current step: Test coverage' }));

    expect(nextStep.getByText('Confirm Test coverage')).not.toBeNull();
    expect(nextStep.getByRole('button', { name: 'Run evaluation' })).not.toBeNull();
    expect(nextStep.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(currentStage.queryByText('Current step')).toBeNull();
    expect(drawer.queryByRole('region', { name: 'Test coverage details' })).toBeNull();

    await userEvent.click(nextStep.getByRole('button', { name: 'Run evaluation' }));

    await waitFor(() => {
      expect(nextStep.getByLabelText(/Evaluation \d+% complete/)).not.toBeNull();
      expect(drawer.getByRole('region', { name: 'Current step: Result' })).not.toBeNull();
    });
    expect(drawer.queryByRole('region', { name: 'Test coverage details' })).toBeNull();
    expect(drawer.queryByRole('button', { name: 'Hide details' })).toBeNull();
    expect(drawer.queryByRole('region', { name: 'Current step: Evaluation' })).toBeNull();
    expect(nextStep.queryByText('Start evaluation')).toBeNull();
  });

  it('starts Evaluation directly from ready Test coverage with Details open', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Onboarding Assistant demo-onboarding-assistant/ }),
    );
    const drawer = within(screen.getByRole('dialog', { name: 'Onboarding Assistant' }));
    const nextStep = within(drawer.getByRole('region', { name: 'Next workflow step' }));
    await userEvent.click(nextStep.getByRole('button', { name: 'Details' }));
    expect(
      within(drawer.getByRole('region', { name: 'Test coverage details' }))
        .getByRole('button', { name: 'Collapse Test coverage' }),
    ).not.toBeNull();
    expect(nextStep.getByRole('button', { name: 'Run evaluation' })).not.toBeNull();
    expect(nextStep.queryByRole('button', { name: 'Next' })).toBeNull();

    await userEvent.click(nextStep.getByRole('button', { name: 'Run evaluation' }));

    await waitFor(() => {
      expect(nextStep.getByRole('button', { name: 'Hide details' })).not.toBeNull();
      expect(nextStep.getByLabelText(/Evaluation \d+% complete/)).not.toBeNull();
      expect(
        within(drawer.getByRole('region', { name: 'Result details' }))
          .getByRole('button', { name: 'Collapse Result' }),
      ).not.toBeNull();
    });
    expect(drawer.queryByRole('region', { name: /Current step:/ })).toBeNull();
    expect(
      within(drawer.getByRole('region', { name: 'Evaluation details' }))
        .getByRole('button', { name: 'Expand Evaluation' }),
    ).not.toBeNull();
    expect(nextStep.queryByText('Start evaluation')).toBeNull();
  });

  it('requires Dataset selection before Run evaluation becomes available', async () => {
    const initialState = cloneEvaluationLayerFixtures();
    const targetId = 'demo-onboarding-assistant';
    const removedDatasetIds = new Set(
      initialState.datasets
        .filter((dataset) => dataset.targetId === targetId)
        .map((dataset) => dataset.id),
    );
    initialState.datasets = initialState.datasets.filter((dataset) => dataset.targetId !== targetId);
    initialState.datasetRevisions = initialState.datasetRevisions.filter(
      (revision) => !removedDatasetIds.has(revision.datasetId),
    );
    initialState.settings.activeTargetId = targetId;
    const store = createEvaluationLayerStore(initialState);

    render(
      <EvaluationLayerProvider projectId='individual' store={store}>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Onboarding Assistant demo-onboarding-assistant/ }),
    );
    const drawer = within(screen.getByRole('dialog', { name: 'Onboarding Assistant' }));
    const nextStep = within(drawer.getByRole('region', { name: 'Next workflow step' }));
    const coverage = within(drawer.getByRole('region', { name: 'Current step: Test coverage' }));

    expect(nextStep.getByText('Select Dataset')).not.toBeNull();
    expect(coverage.getByText(/Select a Dataset below/)).not.toBeNull();
    const next = nextStep.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(coverage.getByRole('radiogroup', { name: 'Dataset' })).not.toBeNull();
    expect(coverage.queryAllByRole('radio')).toHaveLength(0);
    expect(coverage.queryByRole('button', { name: 'Generate Dataset' })).toBeNull();
    await userEvent.click(coverage.getByRole('button', { name: 'New Dataset' }));
    const createDialog = within(screen.getByRole('dialog', { name: 'Create dataset' }));
    await userEvent.type(createDialog.getByRole('textbox', { name: 'Name *' }), 'Onboarding Assistant Dataset');
    await userEvent.click(createDialog.getByRole('button', { name: 'Create dataset' }));

    await waitFor(() => {
      expect(drawer.getByRole('region', { name: 'Current step: Test coverage' })).not.toBeNull();
      expect((nextStep.getByRole('button', { name: 'Run evaluation' }) as HTMLButtonElement).disabled).toBe(false);
    });
    const createdDataset = store.getState().datasets.find(
      (dataset) => dataset.targetId === targetId,
    );
    expect(createdDataset?.name).toBe('Onboarding Assistant Dataset');
    expect(store.getState().datasetRevisions.find(
      (revision) => revision.datasetId === createdDataset?.id && revision.status === 'DRAFT',
    )?.cases).toHaveLength(0);
    expect(store.getState().datasetRevisions.some(
      (revision) => revision.datasetId === createdDataset?.id && revision.status === 'PUBLISHED',
    )).toBe(false);
    expect(drawer.queryByRole('region', { name: /details$/i })).toBeNull();

  });

  it('runs an evaluation directly from expanded Evaluation details', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationCatalogPage />
      </EvaluationLayerProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Sample Security Assistant demo-sample-security-assistant/ }),
    );
    const drawer = within(screen.getByRole('dialog', { name: 'Sample Security Assistant' }));

    await userEvent.click(drawer.getByRole('button', { name: 'Details' }));
    const evaluation = within(drawer.getByRole('region', { name: 'Evaluation details' }));
    expect(evaluation.getByRole('button', { name: 'Collapse Evaluation' })).not.toBeNull();
    const plan = within(evaluation.getByRole('group', { name: 'Evaluation plan' }));
    expect(plan.getByText('Run scope')).not.toBeNull();
    expect(plan.getByText('Readiness')).not.toBeNull();
    expect(plan.getByText('Execution settings')).not.toBeNull();
    expect(plan.getByText('Sample Security Assistant')).not.toBeNull();
    expect(plan.getByText('Sample Security Scenarios')).not.toBeNull();
    expect(plan.getByText('Test Cases').parentElement?.textContent).toBe('Test Cases2');
    expect(plan.getByText('Guardrails').parentElement?.textContent).toBe('Guardrails2');
    expect(plan.queryByText('Business cases')).toBeNull();
    expect(plan.queryByText('Total cases')).toBeNull();
    expect(plan.getAllByText(/Sample Security Scenarios · R1/).length).toBeGreaterThan(0);
    expect(plan.getAllByText('Recorded demo judge').length).toBeGreaterThan(0);
    expect(evaluation.queryByText('Execution log')).toBeNull();
    await userEvent.click(within(drawer.getByRole('region', { name: 'Next workflow step' })).getByRole('button', { name: 'Run evaluation' }));

    await waitFor(() => {
      const report = within(drawer.getByRole('region', { name: 'Result details' }));
      expect(report.getByRole('button', { name: 'Collapse Result' })).not.toBeNull();
      expect(report.getByText('Execution log')).not.toBeNull();
      expect(
        within(drawer.getByRole('region', { name: 'Next workflow step' }))
          .getByLabelText(/Evaluation \d+% complete/),
      ).not.toBeNull();
    });
    expect(evaluation.queryByLabelText(/Evaluation \d+% complete/)).toBeNull();
    expect(evaluation.queryByText('Execution log')).toBeNull();
  });

  it('approves a passing evaluation directly from expanded Result details', async () => {
    const drawer = await openCompletedSkill();
    await userEvent.click(drawer.getByRole('button', { name: 'Details' }));
    const result = within(drawer.getByRole('region', { name: 'Result details' }));
    expect(result.getByRole('button', { name: 'Collapse Result' })).not.toBeNull();

    await userEvent.click(within(drawer.getByRole('region', { name: 'Next workflow step' })).getByRole('button', { name: 'Approve' }));

    expect(result.getAllByText('Approved').length).toBeGreaterThan(0);
    expect(result.getByText(/Approved by Local Administrator/)).not.toBeNull();
    expect(drawer.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('expands the current stage and keeps the other detail steps collapsed', async () => {
    const drawer = await openCompletedSkill();

    for (const name of ['Target details', 'Test coverage details', 'Evaluation details', 'Result details']) {
      expect(drawer.queryByRole('region', { name })).toBeNull();
    }
    await userEvent.click(drawer.getByRole('button', { name: 'Details' }));

    for (const name of ['Target details', 'Test coverage details', 'Evaluation details', 'Result details']) {
      expect(drawer.getByRole('region', { name })).not.toBeNull();
    }
    for (const name of ['Skill & revision', 'Test coverage', 'Evaluation']) {
      expect(drawer.getByRole('button', { name: `Expand ${name}` })).not.toBeNull();
    }
    expect(drawer.getByRole('button', { name: 'Collapse Result' })).not.toBeNull();
    expect(drawer.queryByText('Configuration')).toBeNull();
    expect(drawer.queryByText('Test Results')).toBeNull();

    await userEvent.click(drawer.getByRole('button', { name: 'Expand Skill & revision' }));
    expect(drawer.getByText('Configuration')).not.toBeNull();
    expect(drawer.getByRole('button', { name: 'Collapse Skill & revision' })).not.toBeNull();
    expect(drawer.queryByText('Test Results')).toBeNull();
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

    expect(result.getByRole('status', { name: 'Evaluation outcome: FAIL' })).not.toBeNull();
    expect(result.getByText('The assistant exposed restricted employee data after access had been denied.')).not.toBeNull();
    expect(result.queryByText('Reason')).toBeNull();
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

    expect(drawer.getByText('The evaluation could not finish because the Tool connection failed before a permission decision could be recorded.')).not.toBeNull();
    expect(drawer.queryByText('Reason')).toBeNull();
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

    expect(within(drawer.getByRole('region', { name: 'Next workflow step' })).getByText('Admin only')).not.toBeNull();
    expect(drawer.queryByRole('button', { name: 'Run evaluation' })).toBeNull();
    expect(drawer.queryByRole('button', { name: 'Retry evaluation' })).toBeNull();
    expect(drawer.queryByRole('button', { name: 'Run evaluation again' })).toBeNull();
    expect((drawer.getByRole('button', { name: 'Admin only' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps Guardrail evaluation actions available to admins', async () => {
    const { drawer, evaluation } = await openGuardrailEvaluation();

    expect(within(drawer.getByRole('region', { name: 'Next workflow step' })).queryByText('Admin only')).toBeNull();
    expect(drawer.getAllByRole('button', { name: 'Next' })).toHaveLength(1);

    await userEvent.click(drawer.getByRole('button', { name: 'Details' }));
    expect(drawer.getAllByRole('button', { name: 'Run evaluation' })).toHaveLength(1);
    const coverage = within(drawer.getByRole('region', { name: 'Test coverage details' }));
    await userEvent.click(coverage.getByRole('button', { name: 'Expand Test coverage' }));
    const required = coverage.getByRole('checkbox', { name: 'Select Universal Safety Baseline' }) as HTMLInputElement;
    const optional = coverage.getByRole('checkbox', { name: 'Select Guardrail Bypass Resilience' }) as HTMLInputElement;
    expect(required.disabled).toBe(true);
    await userEvent.click(optional);
    expect(coverage.getByText(/1 selected · \d+ safety cases/)).not.toBeNull();
    expect(coverage.queryByText('Select at least one Guardrail test pack before running the evaluation.')).toBeNull();
    await userEvent.click(drawer.getByRole('button', { name: 'Hide details' }));
    expect(drawer.getAllByRole('button', { name: 'Next' })).toHaveLength(1);
    expect(drawer.getByRole('region', { name: 'Current step: Evaluation' })).not.toBeNull();
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
    expect(within(onboardingRow).getByText('6 cases')).not.toBeNull();
    expect(within(onboardingRow).getAllByText('Not evaluated')).toHaveLength(2);
  });
});
