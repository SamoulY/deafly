import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../worker/src/index.mjs';
const hash = x => createHash('sha256').update(x).digest('hex');
const candles = [{time: 1700000000, open: 100, high: 102, low: 99, close: 101, volume: 2}];
function record() {
  const snapshot_hash = hash(JSON.stringify(candles));
  return {scope:'public_market', backend:'stonkfly-full-native-v1', neurons:166700, edges:25582938, plastic_edges:7835,
    manifest_hash:'a'.repeat(64), checkpoint_hash:'b'.repeat(64), memory_hash:'c'.repeat(64), snapshot_hash,
    frame_hash:hash('vision-v2:'+snapshot_hash), observed_at:Date.now(), symbol:'BTCUSD', source:'kraken-public', candles,
    activity:{node_ids:['1','2'],event_counts:[0,3],simulated_ms:500,total_events:3}};
}
function env(payload=null) {
  const writes=[];
  return {NATIVE_RUNNER_KEY:'secret', writes, DB:{prepare(sql){return {bind(...args){this.args=args;return this;}, async first(){return sql.includes('FROM users') ? {id:'user-1'} : payload===null ? null : {payload_json:typeof payload==='string'?payload:JSON.stringify(payload)};}, async run(){writes.push(this.args);return {success:true};}};}}};
}
const publish=(body,e,key='secret')=>worker.fetch(new Request('https://test/api/native/publish',{method:'POST',headers:{'X-Native-Runner-Key':key,'Content-Type':'application/json'},body:JSON.stringify(body)}),e,{});
const read=e=>worker.fetch(new Request('https://test/api/observation',{headers:{'X-Session-Token':'session'}}),e,{});
test('valid public activity publishes and round trips without private extra fields',async()=>{
  const b=record(); b.private_learning={secret:'never publish'}; const e=env();
  assert.equal((await publish(b,e)).status,200); assert.equal(e.writes.length,1);
  const stored=JSON.parse(e.writes[0][8]); assert.equal(stored.private_learning,undefined);
  const out=await (await read(env(stored))).json(); assert.equal(out.truth_status,'real_full_kernel'); assert.deepEqual(out.activity,b.activity);
});
test('runner key remains required',async()=>assert.equal((await publish(record(),env(),'wrong')).status,401));
const invalid={
  'missing activity':b=>delete b.activity,
  'null payload':()=>null,
  'missing scope':b=>delete b.scope,
  'private scope':b=>b.scope='user',
  'short hash':b=>b.memory_hash='abc',
  'nonhex hash':b=>b.manifest_hash='z'.repeat(64),
  'wrong snapshot':b=>b.snapshot_hash='d'.repeat(64),
  'wrong frame':b=>b.frame_hash='d'.repeat(64),
  'mutated candles':b=>b.candles=[{...candles[0],close:100}],
  'missing candles':b=>delete b.candles,
  'seconds timestamp':b=>b.observed_at=Math.floor(Date.now()/1000),
  'stale timestamp':b=>b.observed_at=Date.now()-120001,
  'future timestamp':b=>b.observed_at=Date.now()+60000,
  'string timestamp':b=>b.observed_at=String(Date.now()),
  'empty nodes':b=>b.activity.node_ids=[],
  'duplicate nodes':b=>b.activity.node_ids=['1','1'],
  'numeric node':b=>b.activity.node_ids=[1,'2'],
  'empty node':b=>b.activity.node_ids=['','2'],
  'mismatched arrays':b=>b.activity.event_counts=[3],
  'negative count':b=>b.activity.event_counts=[-1,4],
  'fractional count':b=>b.activity.event_counts=[0.5,2.5],
  'string count':b=>b.activity.event_counts=['0',3],
  'nonfinite count':b=>b.activity.event_counts=[Infinity,3],
  'inconsistent total':b=>b.activity.total_events=2,
  'nonfinite duration':b=>b.activity.simulated_ms=Infinity,
  'zero duration':b=>b.activity.simulated_ms=0,
};
for(const [name,mutate] of Object.entries(invalid))test('reject '+name,async()=>{
  let b=record(); const changed=mutate(b); if(changed===null)b=null;
  const e=env(); assert.equal((await publish(b,e)).status,422);assert.equal(e.writes.length,0);
});
test('missing, corrupt, stale and unbound records are not published as trusted full-kernel activity',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:[],result:{XXBTZUSD:Array.from({length:40},(_,i)=>[(Math.floor(Date.now()/60000)-40+i)*60,'100','102','99','101','101','2',1])}})));
  for(const payload of [null,'{', {...record(),observed_at:Date.now()-120001},{...record(),snapshot_hash:'d'.repeat(64)}, {...record(),activity:null}, {...record(),scope:undefined}]){
    const out=await (await read(env(payload))).json();assert.equal(out.truth_status,'market_input_only');assert.equal(out.backend,'market-snapshot-v1');assert.equal(out.activity,undefined);
  }
});
test('invalid JSON is a validation error',async()=>{
  const r=new Request('https://test/api/native/publish',{method:'POST',headers:{'X-Native-Runner-Key':'secret'},body:'{'});
  assert.equal((await worker.fetch(r,env(),{})).status,422);
});
