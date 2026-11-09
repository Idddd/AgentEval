import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { UnifiedConfig, Source } from './evaluation';

export function UnifiedConfigForm({ config, onChange, disabled = false, hideDescription = false, hideVersionDescription = false, customFormat = 'prompt', contentError, customSample }: {
  config: UnifiedConfig; sources: Source[]; onChange: (config: UnifiedConfig) => void;
  onSources: (sources: Source[]) => void; disabled?: boolean; hideDescription?: boolean; hideVersionDescription?: boolean;
  customFormat?: 'prompt' | 'nemo-policy'; contentError?: string | null; customSample?: string;
}) {
  const patch = (value: Partial<UnifiedConfig>) => onChange({ ...config, ...value });
  const policyJson = customFormat === 'nemo-policy' && config.scannerType === 'custom';
  const showSample = policyJson && !!customSample && !hideDescription;
  const canInsertSample = showSample && !disabled && !config.content.trim();
  return <fieldset disabled={disabled} className="space-y-5">
    <label className="grid gap-2 text-sm font-medium">Scanner type
      <select className="h-10 rounded-md border bg-background px-3" value={config.scannerType} onChange={e => patch({ scannerType: e.target.value as UnifiedConfig['scannerType'] })}>
        <option value="custom">{customFormat === 'nemo-policy' ? 'Custom Policy (JSON)' : 'GenAI'}</option><option value="regex">Regex</option><option value="keyword">Keywords</option>
      </select>
    </label>
    {!(hideDescription && config.scannerType === 'custom') && <label className="grid gap-2 text-sm font-medium">{policyJson ? 'NeMo Policy JSON' : config.scannerType === 'custom' ? 'LLM prompt' : config.scannerType === 'regex' ? 'Regex pattern' : 'Keywords (one per line or comma separated)'}
      <Textarea aria-label={policyJson ? 'NeMo Policy JSON' : undefined} aria-keyshortcuts={canInsertSample ? 'Tab' : undefined} aria-invalid={!!contentError} className={policyJson ? `${config.content.trim() ? 'h-72' : 'h-36'} min-h-0 resize-y overflow-y-scroll p-3 font-mono text-sm font-normal text-black placeholder:text-gray-400 placeholder:opacity-100 [field-sizing:fixed] [scrollbar-gutter:stable]` : config.scannerType === 'custom' ? 'min-h-72 resize-y p-3 font-normal leading-7 [field-sizing:fixed]' : 'min-h-24 resize-y'} value={config.content} maxLength={100000} onChange={e => patch({ content: e.target.value })} onKeyDown={event => {
        if (canInsertSample && event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !event.nativeEvent.isComposing) { event.preventDefault(); patch({ content: customSample! }); }
      }} placeholder={policyJson ? customSample || 'Paste a complete executable NeMo Policy JSON definition…' : config.scannerType === 'custom' ? 'Enter the final detection prompt applied to scanned content…' : 'Enter detection content…'} />
      {config.scannerType === 'custom' && <span className="text-xs font-normal text-muted-foreground">{policyJson ? 'Use kind "Policy", schema_version 1, rules and tests. Rule stages in the JSON determine input/output direction. Acceptance tests are required before evaluation. Business intent alone is not executable.' : 'Final applied prompt. Used directly for detection, not to generate another prompt.'}</span>}
      <span className="text-right text-xs font-normal text-muted-foreground">{config.content.length.toLocaleString()} / 100,000 characters</span>
    </label>}
    {contentError && <p role="alert" className="text-sm text-destructive">{contentError}</p>}
    {!policyJson && <label className="grid gap-2 text-sm font-medium">Direction<select className="h-10 rounded-md border bg-background px-3" value={config.direction} onChange={e => patch({ direction: e.target.value as UnifiedConfig['direction'] })}><option value="both">Both</option><option value="request">Request</option><option value="response">Response</option></select></label>}
    <label className="grid gap-2 text-sm font-medium">Version name<Input value={config.versionName} onChange={e => patch({ versionName: e.target.value })} /></label>
    {!hideVersionDescription && <label className="grid gap-2 text-sm font-medium">Version description<Input value={config.versionDescription} onChange={e => patch({ versionDescription: e.target.value })} /></label>}
  </fieldset>;
}
