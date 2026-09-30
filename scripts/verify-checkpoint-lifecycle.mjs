import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium,webkit} from 'playwright';
const engineName=process.env.BROWSER_ENGINE||'chromium';
if(!['chromium','webkit'].includes(engineName))throw Error('Unsupported browser engine');
const engine=engineName==='webkit'?webkit:chromium;
const root=resolve('pages');const server=createServer(async(req,res)=>{try{if(req.url==='/verify'){res.setHeader('Content-Type','text/html');return res.end('<html></html>');}const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+sep))throw Error('path');res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await engine.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/verify`);
const result=await page.evaluate(async()=>{
 const {createBrowserBrainClient,encodeMarketObservation}=await import('/browser-brain-client.js');const statuses=[];
 const client=createBrowserBrainClient({timeoutMs:180000,isHidden:()=>false,onStatus:s=>statuses.push(s)});client.setCheckpointKey('checkpoint-lifecycle-owner-a');client.start([],'autonomy');await client.waitReady();
 const frame=await encodeMarketObservation({candles:[{close:10},{close:12},{close:11}]});const activity=await client.infer(frame);const saved=await client.checkpointStatus();if(saved.state!=='saved'||!saved.hash)throw Error('Autonomous observation not persisted');
 const exported=await client.exportCheckpoint();if(exported.hash!==saved.hash)throw Error('Export differs');await client.shutdown();client.start([],'autonomy');await client.waitReady();const restored=await client.checkpointStatus();if(!restored.restored||restored.hash!==saved.hash||restored.brain_ms!==activity.brain_ms)throw Error('Restore mismatch');
 client.cancel();client.start([],'observation');await client.waitReady();await client.saveCheckpoint().then(()=>{throw Error('Observation must not save');},e=>{if(!/scope/.test(e.message))throw e;});client.cancel();
 return {saved,restored,entryCount:Object.keys(exported.entries).length,brain_ms:activity.brain_ms,scopeIsolation:true};
});console.log(JSON.stringify(result,null,2));}finally{await browser?.close();server.close();}
