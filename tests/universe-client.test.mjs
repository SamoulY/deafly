import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createUniverseClient} from '../pages/universe-client.js';
import {createFlyIdentity} from '../pages/fly-identity.js';
import {digest} from '../worker/src/federation.mjs';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
test('enrollment retries its frozen copy and predictions never use a later personal checkpoint',async()=>{
 const identity=await createFlyIdentity({getItem(){return null},setItem(){}},{genesis_model_hash:'a'.repeat(64)}),owner='alice',hash='b'.repeat(64),round='day-1',storeMap=new Map(),calls=[],options=[];
 let failures=1,captures=0,registers=0;
 const snapshot={symbol:'BTCUSD',source:'test',bars:[{time:1,close:100},{time:2,close:110}]},task={id:'one',round_id:round,snapshot,snapshot_hash:await digest(snapshot),checkpoint_hash:hash,teaching_hash:'private'};
 const client=createUniverseClient({identity,owner,checkpointKey:'owner-checkpoint',store:{load:async k=>storeMap.get(k),save:async(k,v)=>storeMap.set(k,v)},register:async()=>registers++,getName:()=>'<fly>',withBrain:async(fn,opt)=>{options.push(opt);return fn({captureCheckpoint:async()=>{captures++;return {hash};},saveCheckpoint:async()=>({hash}),infer:async frame=>{assert.equal(frame.snapshot_hash,task.snapshot_hash);return {decoder:{proposed_action:'SELL'}};}});},api:async(path,request)=>{calls.push({path,body:request?.body});if(path.endsWith('/enroll')&&failures-->0)throw Error('lost response');return path.endsWith('/task')?{task}:{accepted:true};}});
 await assert.rejects(client.enroll(round,{consent:false}),/CONSENT/);await assert.rejects(client.enroll(round,{consent:true}),/lost response/);await client.enroll(round,{consent:true});assert.equal(captures,1);assert.equal(registers,1);
 await client.contribute();assert.equal(options.at(-1).checkpointKey,'universe:owner-checkpoint:day-1');assert.equal(calls.at(-1).body.checkpoint_hash,hash);assert.equal(calls.at(-1).body.teaching_hash,'private');
 await assert.rejects(client.contribute({isActive:()=>false}),/PAUSED/);storeMap.clear();await assert.rejects(client.contribute(),/FROZEN_CHECKPOINT_MISSING/);
});
test('evaluation worker freezes weights, requires the named copy and cannot persist inference',async()=>{
 const source=(await readFile('pages/full-brain/worker.mjs','utf8')).replace(/^import .*;\r?\n/gm,'');
 const messages=[],seen=[];let writes=0,stored={hash:'frozen',meta:{brain_ms:7}};
 const context={self:{},postMessage:m=>messages.push(m),checkpointStore:()=>({load:async key=>{seen.push(key);return stored;},save:async()=>writes++}),createBrain:async(_,options)=>{assert.equal(options.frozen,true);return {arrays:{ids:[],plastic_weight:new Float32Array(1)},m:{manifest_hash:'a'},heapBytes:4,learning:{},sensory:{},observe(){return {counts:[],decoder:{proposed_action:'HOLD'}};}};},hash:async()=> 'frame',createStateHasher:()=>({checkpointHash:async()=> 'state'}),captureCheckpoint:async()=>stored,restoreCheckpoint:async()=>{}};
 vm.runInNewContext(source,context);
 const init={type:'INIT',sample_ids:[],scope:'autonomy',checkpoint_key:'universe:alice:round',checkpoint_persistence:'ephemeral',freeze_weights:true,checkpoint_required:true};
 await context.self.onmessage({data:init});assert.equal(messages.at(-1).type,'READY');assert.equal(seen[0],init.checkpoint_key);
 await context.self.onmessage({data:{type:'OBSERVE',rgb:[],frame_hash:'frame'}});assert.equal(messages.at(-1).payload.weights_frozen,true);assert.equal(writes,0);
 stored=null;await context.self.onmessage({data:init});assert.equal(messages.at(-1).message,'FROZEN_CHECKPOINT_MISSING');
});
test('real WASM restores an independent frozen evaluation copy and resumes the personal brain',{timeout:180000},async t=>{
 const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://test').pathname;if(path==='/'){res.setHeader('content-type','text/html');res.end('<title>Isolated universe kernel test</title>');return;}res.setHeader('content-type',/\.m?js$/.test(path)?'text/javascript':path.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(new URL('../pages'+path,import.meta.url)));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r));});
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const {createBrowserBrainClient,encodeMarketObservation}=await import('/browser-brain-client.js'),{checkpointStore}=await import('/full-brain/checkpoint.mjs');
  const client=createBrowserBrainClient({timeoutMs:120000}),store=checkpointStore(),owner='a'.repeat(64),copy=`universe:${owner}:test`;
  const frame=await encodeMarketObservation({candles:Array.from({length:40},(_,i)=>({time:1000+i*60,close:100+i})),snapshot_hash:'c'.repeat(64)});
  client.setCheckpointKey(owner);client.start([],'autonomy',{checkpointPersistence:'ephemeral'});await client.waitReady();
  let seed=await client.captureCheckpoint();const original=seed.hash,weightHash=seed.entries['kernel:plastic_weight'].hash;
  await store.save(owner,seed,null);await store.save(copy,seed,null);seed=null;client.cancel();
  client.start([],'autonomy',{checkpointPersistence:'ephemeral',checkpointKey:copy,frozen:true});await client.waitReady();
  const restored=(await client.saveCheckpoint()).hash,output=await client.infer(frame);let after=await client.captureCheckpoint();const unchangedWeights=after.entries['kernel:plastic_weight'].hash===weightHash;after=null;client.cancel();
  const personalUntouched=(await store.load(owner)).hash===original,copyUntouched=(await store.load(copy)).hash===original;
  client.start([],'autonomy');await client.waitReady();const resumed=(await client.saveCheckpoint()).hash;await client.infer(frame);client.cancel();
  return {original,restored,resumed,unchangedWeights,personalUntouched,copyUntouched,personalAdvanced:(await store.load(owner)).hash!==original,frozen:output.weights_frozen,gate:output.decoder.gate_spikes};
 });
 assert.equal(result.restored,result.original);assert.equal(result.resumed,result.original);assert.ok(result.unchangedWeights&&result.personalUntouched&&result.copyUntouched&&result.personalAdvanced&&result.frozen);assert.ok(result.gate>0);console.log('REAL_UNIVERSE_KERNEL',JSON.stringify(result));
});
