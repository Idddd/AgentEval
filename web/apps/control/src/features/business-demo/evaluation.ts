import { z } from 'zod';

export const unifiedConfigSchema = z.object({
  scannerType: z.enum(['custom', 'regex', 'keyword']),
  direction: z.enum(['request', 'response', 'both']),
  content: z.string().max(100000),
  versionName: z.string(),
  versionDescription: z.string(),
});
export type UnifiedConfig = z.infer<typeof unifiedConfigSchema>;
export const sourceSchema = z.enum(['Guard', 'F5']);
export type Source = z.infer<typeof sourceSchema>;
export const evaluationSchema = z.object({
  id: z.string(), revision: z.number(), startedAt: z.number(),
  results: z.array(z.object({
    source: sourceSchema, status: z.enum(['running', 'completed', 'error']),
    success: z.number(), fail: z.number(), responseTimeMs: z.number(),
    finishedAt: z.number(), details: z.array(z.string()),
  })),
});
export const emptyConfig = (): UnifiedConfig => ({ scannerType: 'custom', direction: 'both', content: '', versionName: 'v1', versionDescription: '' });
export function readUnified(configs: Record<string, string>, fallback = ''): UnifiedConfig {
  const raw = configs.F5 || configs.Guard || '';
  try {
    const value = JSON.parse(raw);
    const unified = unifiedConfigSchema.safeParse(value);
    if (unified.success) return unified.data;
    if (value.config) return { ...emptyConfig(), scannerType: value.config.type, content: value.config.input ?? value.config.pattern ?? value.config.words?.join('\n') ?? '', versionName: value.version?.name || 'v1', versionDescription: value.version?.description || '' };
    // Preserve source text as migration notes, not a second editable configuration.
    return { ...emptyConfig(), content: fallback || value.sources?.map((s: {content: string}) => s.content).join('\n\n') || raw };
  } catch { return { ...emptyConfig(), content: raw || fallback }; }
}
export function configError(config: UnifiedConfig): string | null {
  if (!config.content.trim()) return 'Enter detection content.';
  if (config.content.length > 100000) return 'Use at most 100,000 characters.';
  if (!config.versionName.trim()) return 'Enter a version name.';
  if (config.scannerType === 'regex') { try { new RegExp(config.content); } catch { return 'Enter a valid regular expression.'; } }
  return null;
}

// These adapters are deterministic demo simulators, not real rule compilation.
export function createEvaluation(id: string, revision: number, config: UnifiedConfig, sources: Source[], now: number) {
  return { id: `${id}:${revision}:${now}`, revision, startedAt: now, results: sources.map(source => {
    const seed = Array.from(JSON.stringify([id, revision, config, source])).reduce((hash, c) => (hash * 31 + c.charCodeAt(0)) >>> 0, 7);
    const fail = 0;
    const responseTimeMs = 180 + seed % 650;
    return { source, status: 'running' as const, success: 12 - fail, fail, responseTimeMs,
      finishedAt: now + (source === 'Guard' ? 1600 : 2400),
      details: [] as string[] };
  }) };
}
