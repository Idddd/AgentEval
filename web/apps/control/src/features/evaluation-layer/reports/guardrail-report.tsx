import type {
  EvaluationLayerCase,
  EvaluationLayerRunResult,
  EvaluationLayerTrace,
} from '../model';
import { EvaluationLayerStatusBadge } from '../shared/evaluation-status';
import {
  EvaluationMetric,
  EvaluationSection,
  EvaluationTable,
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
}: {
  cases: EvaluationLayerCase[];
  results: EvaluationLayerRunResult[];
  traces: EvaluationLayerTrace[];
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
    </div>
  );
}
