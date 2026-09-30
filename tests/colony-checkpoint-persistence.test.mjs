import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

// Run the real Worker message handler with small deterministic brain/storage
// adapters. This checks persistence policy, not full-network neural parity.
const source=(process.env.CHECKPOINT_BASELINE
  ?execFileSync('git',['show','c5466e6:pages/full-brain/worker.mjs'],{encoding:'utf8'})
  :readFileSync(new URL('../pages/full-brain/worker.mjs',import.meta.url),'utf8'))
  .replace(/^import .*;\r?\n/gm,'');
function runtime(initial=null,shared={persisted:initial?structuredClone(initial):null}) {
  let writes=0,brain;
  const messages=[];
  const context={self:{},postMessage:m=>messages.push(m),
    checkpointStore:()=>({load:async()=>shared.persisted?structuredClone(shared.persisted):null,save:async(key,value,expectedHash)=>{assert.equal(key,'owner');if((shared.persisted?.hash??null)!==expectedHash)throw Error('Checkpoint changed in another tab');writes++;shared.persisted=structuredClone(value);}}),
    createBrain:async()=>brain={arrays:{ids:[],plastic_weight:new Float32Array([1])},heapBytes:4,m:{manifest_hash:'manifest',reinforcement:{reward:[1]}},learning:{},sensory:{},time:0,
      observe(){this.time+=100;return {counts:[],brain_ms:this.time,compute_ms:1,simulated_ms:100,decoder:{proposed_action:'HOLD'}};}},
    hash:async()=> 'frame',createStateHasher:()=>({checkpointHash:async()=>`state-${brain.time}`}),
    captureCheckpoint:async b=>({hash:`checkpoint-${b.time}`,meta:{brain_ms:b.time,manifest_hash:'manifest'}}),
    restoreCheckpoint:async(b,s)=>{b.time=s.meta.brain_ms;}};
  vm.runInNewContext(source,context);
  return {async send(data){await context.self.onmessage({data});return messages.at(-1);},get writes(){return writes;},get saved(){return shared.persisted;}};
}
const seed={hash:'checkpoint-700',meta:{brain_ms:700,manifest_hash:'manifest'}};
const init=mode=>({type:'INIT',scope:'autonomy',sample_ids:[],checkpoint_key:'owner',checkpoint_persistence:mode});
const observe={type:'OBSERVE',request_id:1,rgb:new Uint8Array([0]),width:1,height:1,frame_hash:'frame',snapshot_hash:'snapshot',observed_at:1};
for(const initial of [null,seed]) {
 test(`ephemeral inference and explicit checkpoint capture never persist (${initial?'existing':'empty'} store)`,async()=>{
  const r=runtime(initial);
  assert.equal((await r.send(init('ephemeral'))).checkpoint_restored,!!initial);
  const before=await r.send({type:'SAVE_CHECKPOINT',request_id:2});
  assert.equal(before.type,'CHECKPOINT_SAVED');
  assert.equal((await r.send(observe)).type,'ACTIVITY');
  const after=await r.send({type:'SAVE_CHECKPOINT',request_id:3});
  assert.notEqual(after.payload.hash,before.payload.hash,'in-memory brain genuinely advanced');
  assert.equal(r.writes,0,'no persistence before cancellation, failed submission or success');
  assert.deepEqual(r.saved,initial);
  const restored=runtime(r.saved);await restored.send(init('normal'));
  const snapshot=await restored.send({type:'SAVE_CHECKPOINT',request_id:4});
  assert.equal(snapshot.payload.brain_ms,initial?700:0,'next personal run must not restore transient Colony state');
 });
}
test('normal autonomy still persists observations and explicit saves',async()=>{
 const r=runtime(seed);await r.send(init('normal'));await r.send(observe);
 assert.equal(r.writes,1);assert.equal(r.saved.meta.brain_ms,800);
 await r.send({type:'SAVE_CHECKPOINT',request_id:2});assert.equal(r.writes,2);
});
test('invalid ephemeral input errors without altering personal storage',async()=>{
 const r=runtime(seed);await r.send(init('ephemeral'));
 const result=await r.send({...observe,frame_hash:'invalid'});
 assert.equal(result.type,'ERROR');assert.equal(r.writes,0);assert.deepEqual(r.saved,seed);
});

for(const initial of [null,seed])test(`stale runtimes cannot overwrite checkpoints; restart recovers (${initial?'existing':'empty'} store)`,async()=>{
 const shared={persisted:initial},a=runtime(null,shared),b=runtime(null,shared);
 await a.send(init('normal'));await b.send(init('normal'));
 await a.send(observe);await a.send(observe);const latest=structuredClone(a.saved);
 assert.equal((await b.send({type:'SAVE_CHECKPOINT',request_id:2})).type,'ERROR');
 assert.deepEqual(shared.persisted,latest);
 assert.equal((await b.send(observe)).type,'ERROR');assert.deepEqual(shared.persisted,latest);
 await b.send(init('normal'));assert.equal((await b.send(observe)).type,'ACTIVITY');
 assert.equal(shared.persisted.meta.brain_ms,latest.meta.brain_ms+100);
});
