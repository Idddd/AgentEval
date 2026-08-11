/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvaluationLayerRevisionDecision } from '../model';
import { RevisionDecisionSection } from './revision-decision';

afterEach(cleanup);

describe('Evaluation revision decision', () => {
  it('offers only Approve for an Admin when every Test Case passed', async () => {
    const onDecision = vi.fn();
    render(
      <RevisionDecisionSection
        decision={undefined}
        recommendation='APPROVED'
        revisionLabel='Document Summarization R1'
        canDecide
        onDecision={onDecision}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Reject evaluation' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Approve evaluation' }));
    expect(onDecision).toHaveBeenCalledWith('APPROVED');
  });

  it('offers only Reject when the evaluation failed or contains findings', async () => {
    const onDecision = vi.fn();
    render(
      <RevisionDecisionSection
        decision={undefined}
        recommendation='REJECTED'
        revisionLabel='Office Assistant R2'
        canDecide
        onDecision={onDecision}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Approve evaluation' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reject evaluation' }));
    expect(onDecision).toHaveBeenCalledWith('REJECTED');
  });

  it('keeps a pending decision read-only for non-admin roles', () => {
    render(
      <RevisionDecisionSection
        decision={undefined}
        recommendation='APPROVED'
        revisionLabel='Document Summarization R1'
        canDecide={false}
        onDecision={vi.fn()}
      />,
    );

    expect(screen.getByText('Admin access is required to approve this evaluation.')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not offer a decision for an outdated report', () => {
    render(
      <RevisionDecisionSection
        decision={undefined}
        recommendation='APPROVED'
        revisionLabel='Operations MCP R1'
        canDecide
        blockedReason='This report belongs to an outdated Dataset revision and cannot be decided.'
        onDecision={vi.fn()}
      />,
    );

    expect(screen.getByText('Unavailable')).not.toBeNull();
    expect(screen.getByText(/outdated Dataset revision/)).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a final Rejected decision without another action', () => {
    const decision: EvaluationLayerRevisionDecision = {
      id: 'decision-1',
      reportId: 'report-1',
      targetRevisionId: 'revision-1',
      status: 'REJECTED',
      actor: 'Local Administrator',
      decidedAt: '2026-08-11T01:00:00.000Z',
      reason: 'Developer changes required.',
    };
    render(
      <RevisionDecisionSection
        decision={decision}
        recommendation='REJECTED'
        revisionLabel='Office Assistant R2'
        canDecide
        onDecision={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0);
    expect(screen.getByText('Developer changes required.')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
