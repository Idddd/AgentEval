import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  EvaluationLayerCase,
  EvaluationLayerGuardrailApproval,
  EvaluationLayerRunResult,
  EvaluationLayerTrace,
} from '../model';
import { EvaluationLayerStatusBadge } from '../shared/evaluation-status';
import {
  EvaluationMetric,
  EvaluationSection,
  EvaluationTable,
  KeyValueGrid,
} from '../shared/evaluation-ui';

export function guardrailReportMetrics(
  cases: EvaluationLayerCase[],
  results: EvaluationLayerRunResult[],
) {
  const resultByCase = new Map(results.map((result) => [result.caseId, result]));
  const risky = cases.filter(
    (item) => String(item.expectedOutput.guardrail_decision).toUpperCase() !== 'ALLOW',
  );
  const benign = cases.filter(
    (item) => String(item.expectedOutput.guardrail_decision).toUpperCase() === 'ALLOW',
  );
  return {
    riskyProtected: risky.filter((item) => resultByCase.get(item.id)?.status === 'PASS').length,
    riskyTotal: risky.length,
    benignAllowed: benign.filter((item) => resultByCase.get(item.id)?.status === 'PASS').length,
    benignTotal: benign.length,
    passed: cases.filter((item) => resultByCase.get(item.id)?.status === 'PASS').length,
    total: cases.length,
  };
}

function caseLabel(id: string) {
  const labels: Record<string, string> = {
    'guardrail-benign-allow': 'Normal request',
    'guardrail-jailbreak-block': 'Jailbreak attempt',
    'guardrail-pii-redact': 'PII in output',
    'guardrail-tool-exfiltration-block': 'Tool data exfiltration',
  };
  return labels[id] ?? id;
}

export function GuardrailReport({
  cases,
  results,
  traces,
  revisionLabel,
  approval,
  onDecision,
}: {
  cases: EvaluationLayerCase[];
  results: EvaluationLayerRunResult[];
  traces: EvaluationLayerTrace[];
  revisionLabel: string;
  approval: EvaluationLayerGuardrailApproval | undefined;
  onDecision: (status: 'APPROVED' | 'REJECTED') => void;
}) {
  const metrics = guardrailReportMetrics(cases, results);
  const traceByCase = new Map(traces.map((trace) => [trace.caseId, trace]));

  return (
    <div className='space-y-6'>
      <EvaluationSection
        title='Guardrail result'
        description='The current revision is checked against safe and unsafe traffic before approval.'
      >
        <div className='grid gap-4 md:grid-cols-3'>
          <EvaluationMetric
            label='Risky requests protected'
            value={`${metrics.riskyProtected} / ${metrics.riskyTotal}`}
            detail='Blocked or redacted as expected'
          />
          <EvaluationMetric
            label='Benign requests allowed'
            value={`${metrics.benignAllowed} / ${metrics.benignTotal}`}
            detail='Normal traffic was not interrupted'
          />
          <EvaluationMetric
            label='Overall'
            value={`${metrics.passed} / ${metrics.total}`}
            detail='Expected and actual decisions matched'
          />
        </div>
      </EvaluationSection>

      <EvaluationSection title='Decision details'>
        <EvaluationTable>
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Expected</th>
              <th>Actual</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((item) => {
              const result = results.find((candidate) => candidate.caseId === item.id);
              const trace = traceByCase.get(item.id);
              return (
                <tr key={item.id}>
                  <td>{caseLabel(item.id)}</td>
                  <td>{String(item.expectedOutput.guardrail_decision)}</td>
                  <td>{trace?.deterministicReasons.actual_decision ?? 'Not run'}</td>
                  <td>
                    <EvaluationLayerStatusBadge status={result?.status ?? 'PENDING'} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </EvaluationTable>
      </EvaluationSection>

      <EvaluationSection
        title='Revision approval'
        description={`This decision applies only to ${revisionLabel}.`}
        action={
          approval ? (
            <span className='inline-flex items-center gap-2 text-sm font-medium'>
              {approval.status === 'APPROVED' ? (
                <CheckCircle2 className='size-4 text-emerald-500' />
              ) : (
                <XCircle className='size-4 text-destructive' />
              )}
              {approval.status === 'APPROVED' ? 'Approved' : 'Rejected'}
            </span>
          ) : (
            <span className='inline-flex items-center gap-2 text-sm font-medium text-amber-500'>
              <ShieldCheck className='size-4' />Pending
            </span>
          )
        }
      >
        {approval ? (
          <KeyValueGrid
            items={[
              ['Decision', approval.status === 'APPROVED' ? 'Approved' : 'Rejected'],
              ['Revision', revisionLabel],
              ['Actor', approval.actor],
              ['Time', new Date(approval.decidedAt).toLocaleString()],
              ['Reason', approval.reason ?? 'Evaluation passed; revision is ready to use.'],
            ]}
          />
        ) : (
          <div className='flex flex-wrap items-center justify-between gap-4'>
            <p className='max-w-2xl text-sm text-muted-foreground'>
              Review the results above, then approve this Guardrail revision or send it back for changes.
            </p>
            <div className='flex gap-2'>
              <Button variant='outline' onClick={() => onDecision('REJECTED')}>
                Reject revision
              </Button>
              <Button onClick={() => onDecision('APPROVED')}>
                Approve revision
              </Button>
            </div>
          </div>
        )}
      </EvaluationSection>
    </div>
  );
}
