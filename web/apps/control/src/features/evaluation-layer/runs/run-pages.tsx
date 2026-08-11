import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, FlaskConical, Play, Plus } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useCurrentProjectId } from '@/hooks/use-project';
import { cn } from '@/lib/utils';
import type { EvaluationLayerLogEntry, EvaluationLayerTargetKind } from '../model';
import { isLiveMonitoringRun } from '../mock-store';
import { useEvaluationLayerState, useEvaluationLayerStore } from '../mock-provider';
import { EvaluationLayerStatusBadge } from '../shared/evaluation-status';
import {
  EvaluationMetric,
  EvaluationSection,
  EvaluationTable,
  JsonPreview,
  KeyValueGrid,
  formatCost,
} from '../shared/evaluation-ui';
import { traceCost } from '../traces/trace-view-model';

function rate(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

type GuardrailTemplate = ReturnType<typeof useEvaluationLayerState>['guardrailTemplates'][number];

function applicableGuardrailTemplates(
  templates: GuardrailTemplate[],
  targetKind: EvaluationLayerTargetKind,
) {
  return templates.filter((template) => template.applicableTargetKinds.includes(targetKind));
}

export function guardrailTemplateIdsForTarget(
  templates: GuardrailTemplate[],
  targetKind: EvaluationLayerTargetKind,
  previousIds?: readonly string[],
) {
  const applicable = applicableGuardrailTemplates(templates, targetKind);
  if (previousIds) {
    const applicableIds = new Set(applicable.map((template) => template.id));
    return previousIds.filter((id) => applicableIds.has(id));
  }
  return applicable
    .filter((template) => template.defaultFor.includes(targetKind))
    .map((template) => template.id);
}

export function GuardrailTemplatePicker({
  targetKind,
  selectedIds,
  onSelectedIdsChange,
  disabled = false,
}: {
  targetKind: EvaluationLayerTargetKind;
  selectedIds: readonly string[];
  onSelectedIdsChange(ids: string[]): void;
  disabled?: boolean;
}) {
  const state = useEvaluationLayerState();
  const templates = applicableGuardrailTemplates(state.guardrailTemplates, targetKind);
  const selected = templates.filter((template) => selectedIds.includes(template.id));
  const caseCount = selected.reduce((sum, template) => sum + template.cases.length, 0);
  const toggle = (templateId: string, checked: boolean) => {
    onSelectedIdsChange(checked
      ? [...selectedIds, templateId]
      : selectedIds.filter((id) => id !== templateId));
  };

  return (
    <fieldset aria-label='Guardrail Test Packs' className='space-y-3 rounded-lg border bg-muted/10 p-4'>
      <legend className='sr-only'>Guardrail Test Packs</legend>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div>
          <p className='text-sm font-semibold'>Guardrail test packs</p>
          <p className='mt-1 text-xs text-muted-foreground'>Choose one or more reusable safety baselines for this Target type.</p>
        </div>
        <span className='rounded-full border bg-background px-2.5 py-1 text-xs font-medium'>
          {selected.length} selected · {caseCount} safety cases
        </span>
      </div>
      {templates.length ? (
        <div className='grid gap-2 sm:grid-cols-2'>
          {templates.map((template) => {
            const checked = selectedIds.includes(template.id);
            const recommended = template.defaultFor.includes(targetKind);
            return (
              <label
                key={template.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  checked ? 'border-primary/45 bg-primary/5' : 'bg-background',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  aria-label={`Select ${template.name}`}
                  className='mt-1 size-4 accent-primary'
                  type='checkbox'
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => toggle(template.id, event.target.checked)}
                />
                <span className='min-w-0 flex-1'>
                  <span className='flex flex-wrap items-center gap-2 text-sm font-medium'>
                    {template.name}
                    {recommended ? <span className='rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300'>Recommended</span> : null}
                  </span>
                  <span className='mt-1 block text-xs text-muted-foreground'>{template.description}</span>
                  <span className='mt-2 block text-[11px] text-muted-foreground'>v{template.version} · {template.cases.length} cases</span>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className='rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm'>No Guardrail test pack is available for this Target type.</p>
      )}
      {!selected.length ? <p role='alert' className='text-xs font-medium text-amber-700 dark:text-amber-300'>Select at least one Guardrail test pack before running the evaluation.</p> : null}
    </fieldset>
  );
}

function runStats(state: ReturnType<typeof useEvaluationLayerState>, runId: string) {
  const run = state.runs.find((item) => item.id === runId)!;
  const done = run.results.filter((result) => result.status !== 'PENDING');
  const traceIds = new Set(done.map((result) => result.traceId).filter(Boolean));
  return {
    done,
    cost: state.traces.filter((trace) => traceIds.has(trace.id)).reduce((sum, trace) => sum + traceCost(trace), 0),
    passRate: done.length ? done.filter((item) => item.status === 'PASS').length / done.length : 0,
  };
}

function TargetSelect() {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  return (
    <Label className='grid gap-2 text-xs text-muted-foreground'>
      Target
      <select className='h-9 min-w-64 rounded-md border bg-background px-3 text-sm text-foreground' value={state.settings.activeTargetId} onChange={(event) => store.selectActiveTarget(event.target.value)}>
        {state.targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
      </select>
    </Label>
  );
}

export function EvaluationRunList() {
  const state = useEvaluationLayerState();
  const projectId = useCurrentProjectId();
  // Live-monitoring runs only feed the Traces/Overview view; real evaluation runs stay static.
  const runs = [...state.runs].filter((item) => item.targetId === state.settings.activeTargetId && !isLiveMonitoringRun(item.id)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-end justify-between gap-3'><TargetSelect /><Button asChild><Link to='/$projectId/evaluation/runs/new' params={{ projectId }}><Plus className='size-4' />New evaluation</Link></Button></div>
      {runs.length ? <EvaluationTable>
        <thead><tr><th>Started</th><th>Target revision</th><th>Dataset revision</th><th>Status</th><th>Quality</th><th>Cost</th><th>View</th></tr></thead>
        <tbody>{runs.map((run) => {
          const targetRevision = state.targetRevisions.find((item) => item.id === run.targetRevisionId);
          const datasetRevision = state.datasetRevisions.find((item) => item.id === run.datasetRevisionId);
          const report = state.reports.find((item) => item.runId === run.id);
          const stats = runStats(state, run.id);
          return <tr key={run.id}><td>{new Date(run.startedAt).toLocaleString()}</td><td>{targetRevision ? `R${targetRevision.revision}` : '—'}</td><td>{datasetRevision ? `R${datasetRevision.revision}` : '—'}</td><td><EvaluationLayerStatusBadge status={run.status} /></td><td>{report?.status ?? 'INCOMPLETE'}</td><td>{formatCost(stats.cost)}</td><td>{report ? <Button asChild size='sm' variant='outline'><Link to='/$projectId/evaluation/reports/$reportId' params={{ projectId, reportId: report.id }}>View<ArrowRight className='size-4' /></Link></Button> : ''}</td></tr>;
        })}</tbody>
      </EvaluationTable> : <p className='rounded-lg border p-6 text-sm text-muted-foreground'>No evaluation runs yet.</p>}
    </div>
  );
}

export function EvaluationRunSetup({ onRunCreated }: { onRunCreated?(runId: string): void } = {}) {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  const projectId = useCurrentProjectId();
  const navigate = useNavigate();
  const target = state.targets.find((item) => item.id === state.settings.activeTargetId) ?? state.targets[0]!;
  const targetRevision = state.targetRevisions.find((item) => item.id === target.currentRevisionId)!;
  const latestTargetRun = [...state.runs]
    .filter((run) => run.targetId === target.id && !isLiveMonitoringRun(run.id))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
  const initialGuardrailTemplateIds = guardrailTemplateIdsForTarget(
    state.guardrailTemplates,
    target.kind,
    latestTargetRun?.guardrailTemplateIds,
  );
  const options = useMemo(() => {
    const published = state.datasetRevisions
      .filter((item) => item.targetId === target.id && item.status === 'PUBLISHED')
      .map((revision) => {
        const dataset = state.datasets.find((item) => item.id === revision.datasetId)!;
        return { value: `revision:${revision.id}`, label: `${dataset.name} · R${revision.revision} · ${revision.cases.length} cases`, revisionId: revision.id, datasetId: dataset.id, draft: false };
      });
    const drafts = state.datasetRevisions
      .filter((item) => item.targetId === target.id && item.status === 'DRAFT' && item.cases.length)
      .map((revision) => {
        const dataset = state.datasets.find((item) => item.id === revision.datasetId)!;
        return { value: `draft:${dataset.id}`, label: `Publish current draft · ${dataset.name} · ${revision.cases.length} cases`, revisionId: revision.id, datasetId: dataset.id, draft: true };
      });
    return [...published, ...drafts];
  }, [state.datasetRevisions, state.datasets, target.id]);
  const defaultOption = options.find((item) => item.datasetId === state.settings.activeDatasetId && !item.draft) ?? options[0];
  const [source, setSource] = useState(defaultOption?.value ?? '');
  const [publishedDraftId, setPublishedDraftId] = useState('');
  const [selectedGuardrailTemplateIds, setSelectedGuardrailTemplateIds] = useState(initialGuardrailTemplateIds);
  const [evaluatorSource, setEvaluatorSource] = useState<'BUILT_IN' | 'LANGFUSE'>('BUILT_IN');
  const [selectedLangfuse, setSelectedLangfuse] = useState(() => new Set(state.evaluators.filter((item) => item.provider === 'LANGFUSE' && item.enabled).map((item) => item.id)));
  const [message, setMessage] = useState('');
  const option = options.find((item) => item.value === source);
  const selectedRevisionId = option?.draft ? publishedDraftId : option?.revisionId ?? '';
  const selectedRevision = state.datasetRevisions.find((item) => item.id === (option?.draft ? option.revisionId : selectedRevisionId));
  useEffect(() => {
    setSelectedGuardrailTemplateIds(guardrailTemplateIdsForTarget(
      state.guardrailTemplates,
      target.kind,
      latestTargetRun?.guardrailTemplateIds,
    ));
  }, [latestTargetRun?.id, state.guardrailTemplates, target.id, target.kind]);
  const pendingDecisionReport = state.reports
    .filter((report) => {
      const run = state.runs.find((item) => item.id === report.runId);
      return run?.targetRevisionId === targetRevision.id && run.datasetRevisionId === selectedRevisionId;
    })
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
    )[0];
  const decisionPending = Boolean(
    pendingDecisionReport &&
    !state.revisionDecisions.some((item) => item.reportId === pendingDecisionReport.id),
  );
  const unavailable = useMemo(() => {
    const available = new Set(targetRevision.tools.filter((tool) => tool.enabled).flatMap((tool) => [tool.id.toLowerCase(), tool.name.toLowerCase()]));
    return [...new Set((selectedRevision?.cases ?? []).map((item) => String(item.expectedOutput.expected_tool_called ?? '')).filter((name) => name && !available.has(name.toLowerCase())))];
  }, [selectedRevision, targetRevision.tools]);
  const publishDraft = () => {
    if (!option?.draft) return;
    const result = store.publishDatasetRevision(option.datasetId);
    if (!result.ok) return setMessage(result.error);
    setPublishedDraftId(result.value.revisionId);
    setMessage('Selected draft published as an immutable Dataset revision.');
  };
  const start = () => {
    if (!selectedRevisionId) return;
    if (!selectedGuardrailTemplateIds.length) {
      setMessage('Select at least one Guardrail test pack before starting the evaluation.');
      return;
    }
    const evaluatorIds = evaluatorSource === 'BUILT_IN'
      ? state.evaluators.filter((item) => item.provider === 'BUILT_IN' && item.enabled).map((item) => item.id)
      : [...selectedLangfuse];
    const result = store.createRun({
      targetRevisionId: targetRevision.id,
      datasetRevisionId: selectedRevisionId,
      evaluatorIds,
      guardrailTemplateIds: selectedGuardrailTemplateIds,
    });
    if (!result.ok) return setMessage(result.error);
    if (onRunCreated) {
      onRunCreated(result.value.runId);
      return;
    }
    // Navigate to the run detail so the execution terminal streams case by case.
    void navigate({ to: '/$projectId/evaluation/runs/$runId', params: { projectId, runId: result.value.runId } });
  };
  return (
    <div className='mx-auto max-w-4xl space-y-6'>
      <EvaluationSection title='Evaluation' description='Select immutable inputs, review the evaluation context, and start a run.'>
        <div className='grid gap-5'>
          <div className='rounded-lg border bg-muted/20 p-4'><p className='font-medium'>Configuration</p><p className='mt-1 text-sm text-muted-foreground'>Target R{targetRevision.revision} · {targetRevision.model} · {targetRevision.tools.length} tool bindings</p></div>
          <div><p className='font-medium'>Test coverage</p><p className='mt-1 text-sm text-muted-foreground'>Combine your Business Dataset with required Guardrail safety tests.</p></div>
          {options.length ? <Label className='grid gap-2'>Business Dataset<select className='h-11 rounded-md border bg-background px-3' value={source} onChange={(event) => { setSource(event.target.value); setPublishedDraftId(''); }}><option value='' disabled>Select a Dataset source</option>{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Label> : <p className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm'>Add cases to a Dataset draft before starting an evaluation.</p>}
          {option?.draft && !publishedDraftId ? <Button className='w-fit' variant='outline' onClick={publishDraft}>Publish selected draft</Button> : null}
          <GuardrailTemplatePicker targetKind={target.kind} selectedIds={selectedGuardrailTemplateIds} onSelectedIdsChange={setSelectedGuardrailTemplateIds} />
          <Label className='grid gap-2'>Evaluator source<select className='h-11 rounded-md border bg-background px-3' value={evaluatorSource} onChange={(event) => setEvaluatorSource(event.target.value as 'BUILT_IN' | 'LANGFUSE')}><option value='BUILT_IN'>Built-in</option><option value='LANGFUSE'>Langfuse</option></select></Label>
          {evaluatorSource === 'LANGFUSE' ? <fieldset className='space-y-2 rounded-lg border p-4'><legend className='px-1 text-sm font-medium'>Evaluators</legend>{state.evaluators.filter((item) => item.provider === 'LANGFUSE').map((evaluator) => <label key={evaluator.id} className='flex items-center gap-2 text-sm'><input type='checkbox' checked={selectedLangfuse.has(evaluator.id)} onChange={(event) => setSelectedLangfuse((current) => { const next = new Set(current); if (event.target.checked) next.add(evaluator.id); else next.delete(evaluator.id); return next; })} />{evaluator.name} · {evaluator.provider} · v{evaluator.version}</label>)}</fieldset> : null}
          <p className='text-sm text-muted-foreground'>Evaluator {evaluatorSource === 'BUILT_IN' ? 'Built-in v1' : `Langfuse · ${selectedLangfuse.size} selected`} · Judge {state.settings.model}</p>
          <p className='text-xs text-muted-foreground'>Deterministic assertions remain authoritative · Cost includes agent and judge usage</p>
          {decisionPending ? <p role='status' className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm'>This evaluation is waiting for an Admin decision before it can be run again.</p> : null}
          {unavailable.length ? <p className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm'>Tool evidence unavailable: {unavailable.join(', ')}. This does not block the run.</p> : null}
          {message ? <p className='rounded-lg border p-3 text-sm'>{message}</p> : null}
        </div>
      </EvaluationSection>
      <div className='flex justify-end'><Button size='lg' disabled={decisionPending || !selectedRevisionId || !selectedGuardrailTemplateIds.length || (evaluatorSource === 'LANGFUSE' && !selectedLangfuse.size)} onClick={start}><Play className='size-4' />Start evaluation</Button></div>
    </div>
  );
}

const LOG_PREFIX: Record<EvaluationLayerLogEntry['actor'], string> = {
  system: '$',
  agent: '[agent]',
  tool: '[tool]',
  judge: '[judge]',
};

const LOG_OUTCOME_CLASS: Record<EvaluationLayerLogEntry['outcome'], string> = {
  allowed: 'text-emerald-400',
  blocked: 'text-amber-400',
  violation: 'text-red-400',
  error: 'text-red-400',
  info: 'text-zinc-300',
};

/** Terminal-style rendering of the structured execution log (pure mock). */
function ExecutionTerminal({ entries }: { entries: EvaluationLayerLogEntry[] }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [entries.length]);
  return (
    <div ref={bodyRef} className='max-h-96 overflow-y-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-6 text-zinc-200'>
      {entries.length ? (
        entries.map((entry) => (
          <p key={entry.id} className='whitespace-pre-wrap'>
            <span className='text-zinc-500'>{new Date(entry.at).toLocaleTimeString('en-GB')}</span>{' '}
            <span className='text-sky-400'>{LOG_PREFIX[entry.actor]}</span>{' '}
            <span className={LOG_OUTCOME_CLASS[entry.outcome]}>{entry.detail}</span>
          </p>
        ))
      ) : (
        <p className='text-zinc-500'>$ waiting for execution…</p>
      )}
    </div>
  );
}

export function EvaluationRunDetail({ runId, embedded = false }: { runId: string; embedded?: boolean }) {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  const projectId = useCurrentProjectId();
  const [autoRun, setAutoRun] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const run = state.runs.find((item) => item.id === runId);
  const pending = run?.results.find((result) => result.status === 'PENDING');
  // Auto-advance the mock execution so the terminal streams case by case.
  useEffect(() => {
    if (!autoRun || !run || !pending) return;
    const timer = setInterval(() => {
      store.advanceRun(run.id);
    }, 900);
    return () => clearInterval(timer);
  }, [autoRun, run, pending, store]);
  if (!run) return <EmptyState icon={FlaskConical} title='Evaluation not found' description='This mock Evaluation does not exist.' action={<Button asChild variant='outline'><Link to='/$projectId/evaluation/runs' params={{ projectId }}>Back to Evaluation</Link></Button>} />;
  const target = state.targets.find((item) => item.id === run.targetId)!;
  const targetRevision = state.targetRevisions.find((item) => item.id === run.targetRevisionId);
  const dataset = state.datasets.find((item) => item.id === run.datasetId)!;
  const datasetRevision = state.datasetRevisions.find((item) => item.id === run.datasetRevisionId)!;
  const stats = runStats(state, run.id);
  const currentCase = datasetRevision.cases.find((item) => item.id === pending?.caseId);
  const report = state.reports.find((item) => item.runId === run.id);
  const logs = state.logs
    .filter((entry) => entry.runId === run.id)
    .sort((a, b) => a.at.localeCompare(b.at));
  const statusTitle = pending
    ? 'Evaluation running'
    : run.status === 'FAILED'
      ? 'Evaluation failed'
      : 'Evaluation complete';
  const statusDetail = pending
    ? `${stats.done.length}/${run.results.length} Cases complete.`
    : run.status === 'FAILED'
      ? 'Run failed.'
      : stats.done.every((result) => result.status === 'PASS')
        ? 'All Cases passed.'
        : 'Review findings.';
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5'>
        <div className='min-w-0'>
          <h2 className='text-sm font-semibold'>{statusTitle}</h2>
          <p className='text-xs text-muted-foreground'>{statusDetail}</p>
        </div>
        <div className='flex items-center gap-2'>
          <EvaluationLayerStatusBadge status={run.status} />
          <Button
            aria-controls={`evaluation-details-${run.id}`}
            aria-expanded={detailsOpen}
            size='sm'
            variant='outline'
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {detailsOpen ? 'Hide details' : 'Details'}
          </Button>
        </div>
      </div>
      {detailsOpen ? <div id={`evaluation-details-${run.id}`} className='space-y-5'>
        <div className='flex flex-wrap items-start justify-between gap-3'><div><h3 className='text-base font-semibold'>Evaluation details</h3><p className='mt-1 text-sm text-muted-foreground'>{target.name} · {dataset.name}</p></div>{pending ? <div className='flex items-center gap-4'><Label className='flex items-center gap-2 text-sm'><input type='checkbox' checked={autoRun} onChange={(event) => setAutoRun(event.target.checked)} />Auto run</Label><Button onClick={() => store.advanceRun(run.id)}><Play className='size-4' />Run next Case</Button></div> : report && !embedded ? <Button asChild><Link to='/$projectId/evaluation/reports/$reportId' params={{ projectId, reportId: report.id }}>Open Report<ArrowRight className='size-4' /></Link></Button> : null}</div>
        <KeyValueGrid items={[['Target revision', targetRevision ? `R${targetRevision.revision}` : '—'], ['Dataset revision', datasetRevision ? `R${datasetRevision.revision}` : '—'], ['Evaluators', run.evaluatorIds.join(', ')], ['Judge model', state.settings.model], ['Started', new Date(run.startedAt).toLocaleString()], ['Status', <EvaluationLayerStatusBadge status={run.status} />]]} />
        <div className='grid gap-4 md:grid-cols-3'><EvaluationMetric label='Progress' value={`${stats.done.length}/${run.results.length}`} detail={<Progress value={(stats.done.length / Math.max(run.results.length, 1)) * 100} />} /><EvaluationMetric label='Pass rate' value={rate(stats.passRate)} /><EvaluationMetric label='Evaluation cost' value={formatCost(stats.cost)} /></div>
        <EvaluationSection title='Execution log' description='Structured mock log streamed while Cases execute; kept after the run completes.'>
          <ExecutionTerminal entries={logs} />
        </EvaluationSection>
        {currentCase ? <EvaluationSection title='Current Case'><div className='grid gap-4 lg:grid-cols-2'><div><p className='mb-2 text-xs text-muted-foreground'>Input</p><JsonPreview value={currentCase.input} /></div><div><p className='mb-2 text-xs text-muted-foreground'>Expected output</p><JsonPreview value={currentCase.expectedOutput} /></div></div></EvaluationSection> : null}
        <EvaluationSection title='Case progress'><EvaluationTable><thead><tr><th>Case</th><th>Status</th><th>Response</th><th>Trace</th></tr></thead><tbody>{run.results.map((result) => <tr key={result.caseId}><td>{result.caseId}</td><td><EvaluationLayerStatusBadge status={result.status} /></td><td>{result.response ?? 'Waiting'}</td><td>{result.traceId ? embedded ? 'Available' : <Button asChild size='sm' variant='outline'><Link className='font-mono text-xs' to='/$projectId/evaluation/traces/$traceId' params={{ projectId, traceId: result.traceId }}>{result.traceId}</Link></Button> : 'Not available'}</td></tr>)}</tbody></EvaluationTable></EvaluationSection>
      </div> : null}
    </div>
  );
}
