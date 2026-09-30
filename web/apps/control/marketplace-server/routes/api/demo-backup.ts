import { defineHandler } from 'nitro';
import { z } from 'zod';
import { entitySchema } from '../../../src/features/business-demo/model';

// Deliberately unlinked from the demo UI. This is a maintenance entrance,
// not an authentication boundary; deployment access controls still apply.
export default defineHandler(async event => {
  if (process.env.MARKETPLACE_DATA_MODE === 'live') return new Response('Not found', {status:404});
  const browserOnly = process.env.MARKETPLACE_DEMO_STORAGE === 'browser';
  if (browserOnly && event.req.method === 'POST') {
    try {
      const text=await event.req.text();
      if(text.length>7500000)return new Response('File too large',{status:413});
      const backup=z.object({format:z.literal('tali-demo'),version:z.literal(1),items:z.array(entitySchema).max(10000)}).parse(JSON.parse(text));
      const policies=new Set(backup.items.filter(item=>item.kind==='policies').map(item=>item.id));
      if(new Set(backup.items.map(item=>item.id)).size!==backup.items.length||backup.items.some(item=>item.policies.some(ref=>!policies.has(ref.policyId))))throw new Error('Invalid references');
      return Response.json(backup,{headers:{'Cache-Control':'no-store'}});
    } catch { return Response.json({error:'Invalid backup file.'},{status:400}); }
  }
  if (event.req.method !== 'GET') return new Response('Method not allowed', {status:405});
  return new Response(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Demo backup</title>
<style>body{font:15px system-ui;color:#27272a;max-width:660px;margin:64px auto;padding:24px}button,a{display:inline-block;border:1px solid #ddd;border-radius:6px;padding:10px 16px;background:white;color:inherit;text-decoration:none;cursor:pointer}button:disabled{opacity:.5;cursor:default}section{border-top:1px solid #ddd;margin-top:28px;padding-top:24px}p{line-height:1.6}#restore{background:#c92327;color:white}#message{white-space:pre-wrap}</style>
<h1>Demo backup</h1>
<p>${browserOnly?'Cases are stored only in this browser. Other browsers do not share them. Clearing site data removes cases.':'All users of this Pod share the same cases. Data resets when the server restarts.'} Export includes Guardrails, Profiles, versions and evaluation results.</p>
<a id="export" href="/api/demo-state?download=1" download>Export current cases</a>
<section><h2>Restore cases</h2><p>Import replaces all current ${browserOnly?'browser':'shared'} cases. Export a backup first.</p>
<input id="file" type="file" accept=".json,application/json" aria-label="Backup file">
<p id="preview"></p><button id="restore" disabled>Import and replace</button></section>
<p id="message" role="status"></p>
<script>
const file=document.getElementById('file'), button=document.getElementById('restore'), preview=document.getElementById('preview'), message=document.getElementById('message');
let backup, revision;
const browserOnly=${browserOnly}, key='tali-browser-demo-v1';
const localState=()=>JSON.parse(localStorage.getItem(key)||'{"revision":0,"items":[]}');
if(browserOnly)document.getElementById('export').onclick=(event)=>{event.preventDefault();try{const state=localState();const blob=new Blob([JSON.stringify({format:'tali-demo',version:1,items:state.items},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='tali-browser-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){message.textContent=error.message;}};
async function read(response){const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');return data;}
file.onchange=async()=>{button.disabled=true;backup=undefined;preview.textContent='';message.textContent='';
 try{const selected=file.files[0];if(!selected)return;if(selected.size>7500000)throw new Error('Backup must be smaller than 7.5 MB.');
 const data=JSON.parse(await selected.text());if(data.format!=='tali-demo'||data.version!==1||!Array.isArray(data.items))throw new Error('Select a valid demo backup JSON file.');
 const state=browserOnly?localState():await read(await fetch('/api/demo-state',{cache:'no-store'}));revision=state.revision;backup=data;
 preview.textContent=data.items.length+' records selected. The server will validate all records before saving.';button.disabled=false;
 }catch(error){message.textContent=error.message;}};
button.onclick=async()=>{if(!backup||!confirm(browserOnly?'Replace this browser’s cases?':'Replace all shared cases with this backup? This affects every user.'))return;button.disabled=true;
 try{if(browserOnly){const validated=await read(await fetch('/api/demo-backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(backup)}));if(localState().revision!==revision)throw new Error('Cases changed in another tab.');localStorage.setItem(key,JSON.stringify({revision:revision+1,items:validated.items}));}else{await read(await fetch('/api/demo-state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,backup})}));}
 message.textContent=browserOnly?'Cases restored in this browser.':'Cases restored. Other users will see the changes automatically.';backup=undefined;file.value='';preview.textContent='';
 }catch(error){message.textContent=error.message+' Select the file again to retry.';}};
</script></html>`, {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY'}});
});
