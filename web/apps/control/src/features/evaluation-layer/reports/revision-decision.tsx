import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EvaluationLayerRevisionDecision } from '../model';
import { EvaluationLayerStatusBadge } from '../shared/evaluation-status';
import { EvaluationSection, KeyValueGrid } from '../shared/evaluation-ui';

export type RevisionDecisionMode = 'inline' | 'status-only' | 'hidden';

export function RevisionDecisionSection({
  decision,
  recommendation,
  revisionLabel,
  canDecide,
  blockedReason,
  mode = 'inline',
  onDecision,
}: {
  decision: EvaluationLayerRevisionDecision | undefined;
  recommendation: 'APPROVED' | 'REJECTED';
  revisionLabel: string;
  canDecide: boolean;
  blockedReason?: string | undefined;
  mode?: RevisionDecisionMode;
  onDecision(status: 'APPROVED' | 'REJECTED'): void;
}) {
  if (mode === 'hidden') return null;

  const approve = recommendation === 'APPROVED';
  return (
    <EvaluationSection
      title='Evaluation decision'
      description={`This decision applies only to ${revisionLabel}.`}
      action={
        decision ? (
          <span className='inline-flex items-center gap-2 text-sm font-medium'>
            {decision.status === 'APPROVED' ? (
              <CheckCircle2 className='size-4 text-emerald-500' />
            ) : (
              <XCircle className='size-4 text-destructive' />
            )}
            <EvaluationLayerStatusBadge status={decision.status} />
          </span>
        ) : blockedReason ? (
          <span className='text-sm font-medium text-muted-foreground'>Unavailable</span>
        ) : (
          <span className='inline-flex items-center gap-2 text-sm font-medium text-amber-600'>
            <ShieldCheck className='size-4' />Pending
          </span>
        )
      }
    >
      {decision ? (
        <KeyValueGrid
          items={[
            ['Decision', decision.status === 'APPROVED' ? 'Approved' : 'Rejected'],
            ['Revision', revisionLabel],
            ['Actor', decision.actor],
            ['Time', new Date(decision.decidedAt).toLocaleString()],
            ['Reason', decision.reason ?? 'All Test Cases passed.'],
          ]}
        />
      ) : blockedReason ? (
        <p className='text-sm text-muted-foreground'>{blockedReason}</p>
      ) : mode === 'status-only' ? (
        <p className='text-sm text-muted-foreground'>
          {approve
            ? 'All Test Cases passed and this revision is awaiting Admin approval.'
            : 'The evaluation failed or contains findings and is awaiting Admin rejection.'}
        </p>
      ) : canDecide ? (
        <div className='flex flex-wrap items-center justify-between gap-4'>
          <p className='max-w-2xl text-sm text-muted-foreground'>
            {approve
              ? 'All Test Cases passed. Approve this evaluated revision.'
              : 'The evaluation failed or contains findings. Reject it so a Developer can update the Target.'}
          </p>
          <Button
            variant={approve ? 'default' : 'destructive'}
            onClick={() => onDecision(recommendation)}
          >
            {approve ? <CheckCircle2 /> : <XCircle />}
            {approve ? 'Approve evaluation' : 'Reject evaluation'}
          </Button>
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>
          Admin access is required to {approve ? 'approve' : 'reject'} this evaluation.
        </p>
      )}
    </EvaluationSection>
  );
}
