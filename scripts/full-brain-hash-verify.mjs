import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
const engineName=process.env.BROWSER_ENGINE||'chromium';
if(!['chromium','webkit'].includes(engineName))throw Error('Unsupported browser engine');
const engine=engineName==='webkit'?webkit:chromium;
const root=resolve('pages');
const server=createServer(async(req,res)=>{try{if(req.url==='/verify'){res.setHeader('Content-Type','text/html');res.end('<html></html>');return;}const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+'/'))throw Error('path');const data=await readFile(p);res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[extname(p)]||'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await engine.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/verify`);
const result=await page.evaluate(async()=>{
 const {createBrain,hash}=await import('/full-brain/brain.mjs');const {createStateHasher}=await import('/full-brain/state-hash.mjs');
 const brain=await createBrain();const hasher=createStateHasher(brain.arrays,hash);const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
 const oldHash=async()=>{const s=[];for(const [k,a]of Object.entries(brain.arrays))if(!['post','contact','ids'].includes(k))s.push([k,await hash(bytes(a))]);for(const[k,a]of Object.entries({...brain.learning,...brain.sensory}))s.push([k,await hash(bytes(a))]);return hash(new TextEncoder().encode(JSON.stringify(s)));};
 const contactBefore=await hash(bytes(brain.arrays.contact));const checks=[];
 for(const phase of ['initial','observation','reward']){let run=null;if(phase!=='initial'){const rgb=new Uint8Array(320*180*3).fill(180);run=brain.observe(rgb,320,180,10,phase==='reward'?'reward':'none');}const a=await oldHash();const b=await hasher.checkpointHash(brain.learning,brain.sensory);checks.push({phase,match:a===b,hash:b,contactUnchanged:contactBefore===await hash(bytes(brain.arrays.contact)),computeMs:run?.compute_ms});}
 const {captureCheckpoint,restoreCheckpoint}=await import('/full-brain/checkpoint.mjs');const saved=await captureCheckpoint(brain,'autonomy');const savedHash=await oldHash();brain.observe(new Uint8Array(320*180*3).fill(90),320,180,10);await restoreCheckpoint(brain,saved,'autonomy');checks.push({phase:'restore',match:savedHash===await oldHash()&&savedHash===await hasher.checkpointHash(brain.learning,brain.sensory),contactUnchanged:contactBefore===await hash(bytes(brain.arrays.contact))});
 return {environment:'desktop Chromium, not physical phone',nodes:brain.m.nodes,edges:brain.m.edges,plasticEdges:brain.m.plasticEdges,heapBytes:brain.heapBytes,immutableContactBytes:brain.arrays.contact.byteLength,checks};
});result.environment=`desktop ${engineName}, not physical phone`;await writeFile(`docs/full-brain-hash-evidence-${engineName}.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(result.checks.some(x=>!x.match||!x.contactUnchanged))throw Error('Parity failed');
}finally{await browser?.close();server.close();}
