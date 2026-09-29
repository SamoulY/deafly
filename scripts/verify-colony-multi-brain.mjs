import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import worker from '../worker/src/index.mjs';
import {digest} from '../worker/src/federation.mjs';
const engineName=process.env.BROWSER_ENGINE||'chromium';
if(!['chromium','webkit'].includes(engineName))throw Error('Invalid browser');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-01-01',d1Databases:['DB']}));
let browser,server;const originalFetch=globalThis.fetch;
try{
const DB=await mf.getD1Database('DB');
for(const f of ['schema.sql','migrations/0008_federation.sql','migrations/0009_colony_tasks.sql'])await DB.exec((await readFile(new URL('../worker/'+f,import.meta.url),'utf8')).replace(/\n/g,' '));
const tokens=['member-a-fixture','member-b-fixture','outsider-fixture'];for(let i=0;i<3;i++)await DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('owner-'+i,await digest(tokens[i]),'E2E',1,1).run();
globalThis.fetch=async(input,init)=>{
const url=String(input?.url||input);
if(url.includes('api.kraken.com')){const end=Math.floor(Date.now()/60000)*60-60;return Response.json({error:[],result:{XBTUSD:Array.from({length:40},(_,i)=>[end-(39-i)*60,'100','102','99',String(100+i/100),'100',10,1])}});}
return originalFetch(input,init);
};
const root=resolve('pages');server=createServer(async(req,res)=>{try{
const url=new URL(req.url,'http://localhost');
if(url.pathname.startsWith('/api/')){let body='';for await(const chunk of req)body+=chunk;const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),{DB},{waitUntil(){}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
if(url.pathname==='/verify'){res.setHeader('Content-Type','text/html');res.end('<html><title>Real brain colony verification</title></html>');return;}
const p=resolve(root,'.'+url.pathname);if(!p.startsWith(root+'/'))throw Error('Invalid path');res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));
}catch(e){res.statusCode=500;res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await ({chromium,webkit}[engineName]).launch({headless:true});const pages=[];
for(let i=0;i<3;i++){
 const context=await browser.newContext();const page=await context.newPage();pages.push(page);await page.goto(`http://127.0.0.1:${server.address().port}/verify`);
 await page.evaluate(async({token,i})=>{
  const {createBrowserBrainClient}=await import('/browser-brain-client.js');const {createFlyIdentity}=await import('/fly-identity.js');const {createColonyClient}=await import('/colony-client.js');
  const manifest=await(await fetch('/full-brain/manifest.json')).json();const identity=await createFlyIdentity(localStorage,{genesis_model_hash:manifest.manifest_hash,owner_scope:'owner-'+i});
  const brain=createBrowserBrainClient({timeoutMs:180000,isHidden:()=>false});brain.setCheckpointKey('owner-'+i);
  const api=async(path,options={})=>{const r=await fetch(path,{method:options.method||'GET',headers:{'content-type':'application/json','X-Session-Token':token},...(options.body?{body:JSON.stringify(options.body)}:{})});const d=await r.json();if(!r.ok)throw Error(r.status+':'+JSON.stringify(d));return d;};
  window.client=createColonyClient({api,identity,storage:localStorage,withBrain:async fn=>{brain.start([],'autonomy');await brain.waitReady();try{return await fn(brain)}finally{brain.cancel()}}});window.identity=identity;
 },{token:tokens[i],i});
}
const colony=await pages[0].evaluate(()=>client.create({consent:true,quorum:1}));
await pages[1].evaluate(id=>client.join(id,{consent:true}),colony.colony_id);
const task=await pages[0].evaluate(id=>client.createTask(id,{duration_ms:300000}),colony.colony_id);
const unauthorized=await pages[2].evaluate(async id=>{try{await client.open(id);return 'UNEXPECTED_SUCCESS'}catch(e){return e.message}},task.task_id);
if(!unauthorized.startsWith('403:'))throw Error('Nonmember not rejected: '+unauthorized);
const first=await pages[0].evaluate(id=>client.vote(id),task.task_id);
const premature=await pages[0].evaluate(async id=>{try{await client.finalize(id);return 'UNEXPECTED_SUCCESS'}catch(e){return e.message}},task.task_id);
if(!premature.startsWith('409:'))throw Error('Premature finalization accepted: '+premature);
const duplicate=await pages[0].evaluate(async id=>{try{await client.vote(id);return 'UNEXPECTED_SUCCESS'}catch(e){return e.message}},task.task_id);
if(!duplicate.startsWith('409:'))throw Error('Duplicate not rejected: '+duplicate);
const second=await pages[1].evaluate(id=>client.vote(id),task.task_id);
const finalized=await pages[0].evaluate(id=>client.finalize(id),task.task_id);const reread=await pages[1].evaluate(id=>client.open(id),task.task_id);
if(finalized.status!=='FINALIZED'||JSON.stringify(finalized)!==JSON.stringify(reread))throw Error('Immutable result mismatch');
const rows=await DB.prepare('SELECT member_user_id,fly_id,action,checkpoint_hash FROM colony_votes WHERE task_id=?').bind(task.task_id).all();
if(rows.results.length!==2||new Set(rows.results.map(r=>r.fly_id)).size!==2)throw Error('Member isolation failed');
const evidence={engine:engineName,market_source:'fixture; not production market',brain:'actual full WASM per isolated owner, no mock outputs',scope:'two-member browser clients, production route and disposable D1, not full app UI',first,second,unauthorized,premature,duplicate,finalized,votes:rows.results};
await writeFile(`docs/colony-multi-brain-${engineName}.json`,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
}finally{globalThis.fetch=originalFetch;await browser?.close();if(server)await new Promise(r=>server.close(r));await mf.dispose();}
