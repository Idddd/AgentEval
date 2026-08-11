/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EvaluationLayerProvider } from '../mock-provider';
import { EvaluationTraceDetail } from './trace-pages';

vi.mock('@/hooks/use-project', () => ({
  useCurrentProjectId: () => 'individual',
}));

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>(
    '@tanstack/react-router',
  );
  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <a href='/'>{children}</a>,
    useNavigate: () => vi.fn(),
  };
});

afterEach(cleanup);

describe('Trace detail actions', () => {
  it('shows analysis immediately and sends a demo alert', async () => {
    render(
      <EvaluationLayerProvider projectId='individual'>
        <EvaluationTraceDetail traceId='demo-ops-list-allow' />
      </EvaluationLayerProvider>,
    );

    expect(
      screen.getByText('Evidence-backed recommendations from the selected Trace.'),
    ).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Analysis' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mark fail|Unmark fail/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back to trace detail' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Send alert' }));

    expect(screen.getByRole('status').textContent).toBe(
      'Alert sent to security-ops@tasklattice.local.',
    );
  });
});
