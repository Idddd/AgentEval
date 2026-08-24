/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EvaluationLayerProvider,
  useEvaluationLayerState,
  useEvaluationLayerStore,
} from './mock-provider';

function AutoAdvanceHarness() {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  const run = state.runs.find(
    (item) => item.id === state.settings.selectedRunId,
  );
  const pending = run?.results.filter((result) => result.status === 'PENDING').length;

  return (
    <>
      <button
        type='button'
        onClick={() => store.createRun({
          targetRevisionId: 'demo-sample-security-assistant-r1',
          datasetRevisionId: 'sample-security-scenarios-r1',
          guardrailTemplateIds: [
            'guardrail-template-universal-safety',
            'guardrail-template-agent-prompt-injection',
          ],
          evaluatorIds: ['permission-compliance'],
        })}
      >
        Start evaluation
      </button>
      <output>{run ? `${run.status}:${pending}` : 'idle'}</output>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('EvaluationLayerProvider auto run', () => {
  it('completes a new Run without mounting Evaluation details', async () => {
    vi.useFakeTimers();
    render(
      <EvaluationLayerProvider projectId='individual'>
        <AutoAdvanceHarness />
      </EvaluationLayerProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }));
    expect(screen.getByText('RUNNING:4')).not.toBeNull();

    for (let completed = 0; completed < 4; completed += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(900);
      });
    }

    expect(screen.getByText('COMPLETED:0')).not.toBeNull();
  });
});
