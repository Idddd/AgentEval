/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneEvaluationLayerFixtures } from '../fixture-validation';
import { EvaluationTargetDetail } from './target-pages';

const roleState = vi.hoisted(() => ({ value: 'admin' }));
const stateHolder = vi.hoisted(() => ({ value: null as any }));
const storeMock = vi.hoisted(() => ({
  createTargetRevision: vi.fn(() => ({ ok: true, value: { revisionId: 'new-revision' } })),
  selectActiveTarget: vi.fn(() => ({ ok: true, value: undefined })),
}));

vi.mock('../mock-provider', () => ({
  useEvaluationLayerState: () => stateHolder.value,
  useEvaluationLayerStore: () => storeMock,
}));

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

beforeEach(() => {
  roleState.value = 'admin';
  stateHolder.value = cloneEvaluationLayerFixtures();
  storeMock.createTargetRevision.mockClear();
  storeMock.selectActiveTarget.mockClear();
});

afterEach(cleanup);

function targetView(targetId = 'demo-permission-compliance') {
  return <EvaluationTargetDetail targetId={targetId} embedded showEvaluateAction={false} />;
}

describe('Target revision Developer access', () => {
  it('allows only a Developer to create a revision after rejection and passes the actor', async () => {
    stateHolder.value.revisionDecisions.push({
      id: 'decision-rejected',
      reportId: 'report-permission-baseline',
      targetRevisionId: 'demo-permission-compliance-r2',
      status: 'REJECTED',
      actor: 'Local Administrator',
      decidedAt: '2026-08-11T01:00:00.000Z',
      reason: 'Developer changes required.',
    });
    const view = render(targetView());

    expect((screen.getByRole('button', { name: 'Developer only' }) as HTMLButtonElement).disabled).toBe(true);

    roleState.value = 'ada';
    view.rerender(targetView());
    expect((screen.getByRole('button', { name: 'Developer only' }) as HTMLButtonElement).disabled).toBe(true);

    roleState.value = 'member';
    view.rerender(targetView());
    const newRevision = screen.getByRole('button', { name: 'New revision' });
    expect((newRevision as HTMLButtonElement).disabled).toBe(false);

    await userEvent.click(newRevision);
    await userEvent.click(screen.getByRole('button', { name: 'Create target revision' }));
    expect(storeMock.createTargetRevision).toHaveBeenCalledWith(
      'demo-permission-compliance',
      expect.any(Object),
      { name: 'Developer', role: 'member' },
    );
  });

  it('does not let a stale Dataset report keep New revision decision-pending', () => {
    roleState.value = 'member';
    const current = stateHolder.value.datasetRevisions.find(
      (item: { id: string }) => item.id === 'skill-summary-check-r1',
    );
    stateHolder.value.datasetRevisions.push({
      ...current,
      id: 'skill-summary-check-r2',
      revision: 2,
      createdAt: '2026-08-11T02:00:00.000Z',
    });
    stateHolder.value.datasets.find(
      (item: { id: string }) => item.id === 'skill-summary-check',
    ).currentRevisionId = 'skill-summary-check-r2';

    render(targetView('demo-document-summarization'));

    expect((screen.getByRole('button', { name: 'New revision' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Decision pending' })).toBeNull();
  });
});
