import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,verifyAnatomy,validateActivity} from '../pages/neural-contract.js';
const h='a'.repeat(64), now=Date.now();
const anatomy={source:'test fixture only',manifest_hash:h,nodes:[{id:'123',x:1,y:2,z:3}]};
const snapshot={snapshot_hash:h,frame_hash:h,observed_at:now};
const payload={...snapshot,backend:'stonkfly-full-native-v1',truth_status:'real_full_kernel',manifest_hash:h,checkpoint_hash:h,memory_hash:h,activity:{node_ids:['123'],event_counts:[2],total_events:2,simulated_ms:500}};
const validate=p=>validateActivity(p,{snapshot,anatomy,now});
test('anatomy verifies content hash and rejects malformed coordinates and duplicate IDs',async()=>{
 const a={...anatomy,nodes_hash:await digest(anatomy.nodes)};
 assert.equal(await verifyAnatomy(a),a);
 assert.equal(await verifyAnatomy({...a,nodes_hash:'b'.repeat(64)}),null);
 assert.equal(await verifyAnatomy({...a,nodes:[...a.nodes,...a.nodes]}),null);
 assert.equal(await verifyAnatomy({...a,nodes:[{id:'123',x:NaN,y:1,z:1}]}),null);
});
test('only current matching native activities are accepted',()=>{
 assert.equal(validate(payload).available,true);
 for(const p of [null,{...payload,replay:true},{...payload,mode:'replay'},{...payload,backend:'debug'},{...payload,truth_status:'simulated_activity'},{...payload,manifest_hash:'b'.repeat(64)},{...payload,snapshot_hash:'b'.repeat(64)},{...payload,frame_hash:'b'.repeat(64)},{...payload,checkpoint_hash:'bad'},{...payload,observed_at:now-120001},{...payload,observed_at:now+1001}])assert.equal(validate(p).available,false);
});
test('activity arrays reject bad shapes IDs counts totals and time windows',()=>{
 for(const change of [{node_ids:[]},{event_counts:[]},{node_ids:['unknown']},{node_ids:['123','123'],event_counts:[1,1]},{event_counts:[NaN]},{event_counts:[-1]},{event_counts:[.5]},{total_events:3},{simulated_ms:0}]) assert.equal(validate({...payload,activity:{...payload.activity,...change}}).available,false);
 assert.equal(validateActivity(payload,{snapshot:{...snapshot,observed_at:now-120001},anatomy,now}).available,false);
});
