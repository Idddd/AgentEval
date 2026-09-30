import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { replaceLegacyExamples } from '../src/features/business-demo/default-demo';
import { enforceMandatory, type Entity } from '../src/features/business-demo/model';

// Explicit local maintenance command; never runs automatically on deployed data.
const origin='http://127.0.0.1:18082';
const response=await fetch(`${origin}/api/demo-state`);
if(!response.ok)throw new Error(`Cannot read local demo: ${response.status}`);
const before=await response.json() as {revision:number;items:Entity[]};
const directory=resolve('../../../.artifacts/guard-local');mkdirSync(directory,{recursive:true});
const backup=join(directory,`before-default-cases-${Date.now()}.json`);
writeFileSync(backup,JSON.stringify(before,null,2),{flag:'wx'});
const items=enforceMandatory(replaceLegacyExamples(before.items));
const saved=await fetch(`${origin}/api/demo-state`,{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({revision:before.revision,items})});
if(!saved.ok)throw new Error(`Local demo was not replaced: ${saved.status} ${await saved.text()}`);
console.log(JSON.stringify({backup,previousCount:before.items.length,currentCount:items.length,defaultGuardrails:3,defaultProfiles:2}));
