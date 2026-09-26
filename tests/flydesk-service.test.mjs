import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handleFlydesk,resolvePending} from '../worker/src/flydesk.mjs';
import {lockIntent} from '../worker/src/flydesk-broker.mjs';
import {initialState,advance} from '../worker/src/flydesk-core.mjs';
import {handleFlydeskTraining,runFlydeskTrainingJobs} from '../worker/src/flydesk-training-service.mjs';
async function setup(t){const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-01-01',d1Databases:['DB']}));t.after(()=>mf.dispose());const DB=await mf.getD1Database('DB');await DB.exec('CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ("alice"),("bob");');for(const f of ['0004_raising.sql','0009_flydesk.sql','0011_flydesk_datasets.sql'])await DB.exec((await readFile(new URL('../worker/migrations/'+f,import.meta.url),'utf8')).replace(/^--.*$/gm,''));const start=(Math.floor(Date.now()/60000)-200)*60;return {DB,FLYDESK_TEST_MODE:'local-only',FLYDESK_TEST_HISTORY:Array.from({length:120},(_,i)=>({time:start+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:10}))};}
const call=(e,path,body,user='alice')=>handleFlydesk(new Request('https://test/api/flydesk/'+path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),e,{id:user});
test('spot round is private, immutable, retry-safe, skip is not a label, analysis survives replay and synthetic earns nothing',async t=>{
 const e=await setup(t);await call(e,'profile');let s=await(await call(e,'sessions',{})).json();assert.equal(s.rules_version,'flydesk-spot-v1');assert.equal(s.bars.length,60);assert.deepEqual(s.observation.action_mask,['BUY','HOLD']);assert.equal((await call(e,`sessions/${s.id}`,undefined,'bob')).status,404);
 const analysis={timeframe:300,drawings:[{id:'a',tool:'horizontal_line',anchors:[{time:s.bars[0].time,price:101}]}]};assert.equal((await call(e,`sessions/${s.id}/analysis`,analysis)).status,200);
 const body={action:'BUY',step:0,idempotency_key:'first'};s=await(await call(e,`sessions/${s.id}/actions`,body)).json();assert.equal(s.step,1);assert.equal(s.bars.length,65);assert.ok(Number(s.account.cash)>=9000);
 assert.equal((await(await call(e,`sessions/${s.id}/actions`,body)).json()).step,1);assert.equal((await call(e,`sessions/${s.id}/actions`,{...body,action:'SELL'})).status,409);
 await call(e,`sessions/${s.id}/analysis`,{timeframe:60,drawings:[]});
 for(let step=1;step<12;step++)s=await(await call(e,`sessions/${s.id}/actions`,{action:step===1?'SKIP':'HOLD',step,idempotency_key:'key'+step})).json();
 assert.equal(s.status,'COMPLETED');assert.equal(s.account.quantity,'0.00000000');assert.equal(s.reward_points,0);
 const review=await(await call(e,`sessions/${s.id}/review`)).json();assert.equal(review.demonstrations[0].analysis.drawings.length,1);assert.equal(review.demonstrations[1].source,'SKIP');assert.equal(review.demonstrations[1].human_action,null);assert.equal(review.demonstrations[1].eligible,false);assert.equal(review.system_actions[0].executed_action,'SYSTEM_LIQUIDATION');
 assert.equal((await call(e,`sessions/${s.id}/export`)).headers.get('content-type'),'application/x-ndjson');
 await assert.rejects(e.DB.prepare('UPDATE flydesk_demonstrations SET record_json=?').bind('{}').run(),/immutable/);
});
test('committed intent recovers after interruption and concurrent submissions have one business effect',async t=>{
 const e=await setup(t);let s=await(await call(e,'sessions',{})).json();const result=await Promise.all([call(e,`sessions/${s.id}/actions`,{step:0,action:'BUY',idempotency_key:'a'}),call(e,`sessions/${s.id}/actions`,{step:0,action:'HOLD',idempotency_key:'b'})]);assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
 let row=await e.DB.prepare('SELECT * FROM flydesk_sessions WHERE id=?').bind(s.id).first();const p=JSON.parse(row.state_json).account,intent=lockIntent(p,'HOLD','100');await e.DB.prepare('INSERT INTO flydesk_intents VALUES (?,?,?,?,?,?,?)').bind(s.id,1,'recovery','{}',JSON.stringify(intent),Date.now(),'PENDING').run();await resolvePending(e.DB,row);await resolvePending(e.DB,row);
 s=await(await call(e,`sessions/${s.id}`)).json();assert.equal(s.step,2);assert.equal((await e.DB.prepare('SELECT COUNT(*) n FROM flydesk_demonstrations').first()).n,2);
});
test('dataset import requires admin, chunks large history, and refuses held-out historical tasks',async t=>{
 const e=await setup(t);e.ADMIN_USER_IDS='alice';const base=(Math.floor(Date.now()/60000)-5000)*60,bars=Array.from({length:4000},(_,i)=>({time:base+i*60,open:100,high:101,low:99,close:100,volume:10})),body={symbol:'BTCUSD',bars};
 assert.equal((await call(e,'datasets',body,'bob')).status,403);const r=await call(e,'datasets',body);assert.equal(r.status,201);const {manifest}=await r.json();assert.equal(manifest.count,4000);assert.equal((await e.DB.prepare('SELECT COUNT(*) n FROM flydesk_dataset_chunks').first()).n,4);
 let s=await(await call(e,'sessions',{symbol:'BTCUSD',dataset_id:manifest.id,as_of:bars[200].time+60})).json();assert.equal(s.bars.length,201);assert.ok(s.bars.every(b=>b.time+60<=s.as_of));assert.equal(s.reward_eligible,false);await call(e,`sessions/${s.id}/abort`,{});
 assert.equal((await call(e,'sessions',{symbol:'BTCUSD',dataset_id:manifest.id,as_of:bars[3500].time+60})).status,422);
});
test('real spot trajectories train a private checkpoint and activation/restore route never accepts another owner',async t=>{
 const e=await setup(t);
 for(let session=0;session<10;session++){
   const start=1600000020+session*12000,bars=Array.from({length:120},(_,i)=>({time:start+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:10})),row={id:'train'+session,step:0,data_json:JSON.stringify({warmup:60,bars,provenance:{provider:'scripted-integration-fixture',synthetic:false,data_complete:true,training_verified:true}}),state_json:JSON.stringify(initialState(start))};
   const statements=[e.DB.prepare("INSERT INTO flydesk_sessions(id,user_id,status,created_at,symbol,scenario_family,data_json,state_json) VALUES (?,'alice','COMPLETED',1,'BTCUSD',?,?,?)").bind(row.id,row.id,row.data_json,row.state_json)];
   for(;row.step<12;row.step++){const p=JSON.parse(row.state_json).account,action=row.step%2?'SELL':'BUY',intent=lockIntent(p,action,String(bars[59+row.step*5].close)),next=await advance(row,{intent_json:JSON.stringify(intent),accepted_at:1});statements.push(e.DB.prepare('INSERT INTO flydesk_demonstrations VALUES (?,?,?,?,?)').bind(row.id,row.step,'k'+row.step,'{}',JSON.stringify(next.record)));row.state_json=JSON.stringify(next.state);}
   await e.DB.batch(statements);
 }
 const train=(path,body,user='alice')=>handleFlydeskTraining(new Request('https://test/api/flydesk/'+path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),e,{id:user});
 const listing=await(await train('training')).json();assert.equal(listing.eligibility.eligible_count,120);
 assert.equal((await train('training',{idempotency_key:'train'})).status,202);await runFlydeskTrainingJobs(e);const job=await e.DB.prepare('SELECT * FROM flydesk_training_jobs').first();assert.equal(job.status,'COMPLETED',job.error);
 const version=await e.DB.prepare('SELECT id FROM flydesk_versions WHERE training_id=?').bind(job.id).first(),path='versions/'+encodeURIComponent(version.id)+'/activate';assert.equal((await train(path,{},'bob')).status,404);assert.equal((await train(path,{})).status,200);assert.equal((await train('versions/0/activate',{})).status,200);
});
