// Deterministically bundle Servix sync into a single-file Cloudflare dashboard Worker.
// Usage: node tools/build_gold_scheduler.mjs [--check]
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const from=readFileSync(resolve(root,'functions/_lib/gold-market.js'),'utf8');
const start=from.indexOf('export async function syncRate(');
const end=from.indexOf('export async function approvePendingRate(');
const publicFunctions=from.indexOf('export async function marketPublic(');
if(start<0||end<0||publicFunctions<0||end<start)throw Error('Canonical Servix module structure changed.');
const canonical=from.slice(0,publicFunctions)+from.slice(start,end);
const minimal=canonical.replace(/\bexport\s+(?=(?:const|class|async function|function)\b)/g,'');
if(/\bexport (?:const|class|async function)\b/.test(minimal))throw Error('Unexpected export remains.');
const preface='/* AUTO-GENERATED from functions/_lib/gold-market.js — do not hand-edit.\n'+
 '   Paste this entire file into Cloudflare Worker Edit Code.\n'+
 '   Bind existing D1 as DB, add SERVIX_API_KEY Secret, then set Cron Trigger.\n'+
 '   No public HTTP endpoint or API secret in this source. */\n\n';
const suffix=[
 '',
 'export default {',
 '  async fetch() {',
 "    return new Response('Not Found',{status:404,headers:{'Cache-Control':'no-store'}});",
 '  },',
 '  async scheduled(_event,env,ctx) {',
 '    ctx.waitUntil((async()=>{',
 '      const result=await syncRate(env);',
 '      // Log only safe status and error code, never keys or prices.',
 "      console.log('haniel_gold_rate_sync',result.status,result.errorCode||'');",
 '    })().catch(error=>{',
 "      console.error('haniel_gold_rate_sync_failed',error?.code||'WORKER_ERROR');",
 '      throw error;',
 '    }));',
 '  }',
 '};',
 ''
].join('\n');
const output=preface+minimal+suffix;
const target=resolve(root,'cloudflare/gold-scheduler-dashboard.js');
if(process.argv.includes('--check')){
 const current=readFileSync(target,'utf8');
 if(current!==output)throw Error('Dashboard Worker bundle is outdated; regenerate before deploying.');
 console.log('Dashboard Worker bundle matches canonical Servix source');
}else{
 writeFileSync(target,output);
 console.log('Updated '+target);
}
