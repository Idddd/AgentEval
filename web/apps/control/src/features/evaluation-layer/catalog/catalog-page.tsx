import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Circle,
  Database,
  FileText,
  FlaskConical,
  LayoutGrid,
  List,
  Play,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Workflow,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentProjectId } from '@/hooks/use-project';
import { useEffectiveProjectRole } from '@/hooks/use-project-permissions';
import { cn } from '@/lib/utils';
import type { EvaluationLayerTargetKind } from '../model';
import { useEvaluationLayerState, useEvaluationLayerStore } from '../mock-provider';
import { DatasetEditor, EvaluationDatasetDetail } from '../datasets/dataset-pages';
import { isLiveMonitoringRun } from '../mock-store';
import { EvaluationReportDetail } from '../reports/report-page';
import {
  EvaluationRunDetail,
  EvaluationRunSetup,
  GuardrailTemplatePicker,
  guardrailTemplateIdsForTarget,
} from '../runs/run-pages';
import { EvaluationLayerStatusBadge } from '../shared/evaluation-status';
import {
  EvaluationSection,
  EvaluationTable,
  formatCost,
  formatRelativeTime,
} from '../shared/evaluation-ui';
import { EvaluationTargetDetail } from '../targets/target-pages';
import { traceCost } from '../traces/trace-view-model';
import {
  workspaceNextStep,
  workspaceRows,
  type WorkspaceNextStep,
  type WorkspaceRow,
  type WorkspaceStage,
} from './workspace-view-model';

type CatalogView = 'cards' | 'list' | 'lifecycle';
type CatalogSort = 'updated' | 'name' | 'stage';
type KindFilter = 'all' | EvaluationLayerTargetKind;
type StageFilter = 'ALL' | WorkspaceStage;

const KIND_META: Record<
  EvaluationLayerTargetKind,
  { label: string; icon: LucideIcon; className: string }
