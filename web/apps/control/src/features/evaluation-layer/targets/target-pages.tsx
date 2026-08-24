import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Plus, Target as TargetIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentProjectId } from '@/hooks/use-project';
import { useEffectiveProjectRole } from '@/hooks/use-project-permissions';
import { AgentGardenIcon } from '@/components/agent-garden/agent-garden-icon';
import type {
  EvaluationLayerResource,
  EvaluationLayerTargetKind,
  EvaluationLayerTargetRevision,
  EvaluationLayerTool,
} from '../model';
import { useEvaluationLayerState, useEvaluationLayerStore } from '../mock-provider';
import type { TargetRevisionInput } from '../mock-store';
import { EvaluationLayerStatusBadge } from '../shared/evaluation-status';
import {
  EvaluationMetric,
  EvaluationSection,
  EvaluationTable,
  KeyValueGrid,
  formatCost,
} from '../shared/evaluation-ui';
import { traceCost } from '../traces/trace-view-model';

const KIND_LABELS: Record<EvaluationLayerTargetKind, string> = {
  agent: 'Agent',
  mcp: 'MCP',
  kb: 'KB',
  skill: 'Skill',
  guardrail: 'Guardrail',
};

const targetFilters = ['All targets', 'Agents', 'MCP servers', 'Knowledge bases', 'Skills', 'Guardrails'] as const;
const filterToKind: Partial<
  Record<(typeof targetFilters)[number], EvaluationLayerTargetKind>
> = {
  Agents: 'agent',
  'MCP servers': 'mcp',
  'Knowledge bases': 'kb',
  Skills: 'skill',
  Guardrails: 'guardrail',
};

const kbCatalog: EvaluationLayerResource[] = [
  { id: 'policy-kb', name: 'Permission Policy KB' },
  { id: 'runbook-kb', name: 'Operations Runbook KB' },
];

