import { scopeOptions, type Draft } from './model';

export type MandatorySettings = Pick<Draft, 'mandatory' | 'mandatoryLocations'>;
export function MandatoryFields({value,onChange,disabled=false}:{value:MandatorySettings;onChange?:(value:MandatorySettings)=>void;disabled?:boolean}) {
 if (!onChange) return value.mandatory ? <p className="text-xs text-amber-800"><span className="mr-2 rounded bg-amber-50 px-2 py-1 font-semibold">Mandatory</span>{value.mandatoryLocations?.join(', ') || 'All'} · Required for Profiles in these regions</p> : null;
 const regions=value.mandatoryLocations ?? [];
 return <fieldset disabled={disabled} className="space-y-3 rounded-md border bg-muted/20 p-4">
  <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-primary" checked={!!value.mandatory} onChange={e=>onChange({mandatory:e.target.checked,mandatoryLocations:e.target.checked ? regions.length ? regions : ['All'] : []})} />Mandatory</label>
  <p className="text-xs text-muted-foreground">Required Guardrail for all Profiles in the selected regions. Profiles cannot remove it.</p>
  {value.mandatory && <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Target regions</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{scopeOptions.location.map(region=><label key={region} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={regions.includes(region as never)} onChange={e=>{const next=region==='All' ? e.target.checked ? ['All'] : [] : e.target.checked ? [...regions.filter(r=>r!=='All'),region] : regions.filter(r=>r!==region);onChange({mandatory:true,mandatoryLocations:next as NonNullable<Draft['mandatoryLocations']>});}} />{region==='All'?'All regions':region}</label>)}</div></fieldset>}
 </fieldset>;
}
