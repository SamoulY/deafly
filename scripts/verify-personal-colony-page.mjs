// Actual index.html UI, unmodified app modules, real full WASM + production Worker + disposable D1.
// Run: node scripts/verify-personal-colony-page.mjs (BROWSER_ENGINE=webkit optional).
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import worker from '../worker/src/index.mjs';
const engine=process.env.BROWSER_ENGINE||'chromium';
assert.ok(['chromium','webkit'].includes(engine));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-01-01',d1Databases:['DB']}));
const originalFetch=globalThis.fetch, evidence={engine,scope:'actual index.html personal/colony buttons; production Worker entrypoint; disposable D1',market:'fixed Kraken fixture; NOT live market',brain:'actual complete browser WASM; passive Worker message observation, no inference replacement',steps:[],api:[],errors:[]};
let browser,server,page;
const out=`docs/personal-colony-page-${engine}${process.env.COLONY_ONLY==='1'?'-colony-only':''}`;
evidence.personal_test_skipped=process.env.COLONY_ONLY==='1';
try {
 const DB=await mf.getD1Database('DB');
 // Base schema already contains 0003 columns. All subsequent migrations run unchanged.
 const migrations=(await readdir('worker/migrations')).filter(x=>x.endsWith('.sql')&&!x.startsWith('0003')).sort();
 for(const f of ['schema.sql',...migrations.map(x=>'migrations/'+x)])await DB.exec((await readFile('worker/'+f,'utf8')).replace(/\n/g,' '));
 evidence.migrations=['schema.sql',...migrations];
 globalThis.fetch=async(input,init)=>{const url=String(input?.url||input);if(url.includes('api.kraken.com')){const end=Math.floor(Date.now()/60000)*60-60;return Response.json({error:[],result:{XBTUSD:Array.from({length:120},(_,i)=>[end-(119-i)*60,'100','102','99',String(100+i/1000),'100',10,1])}});}throw Error('Unexpected external backend fetch: '+url);};
 const root=resolve('pages');
 server=createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host}`);if(url.pathname.startsWith('/api/')){let body='';for await(const chunk of req)body+=chunk;const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),{DB},{waitUntil(p){p?.catch(e=>evidence.errors.push(String(e)));}});evidence.api.push({method:req.method,path:url.pathname,status:response.status});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 const p=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));assert.ok(p.startsWith(root+'/'));let data=await readFile(p);if(p.endsWith('/index.html'))data=Buffer.from(data.toString().replace('name="defly-api-origin" content=""',`name="defly-api-origin" content="${url.origin}"`));res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[extname(p)]||'application/octet-stream');res.end(data);}catch(e){evidence.errors.push(String(e));res.statusCode=500;res.end(String(e));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await ({chromium,webkit}[engine]).launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(180000);
 page.on('pageerror',e=>evidence.errors.push(String(e)));
 await page.addInitScript(()=>{window.__brainMessages=[];const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',e=>{const d=e.data;if(d&&typeof d==='object'){const summary={};for(const [k,v]of Object.entries(d))if(!ArrayBuffer.isView(v)&&!(v instanceof ArrayBuffer))summary[k]=v;window.__brainMessages.push(summary);if(window.__brainMessages.length>100)window.__brainMessages.shift();}});}};});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const waitText=async(id,text)=>page.waitForFunction(({id,text})=>document.querySelector(id)?.textContent.includes(text),{id,text});
 const checkpoint=()=>page.evaluate(async()=>{const {checkpointStore}=await import('/full-brain/checkpoint.mjs');const token=localStorage.getItem(`defly.session:${location.origin}`);const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),v=>v.toString(16).padStart(2,'0')).join('');const c=await checkpointStore().load(key);return c?{hash:c.hash,meta:c.meta}:null;});
 await page.goto(origin);await waitText('#notice','RAISING DESK');
 const identity=await page.locator('#flyIdentity').innerText();assert.match(identity,/./);evidence.identity=identity;evidence.steps.push('real boot/session creation');
 evidence.scene=await page.evaluate(()=>{const canvas=document.querySelector('#flyScene'),fallback=document.querySelector('#sceneFallback');return {webgl:canvas.dataset.webgl,fallbackHidden:fallback.hidden,fallbackVisible:!!fallback.getClientRects().length,width:canvas.width,height:canvas.height};});
 assert.equal(evidence.scene.webgl,'ready');assert.equal(evidence.scene.fallbackVisible,false);assert.ok(evidence.scene.width>0&&evidence.scene.height>0);
 evidence.steps.push('fly WebGL canvas initialized; fallback is not visible');
 await page.locator('#colonyStart').click();await waitText('#colonyStatus','Please agree');assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM colonies').first()).n,0);evidence.steps.push('consent refusal persisted zero colonies');
 if(process.env.COLONY_ONLY!=='1') {
 // Run actual personal autonomous paper brain so the SAVE BRAIN button is genuinely enabled.
 await page.locator('#autonomousMode').click();await page.waitForFunction(()=>!document.querySelector('#autonomousMode').disabled);await page.locator('#autoToggle').click();await page.waitForFunction(()=>document.querySelector('#autoToggle').textContent.includes('STOP AUTONOMOUS')&&!document.querySelector('#autoToggle').disabled);
 await page.waitForFunction(()=>window.__brainMessages.some(m=>m.type==='ACTIVITY'&&m.payload?.scope==='autonomy'&&m.payload.brain_ms>0));
 await page.locator('#checkpointSave').click();await waitText('#checkpointStatus','SAVED LOCALLY');evidence.personal_saved=await checkpoint();assert.ok(evidence.personal_saved.meta.brain_ms>0);
 evidence.steps.push('personal full brain advanced; actual SAVE BRAIN button persisted checkpoint');
 await page.locator('#autoToggle').click();await page.reload();await waitText('#notice','RAISING DESK');assert.equal(await page.locator('#flyIdentity').innerText(),identity);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n,1);assert.equal((await checkpoint()).hash,evidence.personal_saved.hash);evidence.steps.push('reload restored same identity/session/checkpoint bytes');
 await page.locator('#autonomousMode').click();await page.waitForFunction(()=>!document.querySelector('#autonomousMode').disabled);await page.locator('#autoToggle').click();await waitText('#brainRuntimeStatus','RESTORED LOCAL CHECKPOINT');await page.waitForFunction(()=>document.querySelector('#autoToggle').textContent.includes('STOP AUTONOMOUS')&&!document.querySelector('#autoToggle').disabled);evidence.restored_status=await page.locator('#brainRuntimeStatus').innerText();await page.waitForFunction(ms=>window.__brainMessages.some(m=>m.type==='ACTIVITY'&&m.payload?.scope==='autonomy'&&m.payload.brain_ms>ms),evidence.personal_saved.meta.brain_ms);await page.locator('#checkpointSave').click();await waitText('#checkpointStatus','SAVED LOCALLY');evidence.personal_resaved=await checkpoint();assert.ok(evidence.personal_resaved.meta.brain_ms>evidence.personal_saved.meta.brain_ms);await page.locator('#autoToggle').click();evidence.steps.push('real WASM restored checkpoint then advanced beyond saved brain_ms');
 }
 const decisionsBefore=(await DB.prepare('SELECT COUNT(*) AS n FROM decisions').first()).n;
 await page.locator('#colonyConsent').check();await page.locator('#colonyStart').click();await waitText('#colonyStatus','Submitted');
 evidence.vote=JSON.parse(await page.locator('#colonyResult').textContent());evidence.task_id=evidence.vote.task_id;evidence.brain_messages=await page.evaluate(()=>window.__brainMessages);
 assert.ok(evidence.brain_messages.some(m=>m.type==='ACTIVITY'&&m.payload?.scope==='autonomy'&&m.payload.brain_ms>0));
 await page.locator('#colonyPause').click();await waitText('#colonyStatus','Paused');
 evidence.votes=(await DB.prepare('SELECT action,checkpoint_hash FROM colony_votes WHERE task_id=?').bind(evidence.task_id).all()).results;assert.equal(evidence.votes.length,1);assert.equal(evidence.votes[0].action,evidence.vote.action);assert.match(evidence.votes[0].checkpoint_hash,/^[a-f0-9]{64}$/);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM decisions').first()).n,decisionsBefore);
 await page.locator('#colonyCorrect').click();await page.locator('#colonyCorrectionAction').selectOption('HOLD');await page.locator('#colonyCorrectionSave').click();await waitText('#colonyCorrectionStatus','Correction saved separately');
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM colony_human_corrections').first()).n,1);
 assert.equal((await DB.prepare('SELECT action FROM colony_votes WHERE task_id=?').bind(evidence.task_id).first()).action,evidence.vote.action);
 evidence.steps.push('actual consent/Start automatically enrolled, claimed, inferred full WASM and signed decision; Pause; separate correction; no orders');
 await page.reload();await waitText('#notice','RAISING DESK');assert.equal(await page.locator('#flyIdentity').innerText(),identity);assert.equal(await page.locator('#colonyConsentLabel').isVisible(),false);assert.equal(await page.locator('#colonyStatus').innerText(),'Paused');assert.equal(await page.locator('#colonyStart').isEnabled(),true);
 evidence.steps.push('reload restored identity and public consent; automatic loop remains paused');
 evidence.passed=true;
} catch(error){evidence.passed=false;evidence.failure=String(error);process.exitCode=1;}
finally{await mkdir('docs',{recursive:true});if(page){evidence.ui=await page.evaluate(()=>Object.fromEntries(['notice','brainRuntimeStatus','checkpointStatus','colonyStatus','autoStatus','sceneFallback'].map(id=>[id,(()=>{const el=document.getElementById(id);return {text:el?.textContent,hidden:el?.hidden,visible:!!el?.getClientRects().length};})()]))).catch(()=>({}));await page.screenshot({path:out+'.png',fullPage:true}).catch(()=>{});}await writeFile(out+'.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({passed:evidence.passed,steps:evidence.steps,failure:evidence.failure,ui:evidence.ui,errors:evidence.errors,evidence:out+'.json'},null,2));globalThis.fetch=originalFetch;await browser?.close();if(server)await new Promise(r=>server.close(r));await mf.dispose();}