> = {
  agent: { label: 'Agent', icon: Bot, className: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  mcp: { label: 'MCP Server', icon: Wrench, className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  kb: { label: 'Knowledge Base', icon: Database, className: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  skill: { label: 'Skill', icon: FileText, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  guardrail: { label: 'Guardrail', icon: ShieldCheck, className: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
};

const STAGE_META: Record<WorkspaceStage, { label: string; className: string }> = {
  NOT_EVALUATED: { label: 'Not evaluated', className: 'border-border bg-muted/55 text-muted-foreground' },
  RUNNING: { label: 'Running', className: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  COMPLETED: { label: 'Completed', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  FAILED: { label: 'Failed', className: 'border-destructive/30 bg-destructive/10 text-destructive' },
  NEEDS_RE_EVALUATION: { label: 'Needs re-evaluation', className: 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
};

const STAGE_ORDER: StageFilter[] = [
  'ALL',
  'NOT_EVALUATED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'NEEDS_RE_EVALUATION',
];

function KindMark({ kind, size = 'default' }: { kind: EvaluationLayerTargetKind; size?: 'default' | 'large' }) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-lg border', size === 'large' ? 'size-12' : 'size-10', meta.className)}>
      <Icon className={size === 'large' ? 'size-6' : 'size-5'} />
    </span>
  );
}

function StageBadge({ stage }: { stage: WorkspaceStage }) {
  const meta = STAGE_META[stage];
  return <Badge variant='outline' className={meta.className}>{meta.label}</Badge>;
}

function configurationSummary(row: WorkspaceRow) {
  const revision = row.currentRevision;
  if (!revision) return 'No revision';
  if (revision.kind === 'skill') return `v${revision.version ?? '?'}${revision.prompt?.trim() ? ' · Instructions' : ''}`;
  if (revision.kind === 'mcp') return `${revision.tools.length} tool${revision.tools.length === 1 ? '' : 's'} · ${revision.endpoint ?? 'No endpoint'}`;
  if (revision.kind === 'kb') return `${revision.sources?.length ?? 0} source${(revision.sources?.length ?? 0) === 1 ? '' : 's'}`;
  if (revision.kind === 'guardrail') return `v${revision.version ?? '?'} · ${revision.policyCount ?? 0} policies · ${revision.guardrailStages?.join(' / ') ?? 'No stages'}`;
  const parts = [revision.model ?? 'No model'];
  if (revision.prompt?.trim()) parts.push('Prompt');
  if (revision.tools.length) parts.push(`${revision.tools.length} tools`);
  return parts.join(' · ');
}

function datasetSummary(row: WorkspaceRow) {
  if (!row.selectedDataset) return 'Not created';
  const revision = row.publishedRevision ?? row.draftRevision;
  if (!revision) return row.selectedDataset.name;
  return `${row.selectedDataset.name} · ${revision.cases.length} case${revision.cases.length === 1 ? '' : 's'}`;
}

function datasetLifecycleDetail(row: WorkspaceRow) {
  if (row.publishedRevision && row.draftRevision) {
    return `Published R${row.publishedRevision.revision} · ${row.draftRevision.cases.length} draft cases`;
  }
  if (row.publishedRevision) return `Published R${row.publishedRevision.revision}`;
  if (row.draftRevision) return `${row.draftRevision.cases.length} draft cases`;
  return 'Create before run';
}

function resultActionLabel(row: WorkspaceRow) {
  if (!row.publishedRevision) return row.draftRevision ? 'Publish Test Cases' : 'Prepare Test Cases';
  if (row.stage === 'NEEDS_RE_EVALUATION') return 'Re-evaluation required';
  if (row.stage === 'RUNNING') return 'Evaluation in progress';
  if (row.stage === 'NOT_EVALUATED') return 'Start evaluation';
  if (row.decisionStatus === 'APPROVED') return 'Approved by Admin';
  if (row.decisionStatus === 'REJECTED') return 'Rejected · Developer changes required';
  if (row.decisionStatus === 'PENDING') {
    return row.decisionRecommendation === 'APPROVED'
      ? 'Awaiting Admin approval'
      : 'Awaiting Admin rejection';
  }
  if (row.stage === 'FAILED') return 'Retry required';
  if (row.risk.kind === 'FINDINGS') return 'Review required';
  return 'No findings';
}

function decisionStatusLabel(row: WorkspaceRow) {
  if (row.decisionStatus === 'APPROVED') return 'Approved';
  if (row.decisionStatus === 'REJECTED') return 'Rejected';
  if (row.decisionStatus === 'PENDING') {
    return row.decisionRecommendation === 'APPROVED' ? 'Pending approval' : 'Pending rejection';
  }
  return undefined;
}

function reportReason(row: WorkspaceRow) {
  const finding = row.latestRun?.results.find(
    (result) => result.status === 'FAIL' || result.status === 'ERROR',
  );
  if (finding?.response) return finding.response;
  if (row.latestRun?.status === 'FAILED') return 'The evaluation did not complete successfully.';
  if (row.isStale) return 'The Target or Dataset changed after this evaluation.';
  if (row.latestReport) return 'All evaluated Cases passed.';
  return 'Complete an evaluation to produce a result.';
}

export function LifecycleNode({
  label,
  value,
  detail,
  tone,
  recommended = false,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'done' | 'active' | 'waiting' | 'failed' | 'stale';
  recommended?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={cn(
        'absolute left-0 top-0 grid size-5 place-items-center rounded-full border bg-background text-[10px]',
        tone === 'done' && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        tone === 'active' && 'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
        tone === 'failed' && 'border-destructive/50 bg-destructive/10 text-destructive',
        tone === 'stale' && 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        tone === 'waiting' && 'border-border text-muted-foreground',
      )}>
        {tone === 'done' ? <Check className='size-3' /> : tone === 'failed' ? <XCircle className='size-3' /> : <Circle className='size-2.5 fill-current' />}
      </span>
      <p className='text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'>{label}</p>
      <p className='mt-0.5 truncate text-xs font-semibold text-foreground'>{value}</p>
      <p className='mt-0.5 truncate text-[10px] text-muted-foreground'>{detail}</p>
      {recommended ? <ArrowRight className='absolute right-2 top-1/2 size-4 -translate-y-1/2 text-cyan-600 dark:text-cyan-300' /> : null}
    </>
  );
  const className = cn(
    'relative min-w-0 rounded-md py-1 pl-8 text-left',
    onClick && 'pr-8 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    recommended && 'bg-cyan-500/10 ring-1 ring-cyan-500/40',
  );

  if (onClick) {
    return (
      <button
        type='button'
        className={className}
        aria-label={`Open ${label}: ${value}`}
        aria-current={recommended ? 'step' : undefined}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}

function datasetCountSummary(row: WorkspaceRow) {
  const count = (row.publishedRevision ?? row.draftRevision)?.cases.length ?? 0;
  return `${count} ${count === 1 ? 'case' : 'cases'}`;
}

function compactResult(row: WorkspaceRow) {
  if (row.decisionStatus === 'APPROVED') return 'Approved';
  if (row.decisionStatus === 'REJECTED') return 'Rejected';
  const run = row.latestRun;
  if (!run) return 'Not evaluated';
  if (run.status === 'QUEUED' || run.status === 'RUNNING') return 'In progress';
  if (run.status === 'FAILED') return 'Failed';
  return run.results.some(
    (result) => result.status === 'FAIL' || result.status === 'ERROR',
  )
    ? 'Findings'
    : 'Passed';
}

type WorkspaceSectionKey = 'agent' | 'dataset' | 'run' | 'result';
type WorkspaceSectionTone = 'ready' | 'active' | 'waiting' | 'failed' | 'stale';
type VisibleWorkflowStage = 'coverage' | 'evaluation' | 'result';

function visibleWorkflowStage(section: WorkspaceSectionKey): VisibleWorkflowStage {
  if (section === 'run') return 'evaluation';
  if (section === 'result') return 'result';
  return 'coverage';
}

export function WorkspaceActionBar({
  step,
  action,
  progress,
}: {
  step: WorkspaceNextStep;
  action?: ReactNode | undefined;
  progress?: number | undefined;
}) {
  return (
    <div className='flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
      <div className='min-w-0'>
        <p className='text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground'>Current step</p>
        <p className='mt-1 font-semibold text-foreground'>{step.label}</p>
        <p className='mt-1 text-xs text-muted-foreground'>{step.description}</p>
      </div>
      {typeof progress === 'number' ? (
        <div className='grid min-w-44 shrink-0 gap-1.5' aria-label={`Evaluation ${progress}% complete`}>
          <div className='flex items-center justify-between text-xs font-medium'><span>Running</span><span>{progress}%</span></div>
          <Progress value={progress} />
        </div>
      ) : action}
    </div>
  );
}

function WorkspaceSection({
  action,
  ariaLabel,
  children,
  current = false,
  description,
  section,
  sectionRef,
  status,
  step,
  title,
  tone,
}: {
  action?: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
  current?: boolean;
  description: string;
  section: WorkspaceSectionKey;
  sectionRef: RefObject<HTMLElement | null>;
  status: string;
  step: number;
  title: string;
  tone: WorkspaceSectionTone;
}) {
  const headingId = `evaluation-workspace-${section}-heading`;
  return (
    <section
      ref={sectionRef}
      id={`evaluation-workspace-${section}`}
      tabIndex={-1}
      aria-label={ariaLabel}
      aria-current={current ? 'step' : undefined}
      aria-labelledby={ariaLabel ? undefined : headingId}
      className={cn(
        'scroll-mt-5 overflow-hidden rounded-xl border bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        current && 'border-cyan-500/45 ring-1 ring-cyan-500/25',
      )}
    >
      <div className='flex items-start gap-3 p-4'>
        <span className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold',
          tone === 'ready' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
          tone === 'active' && 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
          tone === 'waiting' && 'border-border bg-muted/50 text-muted-foreground',
          tone === 'failed' && 'border-destructive/40 bg-destructive/10 text-destructive',
          tone === 'stale' && 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        )}>{step}</span>
        <div className='min-w-0 flex-1'>
          <h3 id={headingId} className='font-semibold'>{title}</h3>
          <p className='mt-1 text-xs text-muted-foreground'>{description}</p>
        </div>
        <Badge variant='outline' className={cn(
          tone === 'ready' && 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
          tone === 'active' && 'border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
          tone === 'failed' && 'border-destructive/35 bg-destructive/10 text-destructive',
          tone === 'stale' && 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300',
          tone === 'waiting' && 'text-muted-foreground',
        )}>{status}</Badge>
      </div>
      <div className='space-y-5 border-t p-4'>{children}</div>
      {action ? <div className='border-t p-4'>{action}</div> : null}
    </section>
  );
}

function lifecycleTones(row: WorkspaceRow) {
  return {
    revision: 'done' as const,
    dataset: row.selectedDataset ? (row.publishedRevision ? 'done' as const : 'active' as const) : 'waiting' as const,
    run: row.stage === 'RUNNING' ? 'active' as const : row.stage === 'FAILED' ? 'failed' as const : row.latestRun ? 'done' as const : 'waiting' as const,
    result: row.stage === 'NEEDS_RE_EVALUATION'
      ? 'stale' as const
      : row.decisionStatus === 'REJECTED' || row.decisionRecommendation === 'REJECTED'
        ? 'failed' as const
        : row.stage === 'COMPLETED'
          ? 'done' as const
          : row.stage === 'FAILED'
            ? 'failed' as const
            : 'waiting' as const,
  };
}

function CatalogCard({ row, onOpen }: { row: WorkspaceRow; onOpen(row: WorkspaceRow): void }) {
  return (
    <Card
      role='button'
      tabIndex={0}
      className='h-full cursor-pointer transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      onClick={() => onOpen(row)}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(row);
        }
      }}
    >
      <CardHeader>
        <div className='flex min-w-0 items-start gap-3'>
          <KindMark kind={row.target.kind} />
          <div className='min-w-0 flex-1'>
            <CardDescription>{KIND_META[row.target.kind].label} · {row.target.id}</CardDescription>
            <CardTitle className='mt-1 truncate text-base'>{row.target.name}</CardTitle>
            <p className='mt-1 truncate text-xs text-muted-foreground'>R{row.currentRevision?.revision ?? '—'} · {configurationSummary(row)}</p>
          </div>
          <StageBadge stage={row.stage} />
        </div>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-4'>
        <p className='line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground'>{row.target.description}</p>
        <div className='rounded-md border bg-muted/20 p-3'>
          <p className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>Evaluation</p>
          <p className='mt-1 font-medium'>{decisionStatusLabel(row) ?? row.result}</p>
          {row.stage === 'RUNNING' ? <Progress className='mt-3' value={row.progress} /> : null}
          <p className={cn('mt-1 text-xs', row.risk.kind === 'FINDINGS' ? 'font-medium text-destructive' : 'text-muted-foreground')}>{resultActionLabel(row)}</p>
        </div>
        <div className='grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border'>
          <div className='min-w-0 bg-card p-3'>
            <p className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>Dataset</p>
            <p className='mt-1 truncate text-xs font-medium'>{datasetSummary(row)}</p>
          </div>
          <div className='min-w-0 bg-card p-3'>
            <p className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>Updated</p>
            <p className='mt-1 text-xs font-medium'>{formatRelativeTime(row.updatedAt)}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className='justify-between gap-3'>
        <span className='text-xs text-muted-foreground'>{row.latestReport ? `Report ${row.latestReport.status}` : 'No report yet'}</span>
        <Button size='sm' variant='ghost' onClick={(event) => { event.stopPropagation(); onOpen(row); }}>View details<ArrowRight /></Button>
      </CardFooter>
    </Card>
  );
}

export function CatalogList({
  rows,
  kind,
  onKindChange,
  onOpen,
}: {
  rows: WorkspaceRow[];
  kind: KindFilter;
  onKindChange(kind: KindFilter): void;
  onOpen(row: WorkspaceRow): void;
}) {
  return (
    <EvaluationTable>
      <thead><tr><th>Evaluation target</th><th><select aria-label='Type' className='h-8 min-w-28 rounded-md border bg-background px-2 text-xs font-medium text-foreground' value={kind} onChange={(event) => onKindChange(event.target.value as KindFilter)}><option value='all'>All types</option>{Object.entries(KIND_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></th><th>Revision</th><th>Dataset</th><th>Evaluation</th><th>Latest result</th><th>Updated</th><th /></tr></thead>
      <tbody>{rows.map((row) => (
        <tr
          key={row.target.id}
          role='button'
          tabIndex={0}
          className='cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
          onClick={() => onOpen(row)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpen(row);
            }
          }}
        >
          <td><div className='flex min-w-56 items-center gap-3'><KindMark kind={row.target.kind} /><div className='min-w-0'><p className='truncate font-medium text-foreground'>{row.target.name}</p><p className='truncate text-xs text-muted-foreground'>{row.target.id}</p></div></div></td>
          <td>{KIND_META[row.target.kind].label}</td>
          <td>R{row.currentRevision?.revision ?? '—'}</td>
          <td>{datasetCountSummary(row)}</td>
          <td><div className='grid min-w-36 gap-1.5'><StageBadge stage={row.stage} />{row.stage === 'RUNNING' ? <Progress value={row.progress} /> : null}</div></td>
          <td className={row.risk.kind === 'FINDINGS' ? 'font-medium text-destructive' : ''}>{compactResult(row)}</td>
          <td>{formatRelativeTime(row.updatedAt)}</td>
          <td><Button size='sm' variant='outline' onClick={(event) => { event.stopPropagation(); onOpen(row); }}>View<ArrowRight /></Button></td>
        </tr>
      ))}</tbody>
    </EvaluationTable>
  );
}

function LifecycleList({ rows, onOpen }: { rows: WorkspaceRow[]; onOpen(row: WorkspaceRow): void }) {
  return (
    <div className='space-y-3'>
      {rows.map((row) => {
        const tones = lifecycleTones(row);
        return (
          <button key={row.target.id} type='button' onClick={() => onOpen(row)} className='grid w-full gap-5 rounded-lg border border-border/65 bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/35 hover:bg-muted/15 lg:grid-cols-[minmax(13rem,1fr)_minmax(36rem,3fr)_auto] lg:items-center'>
            <div className='flex min-w-0 items-start gap-3'>
              <KindMark kind={row.target.kind} />
              <div className='min-w-0'><p className='truncate font-medium'>{row.target.name}</p><p className='mt-0.5 text-xs text-muted-foreground'>{KIND_META[row.target.kind].label} · {row.target.id}</p><p className='mt-1 truncate text-xs text-muted-foreground'>{configurationSummary(row)}</p></div>
            </div>
            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
              <LifecycleNode label='Revision' value={`R${row.currentRevision?.revision ?? '—'}`} detail='Evaluation target' tone={tones.revision} />
              <LifecycleNode label='Dataset' value={row.selectedDataset?.name ?? 'Not created'} detail={datasetLifecycleDetail(row)} tone={tones.dataset} />
              <LifecycleNode label='Evaluation' value={row.latestRun ? STAGE_META[row.stage].label : 'Not started'} detail={row.latestRun ? `${row.progress}% complete` : 'Waiting for Dataset'} tone={tones.run} />
              <LifecycleNode label='Result' value={decisionStatusLabel(row) ?? row.result} detail={resultActionLabel(row)} tone={tones.result} />
            </div>
            <ArrowRight className='hidden size-5 text-muted-foreground lg:block' />
          </button>
        );
      })}
    </div>
  );
}

function WorkspaceDrawer({
  row,
  open,
  onOpenChange,
  onCreateDataset,
}: {
  row: WorkspaceRow | undefined;
  open: boolean;
  onOpenChange(open: boolean): void;
  onCreateDataset(): void;
}) {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  const projectId = useCurrentProjectId();
  const role = useEffectiveProjectRole();
  const [workspaceNotice, setWorkspaceNotice] = useState<{
    message: string;
    section: WorkspaceSectionKey;
  }>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedGuardrailTemplateIds, setSelectedGuardrailTemplateIds] = useState<string[]>([]);
  const agentSectionRef = useRef<HTMLElement>(null);
  const datasetSectionRef = useRef<HTMLElement>(null);
  const runSectionRef = useRef<HTMLElement>(null);
  const resultSectionRef = useRef<HTMLElement>(null);
  const previousWorkspaceRef = useRef<{
    stage: WorkspaceStage | undefined;
    targetId: string | undefined;
  }>({ stage: undefined, targetId: undefined });
  const focusSection = useCallback((section: WorkspaceSectionKey) => {
    const node = {
      agent: agentSectionRef.current,
      dataset: datasetSectionRef.current,
      result: resultSectionRef.current,
      run: runSectionRef.current,
    }[section];
    if (!node) return;
    if (typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    node.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (open) {
      setWorkspaceNotice(undefined);
      setDetailsOpen(false);
      previousWorkspaceRef.current = {
        stage: row?.stage,
        targetId: row?.target.id,
      };
    }
  }, [open, row?.target.id]);
  useEffect(() => {
    if (!open || !row) return;
    setSelectedGuardrailTemplateIds(guardrailTemplateIdsForTarget(
      state.guardrailTemplates,
      row.target.kind,
      row.latestRun?.guardrailTemplateIds,
    ));
  }, [open, row?.latestRun?.id, row?.target.id, row?.target.kind, state.guardrailTemplates]);
  useEffect(() => {
    if (!open || !row) return;
    const previous = previousWorkspaceRef.current;
    if (previous.targetId === row.target.id && previous.stage === 'RUNNING') {
      if (row.stage === 'COMPLETED') {
        setDetailsOpen(false);
        focusSection('result');
      }
      if (row.stage === 'FAILED') focusSection('run');
    }
    previousWorkspaceRef.current = {
      stage: row.stage,
      targetId: row.target.id,
    };
  }, [focusSection, open, row?.stage, row?.target.id]);
  if (!row) return null;

  const targetDatasets = state.datasets.filter((dataset) => dataset.targetId === row.target.id);
  const selectedGuardrailTemplates = state.guardrailTemplates.filter((template) => selectedGuardrailTemplateIds.includes(template.id));
  const selectedGuardrailCaseCount = selectedGuardrailTemplates.reduce((sum, template) => sum + template.cases.length, 0);
  const nextStep = workspaceNextStep(row);
  const guardrailEvaluationRestricted = row.target.kind === 'guardrail' && role !== 'admin';
  const startEvaluation = () => {
    if (guardrailEvaluationRestricted) {
      setWorkspaceNotice({
        message: 'Guardrail evaluation is restricted to the Admin role.',
        section: 'run',
      });
      focusSection('run');
      return;
    }
    if (!row.currentRevision) {
      setWorkspaceNotice({
        message: 'Create a Target revision before starting an Evaluation.',
        section: 'agent',
      });
      focusSection('agent');
      return;
    }
    if (!row.publishedRevision) {
      setWorkspaceNotice({
        message: 'Publish the selected Test Cases before starting an Evaluation.',
        section: 'dataset',
      });
      focusSection('dataset');
      return;
    }
    if (!selectedGuardrailTemplateIds.length) {
      setWorkspaceNotice({
        message: 'Select at least one Guardrail test pack before starting the Evaluation.',
        section: 'dataset',
      });
      focusSection('dataset');
      return;
    }
    const evaluatorIds = state.evaluators.filter((evaluator) => evaluator.enabled).map((evaluator) => evaluator.id);
    const result = store.createRun({
      targetRevisionId: row.currentRevision.id,
      datasetRevisionId: row.publishedRevision.id,
      evaluatorIds,
      guardrailTemplateIds: selectedGuardrailTemplateIds,
    });
    if (!result.ok) {
      setWorkspaceNotice({ message: result.error, section: 'run' });
      focusSection('run');
      return;
    }
    setWorkspaceNotice(undefined);
    focusSection('run');
  };
  const decideRevision = (status: 'APPROVED' | 'REJECTED') => {
    if (role !== 'admin' || !row.latestReport || row.decisionStatus !== 'PENDING') {
      setWorkspaceNotice({
        message: 'Only an Admin can decide a pending evaluation result.',
        section: 'result',
      });
      focusSection('result');
      return;
    }
    const result = store.decideRevision(row.latestReport.id, status, {
      name: 'Local Administrator',
      role,
    });
    if (!result.ok) {
      setWorkspaceNotice({ message: result.error, section: 'result' });
      focusSection('result');
      return;
    }
    setWorkspaceNotice(undefined);
    focusSection('result');
  };
  const reviewRejectedTarget = () => {
    setDetailsOpen(false);
    focusSection('agent');
  };

  const datasetTone: WorkspaceSectionTone = row.publishedRevision && selectedGuardrailTemplateIds.length
    ? 'ready'
    : row.draftRevision
      ? 'active'
      : 'waiting';
  const evaluationTone: WorkspaceSectionTone = row.stage === 'FAILED'
    ? 'failed'
    : row.stage === 'RUNNING'
      ? 'active'
      : row.stage === 'NEEDS_RE_EVALUATION'
        ? 'stale'
        : row.stage === 'COMPLETED'
          ? 'ready'
          : 'waiting';
  const resultTone: WorkspaceSectionTone = row.stage === 'NEEDS_RE_EVALUATION'
    ? 'stale'
    : row.decisionStatus === 'REJECTED' || row.decisionRecommendation === 'REJECTED'
      ? 'failed'
      : row.decisionStatus === 'APPROVED' || row.latestReport
        ? 'ready'
        : 'waiting';
  const footerStep: WorkspaceNextStep = (() => {
    if (!row.currentRevision) {
      return {
        tab: 'agent',
        label: `Review ${KIND_META[row.target.kind].label} revision`,
        description: 'A current revision is required before an evaluation can run.',
      };
    }
    if (!row.publishedRevision || row.stage === 'RUNNING') return nextStep;
    if (row.decisionStatus === 'PENDING' && role !== 'admin') {
      return {
        tab: 'result',
        label: 'Awaiting Admin decision',
        description: row.decisionRecommendation === 'APPROVED'
          ? 'The evaluation passed and is waiting for Admin approval.'
          : 'The evaluation failed or contains findings and is waiting for Admin rejection.',
      };
    }
    if (row.decisionStatus === 'REJECTED') {
      return row.target.kind === 'guardrail'
        ? {
            tab: 'agent',
            label: 'Update rejected Guardrail at source',
            description: 'Open Guardrails to update the managed source, then run this evaluation again.',
          }
        : role === 'member'
          ? nextStep
          : {
              tab: 'agent',
              label: 'Waiting for Developer changes',
              description: 'A Developer must update the rejected Target revision before it can be evaluated again.',
            };
    }
    if (guardrailEvaluationRestricted && row.stage === 'NEEDS_RE_EVALUATION') {
      return {
        tab: 'result',
        label: 'Review outdated result',
        description: 'The current result remains available, but an Admin must run the updated configuration.',
      };
    }
    if (guardrailEvaluationRestricted && row.latestReport) {
      return {
        tab: 'result',
        label: 'Review results',
        description: 'This Guardrail evaluation is available in read-only mode.',
      };
    }
    if (guardrailEvaluationRestricted && row.latestRun) {
      return {
        tab: 'run',
        label: 'Review evaluation',
        description: 'This Guardrail evaluation is available in read-only mode.',
      };
    }
    if (guardrailEvaluationRestricted) {
      return {
        tab: 'run',
        label: 'Admin approval required',
        description: 'Only an Admin can start or rerun a Guardrail evaluation.',
      };
    }
    if (!selectedGuardrailTemplateIds.length && (!row.latestRun || row.stage === 'FAILED' || row.stage === 'NEEDS_RE_EVALUATION')) {
      return {
        tab: 'dataset',
        label: 'Select Guardrail test packs',
        description: 'At least one safety test pack is required for every evaluation.',
      };
    }
    return nextStep;
  })();

  let footerAction: ReactNode;
  if (!row.currentRevision) {
    footerAction = <Button onClick={() => focusSection('agent')}><Bot />Review revision</Button>;
  } else if (!row.publishedRevision) {
    footerAction = <Button onClick={() => focusSection('dataset')}><Database />Prepare Test Cases</Button>;
  } else if (row.stage === 'RUNNING') {
    footerAction = undefined;
  } else if (row.stage === 'NEEDS_RE_EVALUATION' && guardrailEvaluationRestricted) {
    footerAction = <Button onClick={() => { setDetailsOpen(true); focusSection('result'); }}>View outdated result<ArrowRight /></Button>;
  } else if (row.stage === 'NEEDS_RE_EVALUATION') {
    footerAction = <Button disabled={!selectedGuardrailTemplateIds.length} onClick={startEvaluation}><Play />Run evaluation again</Button>;
  } else if (row.decisionStatus === 'PENDING' && role === 'admin') {
    const approve = row.decisionRecommendation === 'APPROVED';
    footerAction = (
      <Button
        variant={approve ? 'default' : 'destructive'}
        onClick={() => decideRevision(approve ? 'APPROVED' : 'REJECTED')}
      >
        {approve ? <Check /> : <XCircle />}
        {approve ? 'Approve' : 'Reject'}
      </Button>
    );
  } else if (row.decisionStatus === 'REJECTED') {
    footerAction = row.target.kind === 'guardrail'
      ? role === 'admin'
        ? <Button asChild><Link to='/$projectId/guardrails' params={{ projectId }}><Wrench />Open Guardrail source</Link></Button>
        : undefined
      : role === 'member'
        ? <Button onClick={reviewRejectedTarget}><Wrench />Update target revision</Button>
        : undefined;
  } else if (row.decisionStatus === 'PENDING') {
    footerAction = <Button onClick={() => { setDetailsOpen(true); focusSection('result'); }}>View results<ArrowRight /></Button>;
  } else if (guardrailEvaluationRestricted && row.latestReport) {
    footerAction = <Button onClick={() => { setDetailsOpen(true); focusSection('result'); }}>View results<ArrowRight /></Button>;
  } else if (guardrailEvaluationRestricted && row.latestRun) {
    footerAction = <Button onClick={() => focusSection('run')}>View evaluation<ArrowRight /></Button>;
  } else if (guardrailEvaluationRestricted) {
    footerAction = <Button disabled variant='outline'><ShieldAlert />Admin only</Button>;
  } else if (row.stage === 'FAILED') {
    footerAction = <Button disabled={!selectedGuardrailTemplateIds.length} onClick={startEvaluation}><Play />Retry evaluation</Button>;
  } else if (row.stage === 'COMPLETED' && row.latestReport) {
    footerAction = <Button onClick={() => { setDetailsOpen(true); focusSection('result'); }}>View results<ArrowRight /></Button>;
  } else if (row.latestRun) {
    footerAction = <Button onClick={() => focusSection('run')}>View evaluation<ArrowRight /></Button>;
  } else {
    footerAction = <Button disabled={!selectedGuardrailTemplateIds.length} onClick={startEvaluation}><Play />Run evaluation</Button>;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className='gap-0 sm:max-w-none'
        style={{ width: 'min(96vw, 56rem)', maxWidth: '56rem' }}
      >
        <SheetHeader className='border-b p-5 pr-16'>
          <div className='flex items-start gap-3'>
            <KindMark kind={row.target.kind} size='large' />
            <div className='min-w-0 flex-1'>
              <SheetDescription>{KIND_META[row.target.kind].label} · {row.target.id}</SheetDescription>
              <SheetTitle className='mt-1 truncate text-xl'>{row.target.name}</SheetTitle>
            </div>
            <div className='flex items-center gap-2'>
              <Button
                aria-controls='evaluation-workspace-details'
                aria-expanded={detailsOpen}
                size='sm'
                variant='outline'
                onClick={() => setDetailsOpen((current) => !current)}
              >
                {detailsOpen ? 'Hide details' : 'Details'}
              </Button>
              <StageBadge stage={row.stage} />
            </div>
          </div>
        </SheetHeader>
        <div className='min-h-0 flex-1 space-y-5 overflow-y-auto p-5'>
          <section className='rounded-xl border bg-muted/15 p-4'>
            <div role='group' aria-label='Evaluation workflow' className='grid grid-cols-3 gap-3'>
              <LifecycleNode label='Test coverage' value={datasetCountSummary(row)} detail={`${selectedGuardrailTemplateIds.length} Guardrail packs`} tone={lifecycleTones(row).dataset} recommended={visibleWorkflowStage(footerStep.tab) === 'coverage'} onClick={() => setDetailsOpen(true)} />
              <LifecycleNode label='Evaluation' value={row.latestRun ? STAGE_META[row.stage].label : 'Not started'} detail={row.latestRun ? `${row.progress}% complete` : 'Waiting for Dataset'} tone={lifecycleTones(row).run} recommended={visibleWorkflowStage(footerStep.tab) === 'evaluation'} onClick={() => setDetailsOpen(true)} />
              <LifecycleNode label='Result' value={decisionStatusLabel(row) ?? row.result} detail={resultActionLabel(row)} tone={lifecycleTones(row).result} recommended={visibleWorkflowStage(footerStep.tab) === 'result'} onClick={() => setDetailsOpen(true)} />
            </div>
          </section>

          <div id={detailsOpen ? 'evaluation-workspace-details' : undefined} className='space-y-5'>
          {detailsOpen || footerStep.tab === 'agent' ? <WorkspaceSection
            action={!detailsOpen && footerStep.tab === 'agent' ? <WorkspaceActionBar step={footerStep} action={footerAction} /> : undefined}
            ariaLabel={detailsOpen ? 'Target details' : 'Current step: Test coverage'}
            section='agent'
            sectionRef={agentSectionRef}
            step={1}
            title={`${KIND_META[row.target.kind].label} & revision`}
            description={`R${row.currentRevision?.revision ?? '—'} · ${configurationSummary(row)}`}
            status={row.currentRevision ? 'Ready' : 'Required'}
            tone={row.currentRevision ? 'ready' : 'failed'}
            current={!detailsOpen && footerStep.tab === 'agent'}
          >
            {workspaceNotice?.section === 'agent' ? <p role='alert' className='rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200'>{workspaceNotice.message}</p> : null}
            <EvaluationTargetDetail targetId={row.target.id} embedded showEvaluateAction={false} onEvaluate={() => focusSection('run')} />
          </WorkspaceSection> : null}

          {detailsOpen || footerStep.tab === 'dataset' ? <WorkspaceSection
            ariaLabel={detailsOpen ? 'Test coverage details' : 'Current step: Test coverage'}
            section='dataset'
            sectionRef={datasetSectionRef}
            step={2}
            title='Test coverage'
            description={row.selectedDataset ? `${row.selectedDataset.name} · ${datasetLifecycleDetail(row)} · ${selectedGuardrailTemplateIds.length} Guardrail packs` : 'Choose a Business Dataset and Guardrail safety tests.'}
            status={row.publishedRevision && selectedGuardrailTemplateIds.length ? `${detailsOpen ? `Published R${row.publishedRevision.revision}` : 'Published'} · ${selectedGuardrailTemplateIds.length} packs` : row.draftRevision ? 'Draft' : 'Required'}
            tone={datasetTone}
            current={!detailsOpen && footerStep.tab === 'dataset'}
          >
            {workspaceNotice?.section === 'dataset' ? <p role='alert' className='rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200'>{workspaceNotice.message}</p> : null}
            {detailsOpen ? <div><p className='text-sm font-semibold'>Business Dataset</p><p className='mt-1 text-xs text-muted-foreground'>Your representative functional and business scenarios.</p></div> : null}
            {targetDatasets.length ? <div className='rounded-lg border bg-muted/10 p-3'><label className='grid min-w-64 flex-1 gap-2 text-xs font-medium text-muted-foreground'>Dataset<select className='h-10 rounded-md border bg-background px-3 text-sm text-foreground' value={row.selectedDataset?.id ?? ''} onChange={(event) => store.selectActiveDataset(event.target.value)}>{targetDatasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}</select></label></div> : null}
            {row.selectedDataset ? <EvaluationDatasetDetail key={row.selectedDataset.id} datasetId={row.selectedDataset.id} compact={!detailsOpen} embedded showEvaluateAction={false} showDetailsToggle={detailsOpen} onCreateDataset={onCreateDataset} onEvaluate={() => focusSection('run')} /> : <div className='space-y-4'><p className='rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>Create a Dataset before generating Test Cases.</p><Button variant='outline' onClick={onCreateDataset}><Plus />Create Dataset</Button></div>}
            {detailsOpen || !selectedGuardrailTemplateIds.length ? <GuardrailTemplatePicker targetKind={row.target.kind} selectedIds={selectedGuardrailTemplateIds} onSelectedIdsChange={setSelectedGuardrailTemplateIds} disabled={guardrailEvaluationRestricted} /> : null}
            {detailsOpen ? <p className='text-xs text-muted-foreground'>Combined coverage: {row.publishedRevision?.cases.length ?? 0} business cases + {selectedGuardrailCaseCount} Guardrail cases.</p> : null}
          </WorkspaceSection> : null}

          {detailsOpen || footerStep.tab === 'run' ? <WorkspaceSection
            action={!detailsOpen && footerStep.tab === 'run' ? <WorkspaceActionBar step={footerStep} progress={row.stage === 'RUNNING' ? row.progress : undefined} action={row.stage === 'RUNNING' ? undefined : footerAction} /> : undefined}
            ariaLabel={detailsOpen ? 'Evaluation details' : 'Current step: Evaluation'}
            section='run'
            sectionRef={runSectionRef}
            step={3}
            title='Evaluation'
            description={row.latestRun ? `${row.result} · ${row.progress}% complete` : 'Run the Business Dataset and selected Guardrail test packs against this revision.'}
            status={STAGE_META[row.stage].label}
            tone={evaluationTone}
            current={!detailsOpen && footerStep.tab === 'run'}
          >
            {workspaceNotice?.section === 'run' ? <p role='alert' className='rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200'>{workspaceNotice.message}</p> : null}
            {row.isStale ? <div className='rounded-md border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200'><strong>Re-evaluation required.</strong> The latest completed run is pinned to an older Target or published Dataset revision.</div> : null}
            {detailsOpen && row.latestRun ? <EvaluationRunDetail key={row.latestRun.id} runId={row.latestRun.id} embedded /> : row.latestRun ? <div className='rounded-lg border bg-muted/20 p-4 text-sm'><p className='font-semibold'>{row.stage === 'RUNNING' ? 'Evaluation in progress' : row.result}</p><p className='mt-1 text-muted-foreground'>{row.stage === 'RUNNING' ? `${row.progress}% complete. Details contain logs and per-case progress.` : 'Open Details for logs, traces, and per-case results.'}</p></div> : <p className='rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>No Evaluation has been started for this Dataset.</p>}
            {guardrailEvaluationRestricted ? <div className='rounded-lg border border-amber-500/35 bg-amber-500/10 p-4'><div className='flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200'><ShieldAlert className='size-4' />Admin only</div><p className='mt-1 text-sm text-muted-foreground'>Guardrail evaluation can only be started or rerun by the Admin role. Existing runs and results remain visible for audit.</p></div> : null}
            {!guardrailEvaluationRestricted && !row.publishedRevision ? <p className='rounded-lg border border-dashed p-4 text-sm text-muted-foreground'>Publish the selected Test Cases to enable evaluation.</p> : null}
            {row.stage === 'FAILED' ? <div className='space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4'><div className='flex items-center gap-2 font-medium text-destructive'><ShieldAlert className='size-4' />Recovery actions</div><div className='grid gap-2 sm:grid-cols-2'><Button variant='outline' className='justify-start' onClick={() => focusSection('agent')}><Bot />Check {KIND_META[row.target.kind].label} config</Button><Button variant='outline' className='justify-start' onClick={() => focusSection('dataset')}><Database />Check Test Cases</Button></div></div> : null}
          </WorkspaceSection> : null}

          {detailsOpen || footerStep.tab === 'result' ? <WorkspaceSection
            action={!detailsOpen && footerStep.tab === 'result' ? <WorkspaceActionBar step={footerStep} action={footerAction} /> : undefined}
            ariaLabel={detailsOpen ? 'Result details' : 'Current step: Result'}
            section='result'
            sectionRef={resultSectionRef}
            step={4}
            title='Result'
            description={row.latestReport ? row.latestReport.summary : 'Results appear here when the evaluation completes.'}
            status={decisionStatusLabel(row) ?? (row.latestReport ? row.result : row.stage === 'FAILED' ? 'Failed' : 'Waiting')}
            tone={resultTone}
            current={!detailsOpen && footerStep.tab === 'result'}
          >
            {workspaceNotice?.section === 'result' ? <p role='alert' className='rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200'>{workspaceNotice.message}</p> : null}
            <div className='rounded-lg border bg-muted/20 p-4'>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div><p className='text-xs font-medium text-muted-foreground'>Summary</p><p className='mt-1 text-sm'>{row.latestReport?.summary ?? 'No report available.'}</p></div>
                <div><p className='text-xs font-medium text-muted-foreground'>Reason</p><p className='mt-1 text-sm'>{reportReason(row)}</p></div>
              </div>
            </div>
            {row.decisionStatus ? (
              <div
                role='status'
                aria-live='polite'
                className={cn(
                  'rounded-lg border p-4',
                  row.decisionStatus === 'APPROVED' && 'border-emerald-500/35 bg-emerald-500/10',
                  (row.decisionStatus === 'REJECTED' || row.decisionRecommendation === 'REJECTED') && 'border-destructive/35 bg-destructive/5',
                  row.decisionStatus === 'PENDING' && row.decisionRecommendation === 'APPROVED' && 'border-amber-500/35 bg-amber-500/10',
                )}
              >
                <div className='flex items-center gap-2 font-semibold'>
                  {row.decisionStatus === 'APPROVED' ? <ShieldCheck className='size-4 text-emerald-600' /> : row.decisionStatus === 'REJECTED' || row.decisionRecommendation === 'REJECTED' ? <XCircle className='size-4 text-destructive' /> : <Circle className='size-4 text-amber-600' />}
                  {decisionStatusLabel(row)}
                </div>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {row.decisionStatus === 'APPROVED'
                    ? `Approved by ${row.decision?.actor ?? 'Admin'}. This evaluated revision is ready to use.`
                    : row.decisionStatus === 'REJECTED'
                      ? 'Developer changes required. Update the Target revision, then run the evaluation again.'
                      : row.decisionRecommendation === 'APPROVED'
                        ? 'All Test Cases passed. An Admin must approve this evaluated revision.'
                        : 'The evaluation failed or contains findings. An Admin must reject it before a Developer updates the Target.'}
                </p>
              </div>
            ) : null}
            {row.latestReport && detailsOpen ? <EvaluationReportDetail key={row.latestReport.id} reportId={row.latestReport.id} embedded decisionMode='hidden' /> : null}
          </WorkspaceSection> : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type UnifiedWorkspaceTab = 'agent' | 'dataset' | 'evaluation';
type EvaluationWorkspaceView = 'setup' | 'history' | 'execution';

function UnifiedWorkspace({
  row,
  onBack,
  onCreateDataset,
}: {
  row: WorkspaceRow;
  onBack(): void;
  onCreateDataset(): void;
}) {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  const [tab, setTab] = useState<UnifiedWorkspaceTab>('agent');
  const [evaluationView, setEvaluationView] = useState<EvaluationWorkspaceView>(
    row.latestRun ? 'execution' : 'setup',
  );
  const runs = useMemo(
    () => state.runs
      .filter((run) => run.targetId === row.target.id && run.datasetId === row.selectedDataset?.id && !isLiveMonitoringRun(run.id))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt)),
    [row.selectedDataset?.id, row.target.id, state.runs],
  );
  const [selectedRunId, setSelectedRunId] = useState(row.latestRun?.id ?? runs[0]?.id ?? '');

  useEffect(() => {
    if (!runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs[0]?.id ?? '');
    }
  }, [runs, selectedRunId]);

  const openEvaluationSetup = () => {
    setTab('evaluation');
    setEvaluationView('setup');
  };
  const openExecution = (runId: string) => {
    setSelectedRunId(runId);
    setTab('evaluation');
    setEvaluationView('execution');
  };

  return (
    <section className='space-y-5 max-sm:[&_[data-slot=button]]:min-h-11'>
      <PageHeader
        title={row.target.name}
        description={`${KIND_META[row.target.kind].label} · ${row.target.id}`}
        badge={<StageBadge stage={row.stage} />}
        actions={<Button variant='outline' onClick={onBack}><ArrowLeft />Back to catalog</Button>}
      />

      <Card>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 lg:grid-cols-[auto_1fr] lg:items-center'>
            <KindMark kind={row.target.kind} size='large' />
            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
              <div><p className='text-xs text-muted-foreground'>{KIND_META[row.target.kind].label} revision</p><p className='font-medium'>R{row.currentRevision?.revision ?? '—'}</p></div>
              <div><p className='text-xs text-muted-foreground'>Test Case</p><p className='truncate font-medium'>{row.selectedDataset?.name ?? 'Not created'}</p></div>
              <div><p className='text-xs text-muted-foreground'>Evaluation</p><p className='font-medium'>{row.latestRun?.status ?? 'Not started'}</p></div>
              <div><p className='text-xs text-muted-foreground'>Latest result</p><p className='font-medium'>{decisionStatusLabel(row) ?? row.result}</p><p className='text-xs text-muted-foreground'>{resultActionLabel(row)}</p></div>
            </div>
          </div>
          {row.isStale ? <div className='rounded-md border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200'><strong>Re-evaluation required.</strong> The active Target or published Test Case revision changed after the latest run.</div> : null}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(value) => setTab(value as UnifiedWorkspaceTab)}>
        <TabsList variant='line' className='sticky top-0 z-10 w-full justify-start bg-background py-1'>
          <TabsTrigger value='agent'>1. {KIND_META[row.target.kind].label}</TabsTrigger>
          <TabsTrigger value='dataset'>2. Test Case</TabsTrigger>
          <TabsTrigger value='evaluation'>3. Evaluation</TabsTrigger>
        </TabsList>

        <TabsContent value='agent' className='pt-5'>
          <EvaluationTargetDetail targetId={row.target.id} onEvaluate={openEvaluationSetup} />
        </TabsContent>

        <TabsContent value='dataset' className='space-y-5 pt-5'>
          <div className='flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-card p-4'>
            <label className='grid min-w-72 gap-2 text-xs font-medium text-muted-foreground'>
              Dataset
              <select
                className='h-10 rounded-md border bg-background px-3 text-sm text-foreground'
                value={row.selectedDataset?.id ?? ''}
                onChange={(event) => store.selectActiveDataset(event.target.value)}
              >
                {!row.selectedDataset ? <option value=''>No Dataset</option> : null}
                {state.datasets.filter((dataset) => dataset.targetId === row.target.id).map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
              </select>
            </label>
            <Button variant='outline' onClick={onCreateDataset}><Plus />Create Dataset</Button>
          </div>
          {row.selectedDataset
            ? <EvaluationDatasetDetail key={row.selectedDataset.id} datasetId={row.selectedDataset.id} onEvaluate={openEvaluationSetup} />
            : <div className='grid min-h-56 place-items-center rounded-lg border border-dashed p-8 text-center'><div><Database className='mx-auto size-8 text-muted-foreground' /><p className='mt-3 font-medium'>Create a Dataset to build Test Cases</p><Button className='mt-4' onClick={onCreateDataset}><Plus />Create Dataset</Button></div></div>}
        </TabsContent>

        <TabsContent value='evaluation' className='space-y-5 pt-5'>
          <div className='flex flex-wrap gap-2 rounded-lg border bg-card p-2'>
            <Button variant={evaluationView === 'setup' ? 'secondary' : 'ghost'} onClick={() => setEvaluationView('setup')}>Setup</Button>
            <Button variant={evaluationView === 'history' ? 'secondary' : 'ghost'} onClick={() => setEvaluationView('history')}>Run history <Badge variant='outline'>{runs.length}</Badge></Button>
            <Button variant={evaluationView === 'execution' ? 'secondary' : 'ghost'} disabled={!selectedRunId} onClick={() => setEvaluationView('execution')}>Execution</Button>
          </div>

          {evaluationView === 'setup' ? (
            <EvaluationRunSetup onRunCreated={openExecution} />
          ) : evaluationView === 'history' ? (
            runs.length ? <EvaluationTable>
              <thead><tr><th>Started</th><th>Target revision</th><th>Dataset revision</th><th>Status</th><th>Progress</th><th>Cost</th><th>Open</th></tr></thead>
              <tbody>{runs.map((run) => {
                const done = run.results.filter((result) => result.status !== 'PENDING');
                const traceIds = new Set(done.map((result) => result.traceId).filter(Boolean));
                const cost = state.traces.filter((trace) => traceIds.has(trace.id)).reduce((sum, trace) => sum + traceCost(trace), 0);
                const targetRevision = state.targetRevisions.find((revision) => revision.id === run.targetRevisionId);
                const datasetRevision = state.datasetRevisions.find((revision) => revision.id === run.datasetRevisionId);
                return <tr key={run.id}><td>{new Date(run.startedAt).toLocaleString()}</td><td>R{targetRevision?.revision ?? '—'}</td><td>R{datasetRevision?.revision ?? '—'}</td><td><EvaluationLayerStatusBadge status={run.status} /></td><td>{done.length}/{run.results.length}</td><td>{formatCost(cost)}</td><td><Button size='sm' variant='outline' onClick={() => openExecution(run.id)}>Open<ArrowRight /></Button></td></tr>;
              })}</tbody>
            </EvaluationTable> : <div className='rounded-lg border border-dashed p-8 text-center'><p className='font-medium'>No Evaluation runs for this Dataset</p><Button className='mt-4' onClick={() => setEvaluationView('setup')}><Play />Start evaluation</Button></div>
          ) : selectedRunId ? (
            <EvaluationRunDetail key={selectedRunId} runId={selectedRunId} />
          ) : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function EmptyCatalog({ filtered }: { filtered: boolean }) {
  return (
    <div className='grid min-h-52 place-items-center rounded-lg border border-dashed p-8 text-center'>
      <div><Search className='mx-auto size-7 text-muted-foreground' /><p className='mt-3 font-medium'>{filtered ? 'No evaluations match these filters' : 'No evaluation targets yet'}</p><p className='mt-1 text-sm text-muted-foreground'>{filtered ? 'Clear or change the filters to see more results.' : 'Targets created in connected sources appear here automatically.'}</p></div>
    </div>
  );
}

export function EvaluationCatalogPage() {
  const state = useEvaluationLayerState();
  const store = useEvaluationLayerStore();
  const rows = useMemo(() => workspaceRows(state), [state]);
  const [view, setView] = useState<CatalogView>('list');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [stage, setStage] = useState<StageFilter>('ALL');
  const [sort, setSort] = useState<CatalogSort>('updated');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [drawerTargetId, setDrawerTargetId] = useState('');
  const [datasetEditorOpen, setDatasetEditorOpen] = useState(false);

  const baseRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind !== 'all' && row.target.kind !== kind) return false;
      if (!needle) return true;
      return [row.target.name, row.target.id, row.target.description, KIND_META[row.target.kind].label, row.selectedDataset?.name, row.result, row.risk.label]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [kind, query, rows]);
  const stageCounts = useMemo(() => Object.fromEntries(STAGE_ORDER.map((value) => [value, value === 'ALL' ? baseRows.length : baseRows.filter((row) => row.stage === value).length])) as Record<StageFilter, number>, [baseRows]);
  const filteredRows = useMemo(() => {
    const next = stage === 'ALL' ? [...baseRows] : baseRows.filter((row) => row.stage === stage);
    return next.sort((left, right) => {
      if (sort === 'name') return left.target.name.localeCompare(right.target.name);
      if (sort === 'stage') return STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage) || left.target.name.localeCompare(right.target.name);
      return right.updatedAt.localeCompare(left.updatedAt) || left.target.name.localeCompare(right.target.name);
    });
  }, [baseRows, sort, stage]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const selected = rows.find((row) => row.target.id === selectedTargetId);
  const drawerRow = rows.find((row) => row.target.id === drawerTargetId);

  useEffect(() => setPage(1), [kind, pageSize, query, stage]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const activate = (row: WorkspaceRow) => {
    store.selectActiveTarget(row.target.id);
    if (row.selectedDataset) store.selectActiveDataset(row.selectedDataset.id);
  };
  const openWorkspace = (row: WorkspaceRow) => {
    activate(row);
    setDrawerTargetId('');
    setSelectedTargetId(row.target.id);
  };
  const openDrawer = (row: WorkspaceRow) => {
    activate(row);
    setDrawerTargetId(row.target.id);
  };

  if (selected) {
    return (
      <>
        <UnifiedWorkspace
          row={selected}
          onBack={() => setSelectedTargetId('')}
          onCreateDataset={() => {
            activate(selected);
            setDatasetEditorOpen(true);
          }}
        />
        <DatasetEditor open={datasetEditorOpen} onOpenChange={setDatasetEditorOpen} />
      </>
    );
  }

  return (
    <section className='space-y-5 max-sm:[&_[data-slot=button]]:min-h-11'>
      <PageHeader
        title='Evaluations'
      />

      <Card>
        <CardContent className='space-y-4'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center'>
            <label className='relative flex-1'>
              <Search className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input className='pl-9' value={query} onChange={(event) => setQuery(event.target.value)} placeholder='Search targets, Datasets, results, or IDs' />
            </label>
          </div>
          <div className='flex gap-1 overflow-x-auto border-y py-2'>
            {STAGE_ORDER.map((value) => <Button key={value} size='sm' variant={stage === value ? 'secondary' : 'ghost'} onClick={() => setStage(value)} className='shrink-0'>{value === 'ALL' ? 'All' : STAGE_META[value].label}<Badge variant='outline' className='ml-1'>{stageCounts[value]}</Badge></Button>)}
          </div>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            <label className='grid gap-1 text-xs text-muted-foreground'>Sort<select className='h-9 min-w-44 rounded-md border bg-background px-3 text-sm text-foreground' value={sort} onChange={(event) => setSort(event.target.value as CatalogSort)}><option value='updated'>Recently updated</option><option value='name'>Name</option><option value='stage'>Lifecycle stage</option></select></label>
            <div className='flex rounded-md border p-1'>
              <Button size='sm' variant={view === 'cards' ? 'secondary' : 'ghost'} onClick={() => setView('cards')}><LayoutGrid />Cards</Button>
              <Button size='sm' variant={view === 'list' ? 'secondary' : 'ghost'} onClick={() => setView('list')}><List />List</Button>
              <Button size='sm' variant={view === 'lifecycle' ? 'secondary' : 'ghost'} onClick={() => setView('lifecycle')}><Workflow />Lifecycle</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!visibleRows.length ? <EmptyCatalog filtered={Boolean(query || kind !== 'all' || stage !== 'ALL')} /> : view === 'cards' ? <div className='grid gap-4 md:grid-cols-2 2xl:grid-cols-3'>{visibleRows.map((row) => <CatalogCard key={row.target.id} row={row} onOpen={openDrawer} />)}</div> : view === 'list' ? <CatalogList rows={visibleRows} kind={kind} onKindChange={setKind} onOpen={openDrawer} /> : <LifecycleList rows={visibleRows} onOpen={openDrawer} />}

      {filteredRows.length > pageSize ? <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm'><span className='text-muted-foreground'>Page {page} of {pageCount}</span><div className='flex items-center gap-2'><label className='text-xs text-muted-foreground'>Rows <select className='ml-1 h-9 rounded-md border bg-background px-2 text-foreground' value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={6}>6</option><option value={12}>12</option><option value={24}>24</option></select></label><Button size='sm' variant='outline' disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button size='sm' variant='outline' disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div> : null}

      <WorkspaceDrawer
        row={drawerRow}
        open={Boolean(drawerRow)}
        onOpenChange={(open) => { if (!open) setDrawerTargetId(''); }}
        onCreateDataset={() => {
          if (!drawerRow) return;
          activate(drawerRow);
          setDatasetEditorOpen(true);
        }}
      />

      <DatasetEditor open={datasetEditorOpen} onOpenChange={setDatasetEditorOpen} />
    </section>
  );
}
