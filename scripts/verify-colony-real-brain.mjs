import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
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
const token='local-e2e-fixture-only';await DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('e2e-owner',await digest(token),'E2E',1,1).run();
globalThis.fetch=async(input,init)=>{
const url=String(input?.url||input);
if(url.includes('api.kraken.com')){const end=Math.floor(Date.now()/60000)*60-60;return Response.json({error:[],result:{XBTUSD:Array.from({length:40},(_,i)=>[end-(39-i)*60,'100','102','99',String(100+i/100),'100',10,1])}});}
return originalFetch(input,init);
};
const root=resolve('pages');server=createServer(async(req,res)=>{try{
const url=new URL(req.url,'http://localhost');
if(url.pathname.startsWith('/api/')){let body='';for await(const chunk of req)body+=chunk;const response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),{DB},{waitUntil(){}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
if(url.pathname==='/verify'){res.setHeader('Content-Type','text/html');res.end('<html><title>Real brain colony verification</title></html>');return;}
const p=resolve(root,'.'+url.pathname);if(!p.startsWith(root+sep))throw Error('Invalid path');res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));
}catch(e){res.statusCode=500;res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await ({chromium,webkit}[engineName]).launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/verify`);
const result=await page.evaluate(async token=>{
const {createBrowserBrainClient}=await import('/browser-brain-client.js');
const {createFlyIdentity}=await import('/fly-identity.js');const {createColonyClient}=await import('/colony-client.js');
const manifest=await (await fetch('/full-brain/manifest.json')).json();const identity=await createFlyIdentity(localStorage,{genesis_model_hash:manifest.manifest_hash,owner_scope:'e2e-owner'});
const brain=createBrowserBrainClient({timeoutMs:180000,isHidden:()=>false});brain.setCheckpointKey('real-colony-e2e');brain.start([],'autonomy');await brain.waitReady();
try{
const api=async(path,options={})=>{const response=await fetch(path,{method:options.method||'GET',headers:{'content-type':'application/json','X-Session-Token':token},...(options.body?{body:JSON.stringify(options.body)}:{})});const data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));return data;};
const client=createColonyClient({api,identity,storage:localStorage,withBrain:fn=>fn(brain)});
const colony=await client.create({consent:true,quorum:1});const task=await client.createTask(colony.colony_id,{duration_ms:300000});
const vote=await client.vote(task.task_id);const finalized=await client.finalize(task.task_id);const reread=await client.open(task.task_id);
if(finalized.status!=='FINALIZED'||JSON.stringify(finalized)!==JSON.stringify(reread))throw Error('Result not immutable');
const checkpoint=await brain.checkpointStatus();if(!(checkpoint.brain_ms>0))throw Error('Brain did not advance');
return {colony_id:colony.colony_id,task_id:task.task_id,vote,finalized,checkpoint};
}finally{brain.cancel();}
},token);
const row=await DB.prepare('SELECT result_json,result_hash FROM colony_tasks WHERE task_id=?').bind(result.task_id).first();const votes=await DB.prepare('SELECT action,checkpoint_hash FROM colony_votes WHERE task_id=?').bind(result.task_id).all();
if(!row?.result_hash||votes.results.length!==1||votes.results[0].action!==result.vote.action)throw Error('D1 verification failed');
const evidence={engine:engineName,market_source:'fixed fixture, NOT live market',brain:'real full browser WASM, no inference mock',scope:'single-member quorum; browser client to production Worker entrypoint to disposable D1; not full app UI',...result,persisted:row,votes:votes.results};
await mkdir('docs',{recursive:true});await writeFile(`docs/colony-real-brain-${engineName}.json`,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({engine:engineName,action:result.vote.action,brain_ms:result.checkpoint.brain_ms,status:result.finalized.status,result_hash:row.result_hash,votes:votes.results.length},null,2));
}finally{globalThis.fetch=originalFetch;await browser?.close();if(server)await new Promise(r=>server.close(r));await mf.dispose();}
