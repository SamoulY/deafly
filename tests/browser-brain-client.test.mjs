import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserBrainClient, encodeMarketObservation} from '../pages/browser-brain-client.js';
import {validateActivity} from '../pages/neural-contract.js';
const h='a'.repeat(64), now=Date.now();
const anatomy={manifest_hash:h,nodes:[{id:'1'}]};
const frame={snapshot_hash:h,frame_hash:h,observed_at:now,historical:true};
const payload={...frame,backend:'stonkfly-full-browser-wasm-v1',truth_status:'real_full_kernel',manifest_hash:h,checkpoint_hash:h,memory_hash:h,activity:{node_ids:['1'],event_counts:[2],total_events:2,full_total_events:9,simulated_ms:10}};
test('browser envelopes from server cannot acquire trusted origin',()=>{
 assert.equal(validateActivity(payload,{snapshot:frame,anatomy}).available,false);
 const client=createBrowserBrainClient();
 assert.equal(client.validate(payload,{snapshot:frame,anatomy,trustedBrowser:true}).available,false);
});
test('worker serializes inference, retains latest, skips hidden and rejects stale identities',()=>{
 const sent=[],seen=[];let hidden=false;
 const worker={postMessage:x=>sent.push(x),terminate(){}};
 const client=createBrowserBrainClient({workerFactory:()=>worker,isHidden:()=>hidden,onActivity:(p,f)=>seen.push([p,f])});
 client.start(['1']);client.observe(frame);assert.equal(sent.length,1);
 worker.onmessage({data:{type:'READY'}});assert.equal(sent.length,2);
 client.observe({...frame,snapshot_hash:'b'.repeat(64)});client.observe({...frame,snapshot_hash:'c'.repeat(64)});
 worker.onmessage({data:{type:'ACTIVITY',request_id:sent.at(-1).request_id,payload}});
 assert.equal(sent.length,3);assert.equal(sent[2].snapshot_hash,'c'.repeat(64));
 assert.equal(client.validate(payload,{snapshot:frame,anatomy}).available,true);
 assert.equal(client.validate({...payload},{snapshot:frame,anatomy}).available,false);
 assert.equal(client.validate(payload,{snapshot:{...frame,frame_hash:'b'.repeat(64)},anatomy}).available,false);
 hidden=true; client.observe(frame);worker.onmessage({data:{type:'ACTIVITY',request_id:sent.at(-1).request_id,payload}});
 assert.equal(seen.length,1);assert.equal(sent.length,3);
 hidden=false;client.resume();assert.equal(sent.length,4);client.cancel();
 worker.onmessage({data:{type:'ACTIVITY',request_id:sent.at(-1).request_id,payload}});assert.equal(seen.length,1);
});
test('RGB encoder preserves teaching identity with deterministic actual pixel hash',async()=>{
 const source={bars:[{close:20},{close:21},{close:19}],observation_hash:h};
 const a=await encodeMarketObservation(source,true),b=await encodeMarketObservation({...source,theme:'other'},true);
 assert.equal(a.snapshot_hash,h);assert.equal(a.historical,true);assert.equal(a.rgb.length,320*180*3);
 assert.deepEqual(a.rgb,b.rgb);assert.equal(a.frame_hash,b.frame_hash);
 const c=await encodeMarketObservation({...source,bars:[{close:20},{close:19},{close:21}]},true);
 assert.notEqual(a.frame_hash,c.frame_hash);
 await assert.rejects(encodeMarketObservation({bars:[{close:NaN}]},true));
});
