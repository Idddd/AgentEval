/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { EvaluationLayerProvider } from '../mock-provider';
import { EvaluationDatasetDetail } from './dataset-pages';

vi.mock('@/hooks/use-project', () => ({
  useCurrentProjectId: () => 'individual',
}));

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>(
    '@tanstack/react-router',
  );
  return { ...actual, useNavigate: () => vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Evaluation Dataset detail copy', () => {
  it('leads with Generate and removes the manual publish action', () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationDatasetDetail datasetId='invoice-classification-draft' embedded />
      </EvaluationLayerProvider>,
    );

    const generate = screen.getByRole('button', { name: 'Generate' });
    const addCase = screen.getByRole('button', { name: 'Add case' });
    expect(
      generate.compareDocumentPosition(addCase) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(generate.getAttribute('data-variant')).toBe('default');
    expect(screen.queryByRole('button', { name: 'Publish draft' })).toBeNull();
  });

  it('lets the catalog generate and add cases without opening Details', async () => {
    vi.useFakeTimers();
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationDatasetDetail
          datasetId='invoice-classification-draft'
          compact
          embedded
          showDetailsToggle={false}
        />
      </EvaluationLayerProvider>,
    );

    expect(screen.getByRole('button', { name: 'Generate Dataset' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Show Dataset details' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Generate Dataset' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_800);
    });

    expect(screen.queryByRole('tab', { name: 'Draft cases' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add selected' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add selected' }));
    expect(screen.queryByRole('button', { name: 'Add selected' })).toBeNull();
  });

  it('keeps operational metadata without introductory descriptions', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationDatasetDetail datasetId='invoice-classification-draft' embedded />
      </EvaluationLayerProvider>,
    );

    expect(screen.queryByText('Draft cases for invoice classification.')).toBeNull();
    expect(screen.queryByText(/Editable draft for this Dataset/)).toBeNull();
    expect(screen.getByText('Not published · Draft has 1 cases')).toBeTruthy();

    await userEvent.click(screen.getByRole('tab', { name: 'Evaluation history' }));
    expect(
      screen.queryByText('Runs for every published revision of this Dataset.'),
    ).toBeNull();
    expect(screen.getByText('This Dataset has not been evaluated yet.')).toBeTruthy();
  });

  it('generates populated sample cases for the current Dataset schema', async () => {
    vi.useFakeTimers();
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationDatasetDetail datasetId='invoice-classification-draft' embedded />
      </EvaluationLayerProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_800);
    });

    expect(screen.getAllByLabelText('Include staged case')).toHaveLength(6);
    expect(screen.getByDisplayValue('Northwind Cloud')).toBeTruthy();
    expect(screen.getByDisplayValue('149')).toBeTruthy();
    expect(screen.getByDisplayValue('software')).toBeTruthy();
    expect(screen.getAllByDisplayValue('approve')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Add selected' }));
    expect(screen.getByText('Published R2 · Draft has 7 cases')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Evaluate' })).toBeTruthy();
  });
});
