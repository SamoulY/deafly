import test from 'node:test';
import assert from 'node:assert/strict';
import {createLive,receiveLive,tickLive,acceptLive} from '../worker/src/flydesk-live-core.mjs';
import {FlydeskLive} from '../worker/src/flydesk-live.mjs';
const start=1800000000000;
const bars=Array.from({length:60},(_,i)=>({time:start/1000-3600+i*60,open:100,high:101,low:99,close:100,volume:10}));
function quote(s,now,sequence=1){receiveLive(s,{type:'heartbeat',product_id:'BTC-USD'},now);receiveLive(s,{type:'ticker',product_id:'BTC-USD',sequence,time:new Date(now).toISOString(),best_ask:'100',best_bid:'99'},now);}
async function setup(){const s=createLive('live','a',start);quote(s,start);await tickLive(s,start,bars);assert.equal(s.status,'ACTIVE');return s;}
test('live fill uses first new post-latency quote, persists intent and never replays an old quote',async()=>{
 const s=await setup(),b={step:0,action:'BUY',idempotency_key:'x'};acceptLive(s,b,start+100);assert.equal(s.records.length,0);const saved=JSON.parse(JSON.stringify(s));quote(saved,start+200,2);assert.equal(saved.records.length,0);quote(saved,start+350,3);assert.equal(saved.records.length,1);assert.equal(saved.records[0].executed_at,start+350);assert.equal(saved.records[0].fill.policy,'POST_SUBMIT_QUOTE');const cash=saved.account.cash;acceptLive(saved,b,start+400);assert.equal(saved.account.cash,cash);assert.throws(()=>acceptLive(saved,{...b,action:'SELL'},start+400),/IDEMPOTENCY/);
});
test('expiry keeps intent, timeout has no human HOLD label, stale feed invalidates the round',async()=>{
 const s=await setup();acceptLive(s,{step:0,action:'BUY',idempotency_key:'x'},start+100);quote(s,start+5200,2);await tickLive(s,start+5200);assert.equal(s.records[0].execution_status,'EXPIRED_NO_QUOTE');assert.equal(s.records[0].human_action,'BUY');assert.equal(s.records[0].eligible,false);assert.equal(s.account.cash,'10000.00000000');
 const timeout=await setup();quote(timeout,start+30001,2);await tickLive(timeout,start+30001);assert.equal(timeout.records[0].source,'TIMEOUT');assert.equal(timeout.records[0].human_action,null);await tickLive(timeout,start+41002);assert.equal(timeout.status,'DATA_INVALID');
});
test('unrelated, duplicate and out-of-order market messages cannot execute an order',async()=>{
 const s=await setup();acceptLive(s,{step:0,action:'BUY',idempotency_key:'x'},start+100);receiveLive(s,{type:'ticker',product_id:'ETH-USD',sequence:2,time:new Date(start+500).toISOString(),best_ask:'100',best_bid:'99'},start+500);quote(s,start+500,1);assert.equal(s.records.length,0);assert.equal(s.pending.action,'BUY');
});

test('Durable Object records survive eviction without exceeding the per-value storage limit',async()=>{
 const values=new Map();let ready;
 const ctx={blockConcurrencyWhile(fn){ready=fn();},storage:{
  async get(key){return structuredClone(values.get(key));},
  async put(key,value){const entries=typeof key==='string'?[[key,value]]:Object.entries(key);for(const [k,v] of entries){assert.ok(Buffer.byteLength(JSON.stringify(v))<128*1024);values.set(k,structuredClone(v));}},
  async setAlarm(){}
 }};
 const first=new FlydeskLive(ctx,{});await ready;
 first.state=createLive('persisted','owner',start);first.state.status='ABORTED';
 first.state.records=Array.from({length:12},(_,i)=>({step:i,payload:'x'.repeat(16000)}));
 await first.persist();assert.equal(values.get('state').records,undefined);assert.equal(values.size,13);
 const restored=new FlydeskLive(ctx,{});await ready;
 assert.deepEqual(restored.state.records,first.state.records);
 restored.state.records.push({step:12,source:'SYSTEM'});await restored.persist();
 const again=new FlydeskLive(ctx,{});await ready;
 assert.equal(again.state.records.length,13);assert.equal(again.state.records[12].source,'SYSTEM');
});