function rate(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function reportMetrics(state: ReturnType<typeof useEvaluationLayerState>, reportId: string) {
  const report = state.reports.find((item) => item.id === reportId);
  const run = report ? state.runs.find((item) => item.id === report.runId) : undefined;
  const done = run?.results.filter((item) => item.status !== 'PENDING') ?? [];
  const traceIds = new Set(done.map((item) => item.traceId).filter(Boolean));
  return {
    report,
    run,
    passRate: done.length ? done.filter((item) => item.status === 'PASS').length / done.length : 0,
    cost: state.traces.filter((item) => traceIds.has(item.id)).reduce((sum, item) => sum + traceCost(item), 0),
  };
}

function targetReports(state: ReturnType<typeof useEvaluationLayerState>, targetId: string) {
  return state.reports
    .filter((report) => state.runs.find((run) => run.id === report.runId)?.targetId === targetId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function configurationSummary(revision: EvaluationLayerTargetRevision) {
  if (revision.kind === 'skill') {
    return `v${revision.version ?? '?'}${revision.prompt?.trim() ? ' · Instructions' : ''}`;
  }
  if (revision.kind === 'mcp') {
    return `${revision.tools.length} exposed tool${revision.tools.length === 1 ? '' : 's'} · ${revision.endpoint ?? 'no endpoint'}`;
  }
  if (revision.kind === 'kb') {
    return `${revision.sources?.length ?? 0} source${(revision.sources?.length ?? 0) === 1 ? '' : 's'}`;
  }
  if (revision.kind === 'guardrail') {
    return `v${revision.version ?? '?'} · ${revision.policyCount ?? 0} policies · ${revision.guardrailStages?.join(' / ') ?? 'no stages'}`;
  }
  const parts = ['Model'];
  if (revision.prompt?.trim()) parts.push('Prompt');
  if (revision.tools.length) parts.push(`${revision.tools.length} Tools`);
  return parts.join(' · ');
}

function resourcePicker({
  title,
  items,
  selected,
  onChange,
}: {
  title: string;
  items: EvaluationLayerResource[];
  selected: string[];
  onChange(value: string[]): void;
}) {
  return (
    <fieldset className='space-y-2 rounded-lg border p-3'>
      <legend className='px-1 text-sm font-medium'>{title}</legend>
      {items.map((item) => (
        <label key={item.id} className='flex items-center gap-2 text-sm'>
          <input
            type='checkbox'
            checked={selected.includes(item.id)}
            onChange={(event) =>
              onChange(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))
            }
          />
          {item.name}
        </label>
      ))}
      {!items.length ? <p className='text-xs text-muted-foreground'>No resources available.</p> : null}
    </fieldset>
  );
}

export function TargetEditor({
  open,
  onOpenChange,
  targetId,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  targetId?: string;
}) {
  const store = useEvaluationLayerStore();
  const state = useEvaluationLayerState();
  const role = useEffectiveProjectRole();
  const target = state.targets.find((item) => item.id === targetId);
  const revision = target
    ? state.targetRevisions.find((item) => item.id === target.currentRevisionId)
    : undefined;
  const toolCatalog = useMemo(() => {
    const tools = new Map<string, EvaluationLayerTool>();
    state.targetRevisions.flatMap((item) => item.tools).forEach((tool) => tools.set(tool.id, tool));
    return [...tools.values()];
  }, [state.targetRevisions]);
  const [kind, setKind] = useState<EvaluationLayerTargetKind>(target?.kind ?? 'agent');
  const [name, setName] = useState(target?.name ?? '');
  const [description, setDescription] = useState(target?.description ?? '');
  const [model, setModel] = useState(revision?.model ?? 'gpt-5-mini');
  const [prompt, setPrompt] = useState(revision?.prompt ?? '');
  const [endpoint, setEndpoint] = useState(revision?.endpoint ?? '');
  const [version, setVersion] = useState(revision?.version ?? '1.0.0');
  const [toolIds, setToolIds] = useState(revision?.tools.map((item) => item.id) ?? []);
  const [kbIds, setKbIds] = useState(
    revision?.kind === 'kb' ? revision?.sources?.map((item) => item.id) ?? [] : [],
  );
  const [error, setError] = useState('');
  const selectedTools = toolCatalog.filter((item) => toolIds.includes(item.id));
  const selectedKb = kbCatalog.filter((item) => kbIds.includes(item.id));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input: TargetRevisionInput = {};
    if (kind === 'agent') {
      input.model = model;
      input.prompt = prompt;
      input.tools = selectedTools;
    } else if (kind === 'mcp') {
      input.endpoint = endpoint;
      input.tools = selectedTools;
    } else if (kind === 'kb') {
      input.sources = selectedKb;
    } else {
      input.version = version;
      input.prompt = prompt;
    }
    if (targetId) {
      const result = store.createTargetRevision(targetId, input, {
        name: role === 'member' ? 'Developer' : role,
        role,
      });
      if (!result.ok) return setError(result.error);
    } else {
      const result = store.createTarget({ name, description, kind, ...input });
      if (!result.ok) return setError(result.error);
      store.selectActiveTarget(result.value.targetId);
    }
    setError('');
    onOpenChange(false);
  };

  const scope =
    kind === 'agent'
      ? ['Model', ...(prompt.trim() ? ['Prompt'] : []), ...(toolIds.length ? [`${toolIds.length} Tools`] : [])]
      : kind === 'mcp'
        ? [`${toolIds.length} exposed tool${toolIds.length === 1 ? '' : 's'}`, endpoint.trim() ? 'Endpoint' : 'No endpoint']
        : kind === 'kb'
          ? [`${kbIds.length} source${kbIds.length === 1 ? '' : 's'}`]
          : [`v${version || '?'}`, prompt.trim() ? 'Instructions' : 'No instructions'];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[min(calc(100%-2rem),58rem)]'>
        <DialogHeader>
          <DialogTitle>{targetId ? 'Create target revision' : 'Create target'}</DialogTitle>
          <DialogDescription>Define the immutable subject used by evaluations.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className='grid max-h-[68vh] gap-5 overflow-y-auto px-6 py-5'>
            {!targetId ? (
              <div className='grid gap-4 md:grid-cols-2'>
                <Label className='grid gap-2'>Name *<Input value={name} onChange={(event) => setName(event.target.value)} /></Label>
                <Label className='grid gap-2'>Description<Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Label>
              </div>
            ) : null}
            {!targetId ? (
              <Label className='grid gap-2'>
                Kind
                <select
                  className='h-9 rounded-md border bg-background px-3 text-sm'
                  value={kind}
                  onChange={(event) => setKind(event.target.value as EvaluationLayerTargetKind)}
                >
                  <option value='agent'>Agent</option>
                  <option value='mcp'>MCP server</option>
                  <option value='kb'>Knowledge base</option>
                  <option value='skill'>Skill</option>
                </select>
              </Label>
            ) : null}
            {kind === 'agent' ? (
              <div className='grid gap-4 md:grid-cols-2'>
                <Label className='grid gap-2'>Model *<Input value={model} onChange={(event) => setModel(event.target.value)} /></Label>
                <Label className='grid gap-2'>System prompt (optional)<Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></Label>
              </div>
            ) : null}
            {kind === 'mcp' ? (
              <Label className='grid gap-2'>
                Endpoint *
                <Input
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.target.value)}
                  placeholder='http://localhost:3001/mcp'
                />
              </Label>
            ) : null}
            {kind === 'skill' ? (
              <div className='grid gap-4 md:grid-cols-2'>
                <Label className='grid gap-2'>Version *<Input value={version} onChange={(event) => setVersion(event.target.value)} /></Label>
                <Label className='grid gap-2'>Instructions<Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></Label>
              </div>
            ) : null}
            {kind === 'agent' || kind === 'mcp' ? (
              resourcePicker({
                title: kind === 'mcp' ? 'Exposed tools' : 'Tools',
                items: toolCatalog,
                selected: toolIds,
                onChange: setToolIds,
              })
            ) : null}
            {kind === 'kb' ? (
              resourcePicker({ title: 'Sources', items: kbCatalog, selected: kbIds, onChange: setKbIds })
            ) : null}
            <div className='rounded-lg border bg-muted/25 p-4'>
              <p className='text-xs text-muted-foreground'>Revision preview</p>
              <p className='mt-1 font-medium'>{name.trim() || target?.name || 'Untitled target'}</p>
              <p className='mt-1 text-sm'>{scope.join(' · ')}</p>
              <p className='mt-1 text-xs text-muted-foreground'>
                {kind === 'agent'
                  ? `${toolIds.length} Tools`
                  : kind === 'mcp'
                    ? `${toolIds.length} exposed tools`
                    : kind === 'kb'
                      ? `${kbIds.length} Sources`
                      : `v${version || '?'}`}
              </p>
            </div>
            <p className='text-xs text-muted-foreground'>Authentication is not stored in Target. Supply resource authorization through the Dataset header field.</p>
            {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type='submit'>{targetId ? 'Create target revision' : 'Create target'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EvaluationTargetList() {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  const projectId = useCurrentProjectId();
  const [editorOpen, setEditorOpen] = useState(false);
  const [filter, setFilter] = useState<(typeof targetFilters)[number]>('All targets');
  const rows = state.targets.filter((target) => {
    const kindFilter = filterToKind[filter];
    return !kindFilter || target.kind === kindFilter;
  });
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <Label className='grid gap-2 text-xs text-muted-foreground'>
          Target filter
          <select className='h-9 min-w-48 rounded-md border bg-background px-3 text-sm text-foreground' value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            {targetFilters.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Label>
        <Button onClick={() => setEditorOpen(true)}><Plus className='size-4' />Create</Button>
      </div>
      {sortedRows.length ? (
        <EvaluationTable>
          <thead><tr><th>Target</th><th>Kind</th><th>Revision</th><th>Configuration</th><th>Updated</th><th>View</th></tr></thead>
          <tbody>
            {sortedRows.map((target) => {
              const revision = state.targetRevisions.find((item) => item.id === target.currentRevisionId)!;
              return (
                <tr key={target.id}>
                  <td>
                    <div className='flex items-center gap-3'>
                      <AgentGardenIcon type='custom' catalogIcon={target.icon} className='size-9' iconClassName='size-4' />
                      <span className='font-medium'>{target.name}</span>
                    </div>
                  </td>
                  <td>{KIND_LABELS[target.kind]}</td>
                  <td>R{revision.revision}</td>
                  <td>{configurationSummary(revision)}</td>
                  <td>{new Date(revision.createdAt).toLocaleString()}</td>
                  <td><Button asChild size='sm' variant='outline'><Link onClick={() => store.selectActiveTarget(target.id)} to='/$projectId/evaluation/targets/$targetId' params={{ projectId, targetId: target.id }}>View<ArrowRight className='size-4' /></Link></Button></td>
                </tr>
              );
            })}
          </tbody>
        </EvaluationTable>
      ) : <p className='rounded-lg border p-6 text-sm text-muted-foreground'>No Targets match this filter.</p>}
      <TargetEditor open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  );
}

export function EvaluationTargetDetail({
  targetId,
  onEvaluate,
  embedded = false,
  showEvaluateAction = true,
}: {
  targetId: string;
  onEvaluate?(): void;
  embedded?: boolean;
  showEvaluateAction?: boolean;
}) {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  const projectId = useCurrentProjectId();
  const role = useEffectiveProjectRole();
  const navigate = useNavigate();
  const [editorOpen, setEditorOpen] = useState(false);
  const target = state.targets.find((item) => item.id === targetId);
  const revisions = useMemo(() => state.targetRevisions.filter((item) => item.targetId === targetId).sort((a, b) => b.revision - a.revision), [state.targetRevisions, targetId]);
  if (!target) return <EmptyState icon={TargetIcon} title='Target not found' description='This Target does not exist in the Evaluation demo.' action={<Button asChild variant='outline'><Link to='/$projectId/evaluation/targets' params={{ projectId }}>Back to Target</Link></Button>} />;
  const current = revisions.find((item) => item.id === target.currentRevisionId)!;
  const reports = targetReports(state, target.id);
  const reportRows = reports.map((report, index) => {
    const metrics = reportMetrics(state, report.id);
    const targetRevision = state.targetRevisions.find((item) => item.id === metrics.run?.targetRevisionId);
    const datasetRevision = state.datasetRevisions.find((item) => item.id === metrics.run?.datasetRevisionId);
    const previous = reports[index + 1] ? reportMetrics(state, reports[index + 1]!.id).passRate : undefined;
    return { report, metrics, targetRevision, datasetRevision, delta: previous === undefined ? undefined : metrics.passRate - previous };
  });
  const latest = reportRows[0];
  const latestCurrentReport = reportRows.find((item) => {
    const run = item.metrics.run;
    if (item.targetRevision?.id !== current.id || !run) return false;
    const latestPublishedDatasetRevision = state.datasetRevisions
      .filter(
        (revision) =>
          revision.datasetId === run.datasetId && revision.status === 'PUBLISHED',
      )
      .sort(
        (left, right) =>
          right.revision - left.revision ||
          right.createdAt.localeCompare(left.createdAt) ||
          right.id.localeCompare(left.id),
      )[0];
    return latestPublishedDatasetRevision?.id === run.datasetRevisionId;
  })?.report;
  const decisionPending = Boolean(
    latestCurrentReport &&
    !state.revisionDecisions.some((item) => item.reportId === latestCurrentReport.id),
  );
  const canCreateRevision = role === 'member' && !decisionPending;
  const revisionActionLabel = decisionPending
    ? 'Decision pending'
    : role === 'member'
      ? 'New revision'
      : 'Developer only';
  const renderToolTable = (tools: EvaluationLayerTool[]) => (
    <EvaluationTable><thead><tr><th>Name</th><th>Description</th><th>Status</th><th>Tags</th></tr></thead><tbody>{tools.map((tool) => <tr key={tool.id}><td className='font-medium'>{tool.name}</td><td>{tool.description}</td><td>{tool.enabled ? 'Enabled' : 'Disabled'}</td><td>{tool.tags.join(', ')}</td></tr>)}</tbody></EvaluationTable>
  );
  const renderResourceTable = (resources: EvaluationLayerResource[]) => (
    <EvaluationTable><thead><tr><th>Name</th><th>ID</th></tr></thead><tbody>{resources.map((resource) => <tr key={resource.id}><td className='font-medium'>{resource.name}</td><td className='font-mono text-xs'>{resource.id}</td></tr>)}</tbody></EvaluationTable>
  );
  const emptyText = (label: string) => <p className='rounded-lg border p-6 text-sm text-muted-foreground'>No {label} configured for this revision.</p>;
  const configItems: [string, ReactNode][] =
    current.kind === 'mcp'
      ? [['Endpoint', current.endpoint ?? 'Not configured'], ['Revision', `R${current.revision}`], ['Exposed tools', `${current.tools.length}`]]
      : current.kind === 'kb'
        ? [['Sources', `${current.sources?.length ?? 0}`], ['Revision', `R${current.revision}`]]
        : current.kind === 'skill'
          ? [['Version', current.version ?? 'Not configured'], ['Revision', `R${current.revision}`], ['Instructions', current.prompt?.trim() ? 'Configured' : 'None']]
          : current.kind === 'guardrail'
            ? [['Version', current.version ?? 'Not configured'], ['Revision', `R${current.revision}`], ['Check stages', current.guardrailStages?.join(', ') ?? 'None'], ['Policies', current.policyCount ?? 0], ['Source', current.sourceStatus ?? 'OFFLINE']]
            : [['Model', current.model], ['Revision', `R${current.revision}`], ['Prompt', current.prompt?.trim() ? 'Configured' : 'None']];
  configItems.push(['Target ID', target.id]);
  const evaluate = () => {
    store.selectActiveTarget(target.id);
    if (onEvaluate) {
      onEvaluate();
      return;
    }
    void navigate({ to: '/$projectId/evaluation/runs/new', params: { projectId } });
  };
  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex items-start gap-4'>
          <AgentGardenIcon type='custom' catalogIcon={target.icon} />
          <div><h2 className='text-2xl font-semibold'>{target.name}</h2><p className='mt-1 text-sm text-muted-foreground'>{target.description || 'No description recorded.'}</p><p className='mt-1 text-xs text-muted-foreground'>Revision {current.revision} · {configurationSummary(current)}</p></div>
        </div>
        <div className='flex gap-2'>{target.kind !== 'guardrail' ? <Button variant='outline' disabled={!canCreateRevision} onClick={() => setEditorOpen(true)}><Plus className='size-4' />{revisionActionLabel}</Button> : null}{showEvaluateAction ? <Button aria-label={decisionPending ? 'Evaluation unavailable while decision pending' : 'Evaluate'} disabled={decisionPending} onClick={evaluate}>Evaluate</Button> : null}</div>
      </div>
      <EvaluationSection title='Configuration'>
        <KeyValueGrid className='lg:grid-cols-3' items={configItems} />
        {current.kind !== 'guardrail' ? <Tabs defaultValue={current.kind === 'skill' ? 'instructions' : current.kind === 'kb' ? 'sources' : 'tools'} className='mt-4'>
          <TabsList>
            {current.kind !== 'kb' ? (
              <TabsTrigger value='tools'>{current.kind === 'mcp' ? 'Exposed tools' : 'Tools'} ({current.tools.length})</TabsTrigger>
            ) : (
              <TabsTrigger value='sources'>Sources ({current.sources?.length ?? 0})</TabsTrigger>
            )}
            {current.kind === 'skill' ? <TabsTrigger value='instructions'>Instructions</TabsTrigger> : null}
          </TabsList>
          <TabsContent value='tools'>{current.tools.length ? renderToolTable(current.tools) : emptyText('Tools')}</TabsContent>
          <TabsContent value='sources'>{current.sources?.length ? renderResourceTable(current.sources) : emptyText('Sources')}</TabsContent>
          <TabsContent value='instructions'><p className='text-sm text-muted-foreground'>{current.prompt?.trim() || 'No instructions configured.'}</p></TabsContent>
        </Tabs> : <p className='mt-4 text-sm text-muted-foreground'>Guardrail configuration is managed at its source. This page evaluates and approves the recorded revision.</p>}
      </EvaluationSection>
      <EvaluationSection title='Latest Report'>
        {latest ? (
          <div className='grid gap-4 md:grid-cols-4'>
            <KeyValueGrid className='md:col-span-4 lg:grid-cols-4' items={[
              ['Status', <EvaluationLayerStatusBadge status={latest.report.status} />],
              ['Pass rate', rate(latest.metrics.passRate)],
              ['Evaluation cost', formatCost(latest.metrics.cost)],
              ['Created', new Date(latest.report.createdAt).toLocaleString()],
            ]} />
            {!embedded ? <Button asChild className='md:col-start-4'><Link to='/$projectId/evaluation/reports/$reportId' params={{ projectId, reportId: latest.report.id }}>View report</Link></Button> : null}
          </div>
        ) : <p className='text-sm text-muted-foreground'>No immutable Reports have been created for this Target yet.</p>}
      </EvaluationSection>
      <div className='grid gap-4 md:grid-cols-2'>
        <EvaluationSection title='Quality trend'>{reportRows.length < 2 ? <p className='text-sm text-muted-foreground'>At least two Reports are required to show a quality trend.</p> : <div className='space-y-3'>{reportRows.map((row) => <div key={row.report.id}><div className='flex justify-between text-xs'><span>{new Date(row.report.createdAt).toLocaleDateString()}</span><span>{rate(row.metrics.passRate)}</span></div><div className='mt-1 h-2 rounded bg-muted'><div className='h-2 rounded bg-emerald-500' style={{ width: rate(row.metrics.passRate) }} /></div></div>)}</div>}</EvaluationSection>
        <EvaluationSection title='Cost trend'>{reportRows.length < 2 ? <p className='text-sm text-muted-foreground'>At least two Reports with evaluation cost are required to show a cost trend.</p> : <div className='grid gap-3 sm:grid-cols-2'>{reportRows.map((row) => <EvaluationMetric key={row.report.id} label={new Date(row.report.createdAt).toLocaleDateString()} value={formatCost(row.metrics.cost)} />)}</div>}</EvaluationSection>
      </div>
      <EvaluationSection title='Report history'>
        {reportRows.length ? <EvaluationTable><thead><tr><th>Report</th><th>Time</th><th>Target revision</th><th>Dataset revision</th><th>Status</th><th>Pass rate</th><th>Pass rate delta</th><th>Cost</th></tr></thead><tbody>{reportRows.map((row, index) => <tr key={row.report.id}><td>{embedded ? `Report ${reportRows.length - index}` : <Button asChild size='sm' variant='outline'><Link className='font-mono text-xs' to='/$projectId/evaluation/reports/$reportId' params={{ projectId, reportId: row.report.id }}>{row.report.id}</Link></Button>}</td><td>{new Date(row.report.createdAt).toLocaleString()}</td><td>{row.targetRevision ? `R${row.targetRevision.revision}` : '—'}</td><td>{row.datasetRevision ? `R${row.datasetRevision.revision}` : '—'}</td><td>{row.report.status}</td><td>{rate(row.metrics.passRate)}</td><td>{row.delta === undefined ? '—' : `${row.delta >= 0 ? '+' : ''}${(row.delta * 100).toFixed(1)} pp`}</td><td>{formatCost(row.metrics.cost)}</td></tr>)}</tbody></EvaluationTable> : <p className='text-sm text-muted-foreground'>No Reports yet.</p>}
      </EvaluationSection>
      <TargetEditor open={editorOpen} onOpenChange={setEditorOpen} targetId={target.id} />
    </div>
  );
}
