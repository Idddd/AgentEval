import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { UnifiedConfig, Source } from './evaluation';

export function UnifiedConfigForm({ config, sources, onChange, onSources, disabled = false }: {
  config: UnifiedConfig; sources: Source[]; onChange: (config: UnifiedConfig) => void;
  onSources: (sources: Source[]) => void; disabled?: boolean;
}) {
  const patch = (value: Partial<UnifiedConfig>) => onChange({ ...config, ...value });
  return <fieldset disabled={disabled} className="space-y-5">
    <label className="grid gap-2 text-sm font-medium">Scanner type
      <select className="h-10 rounded-md border bg-background px-3" value={config.scannerType} onChange={e => patch({ scannerType: e.target.value as UnifiedConfig['scannerType'] })}>
        <option value="custom">GenAI</option><option value="regex">Regex</option><option value="keyword">Keywords</option>
      </select>
    </label>
    <label className="grid gap-2 text-sm font-medium">{config.scannerType === 'custom' ? 'Detection description (GenAI)' : config.scannerType === 'regex' ? 'Regex pattern' : 'Keywords (one per line or comma separated)'}
      <Textarea className={config.scannerType === 'custom' ? 'min-h-72 resize-y p-3 font-normal leading-7 [field-sizing:fixed]' : 'min-h-24 resize-y'} value={config.content} maxLength={100000} onChange={e => patch({ content: e.target.value })} placeholder="Describe what should be detected…" />
      <span className="text-right text-xs font-normal text-muted-foreground">{config.content.length.toLocaleString()} / 100,000 characters</span>
    </label>
    <label className="grid gap-2 text-sm font-medium">Direction<select className="h-10 rounded-md border bg-background px-3" value={config.direction} onChange={e => patch({ direction: e.target.value as UnifiedConfig['direction'] })}><option value="both">Both</option><option value="request">Request</option><option value="response">Response</option></select></label>
    <label className="grid gap-2 text-sm font-medium">Version name<Input value={config.versionName} onChange={e => patch({ versionName: e.target.value })} /></label>
    <label className="grid gap-2 text-sm font-medium">Version description<Input value={config.versionDescription} onChange={e => patch({ versionDescription: e.target.value })} /></label>
    <fieldset className="border-t pt-4"><legend className="text-sm font-medium">Source · select at least one</legend><div className="flex gap-6 pt-2">{(['Guard', 'F5'] as const).map(source => <label key={source} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={sources.includes(source)} disabled={sources.length === 1 && sources.includes(source)} onChange={e => onSources(e.target.checked ? [...sources, source] : sources.filter(s => s !== source))} />{source === 'Guard' ? 'Nemo' : source}</label>)}</div></fieldset>
  </fieldset>;
}
