import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { federation, digest } from '../worker/src/federation.mjs';
import { createFlyIdentity, signManifest } from '../pages/fly-identity.js';
import { createColonyClient } from '../pages/colony-client.js';
async function setup(t) {
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-01-01',d1Databases:['DB']}));t.after(()=>mf.dispose());
 const DB=await mf.getD1Database('DB');
 await DB.exec((await readFile(new URL('../worker/schema.sql',import.meta.url),'utf8')).replace(/\n/g,' '));
 for(const file of ['0008_federation.sql','0009_colony_tasks.sql']) {
  const sql=await readFile(new URL('../worker/migrations/'+file,import.meta.url),'utf8');
  await DB.exec(sql.replace(/\n/g,' '));
 }
 const env={DB};
 const call=async(path,body,user='alice',method=body===undefined?'GET':'POST')=>{
  const r=await federation(new Request('https://test'+path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})}),env,user?{id:user}:null,path);
  return {status:r?.status,body:r?await r.json():null};
 };
 const identities={};
 async function register(user) {
  await DB.prepare('INSERT INTO users(id,nickname,token_hash,created_at,last_seen_at) VALUES(?,?,?,?,?)').bind(user,user,user,Date.now(),Date.now()).run();
  const id=await createFlyIdentity({getItem(){return null},setItem(){}},{genesis_model_hash:'a'.repeat(64)});identities[user]=id;
  const proof=await signManifest(id,{owner_user_id:user,checkpoint_hash:'b'.repeat(64),sequence:0});
  const r=await call('/api/federation/fly-manifest',proof,user);assert.equal(r.status,201,JSON.stringify(r));return proof;
 }
 return {env,call,register,identities};
}
test('authenticated signed colony creation pins its owner and persists membership',async t=>{
 const {env,call,register,identities}=await setup(t);const registered=await register('alice');
 assert.equal((await call('/api/colony',{},null)).status,401);
 const proof=await signManifest(identities.alice,{owner_user_id:'alice',checkpoint_hash:registered.checkpoint_hash,sequence:0,purpose:'colony-create',quorum:0.5});
 const made=await call('/api/colony',{quorum:0.5,proof});assert.equal(made.status,201,JSON.stringify(made));
 const row=await env.DB.prepare('SELECT * FROM colonies WHERE colony_id=?').bind(made.body.colony_id).first();assert.equal(row.owner_user_id,'alice');
 const read=await call('/api/colony/'+made.body.colony_id);assert.equal(read.body.members[0].fly_id,registered.fly_id);
 assert.equal((await call('/api/colony',{quorum:0.75,proof})).status,422);
});

async function colonyFixture(t) {
 const x=await setup(t);await x.register('alice');await x.register('bob');await x.register('carol');
 const proof=async(user,extra)=>signManifest(x.identities[user],{owner_user_id:user,checkpoint_hash:'b'.repeat(64),sequence:0,...extra});
 const created=await x.call('/api/colony',{quorum:0.75,proof:await proof('alice',{purpose:'colony-create',quorum:0.75})});
 const id=created.body.colony_id;
 const join=async(user)=>x.call(`/api/colony/${id}/join`,{proof:await proof(user,{purpose:'colony-join',colony_id:id})},user);
 return {...x,id,proof,join};
}
test('joining is explicit signed enrollment; tasks freeze membership and server market data',async t=>{
 const {env,call,id,proof,join}=await colonyFixture(t);
 assert.equal((await join('bob')).status,201);
 assert.equal((await join('bob')).status,200);
 assert.equal((await call(`/api/colony/${id}/join`,{proof:await proof('carol',{purpose:'colony-join',colony_id:'wrong'})},'carol')).status,422);
 const oldFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=oldFetch});let fetched=0;
 globalThis.fetch=async()=>{fetched++;const end=Math.floor(Date.now()/60000)*60-60;return Response.json({error:[],result:{XBTUSD:Array.from({length:40},(_,i)=>[end-(39-i)*60,'100','102','99','101','100',10,1])}})};
 assert.equal((await call(`/api/colony/${id}/tasks`,{symbol:'BTCUSD',duration_ms:60000,snapshot:{price:1}})).status,422);
 assert.equal((await call(`/api/colony/${id}/tasks`,{symbol:'BTCUSD',duration_ms:60000},'bob')).status,403);
 const made=await call(`/api/colony/${id}/tasks`,{symbol:'BTCUSD',duration_ms:60000});assert.equal(made.status,201,JSON.stringify(made));assert.equal(fetched,1);
 const task=made.body;assert.equal(task.snapshot.bars.length,40);assert.equal(task.snapshot.bars[0].close,101);assert.equal(task.snapshot_hash,await digest(task.snapshot));assert.equal(task.members.length,2);assert.equal(task.required,2);
 assert.equal((await join('carol')).status,201);
 const got=await call(`/api/colony/tasks/${task.task_id}`);assert.deepEqual(got.body,task);
 assert.equal((await call(`/api/colony/tasks/${task.task_id}`,undefined,'carol')).status,403);
 const saved=await env.DB.prepare('SELECT snapshot_hash FROM colony_tasks WHERE task_id=?').bind(task.task_id).first();assert.equal(saved.snapshot_hash,task.snapshot_hash);
});

async function taskFixture(t,duration_ms=60000){
 const x=await colonyFixture(t);await x.join('bob');
 const oldFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=oldFetch});
 globalThis.fetch=async()=>{const end=Math.floor(Date.now()/60000)*60-60;return Response.json({error:[],result:{XBTUSD:Array.from({length:40},(_,i)=>[end-(39-i)*60,'100','102','99','101','100',10,1])}})};
 const made=await x.call(`/api/colony/${x.id}/tasks`,{symbol:'BTCUSD',duration_ms});assert.equal(made.status,201);
 const task=made.body;
 const ballot=async(user,action,extra={})=>x.proof(user,{purpose:'colony-vote',task_id:task.task_id,snapshot_hash:task.snapshot_hash,action,...extra});
 return {...x,task,ballot};
}
test('signed ballots reject forgery, nonmembers, duplicates, binding errors and stale tasks',async t=>{
 const {env,call,task,ballot}=await taskFixture(t);
 const path=`/api/colony/tasks/${task.task_id}/votes`;
 assert.equal((await call(path,await ballot('alice','CLOSE'),'bob')).status,403);
 assert.equal((await call(path,await ballot('carol','BUY'),'carol')).status,403);
 for(const body of [null,{},await ballot('alice','WAIT'),await ballot('alice','BUY',{snapshot_hash:'0'.repeat(64)}),await ballot('alice','BUY',{task_id:'other'}),await ballot('alice','BUY',{checkpoint_hash:'bad'}),{...await ballot('alice','BUY'),action:'SELL'}]) {
  const r=await call(path,body);assert.equal(r.status,422,JSON.stringify(r));
 }
 const signed=await ballot('alice','CLOSE');assert.equal((await call(path,signed)).status,201);
 assert.equal((await call(path,signed)).status,409);
 assert.equal((await call(`/api/colony/tasks/${task.task_id}/finalize`,{})).status,409);
 const racing=await Promise.all([call(path,await ballot('bob','CLOSE'),'bob'),call(path,await ballot('bob','BUY'),'bob')]);assert.deepEqual(racing.map(x=>x.status).sort(),[201,409]);
 const done=await Promise.all([call(`/api/colony/tasks/${task.task_id}/finalize`,{}),call(`/api/colony/tasks/${task.task_id}/finalize`,{},'bob')]);assert.equal(done[0].status,200);assert.deepEqual(done[0],done[1]);
 assert.equal(done[0].body.status,'FINALIZED');assert.equal(done[0].body.result.total,2);assert.equal(done[0].body.result_hash,await digest(done[0].body.result));
 assert.equal((await call(path,await ballot('alice','BUY'))).status,409);
 assert.deepEqual((await call(`/api/colony/tasks/${task.task_id}`)).body,done[0].body);
 await assert.rejects(env.DB.prepare("UPDATE colony_votes SET action='SELL' WHERE task_id=?").bind(task.task_id).run(),/immutable/);
 await assert.rejects(env.DB.prepare("DELETE FROM colony_votes WHERE task_id=?").bind(task.task_id).run(),/immutable/);
 await assert.rejects(env.DB.prepare("UPDATE colony_tasks SET result_json='{}' WHERE task_id=?").bind(task.task_id).run(),/immutable/);
 await assert.rejects(env.DB.prepare("UPDATE colony_tasks SET snapshot_hash='spoof' WHERE task_id=?").bind(task.task_id).run(),/immutable/);
});
test('deadline finalization persists zero-participation NO_QUORUM and rejects late ballots',async t=>{
 const {call,task,ballot}=await taskFixture(t,1000);
 await new Promise(r=>setTimeout(r,1100));
 assert.equal((await call(`/api/colony/tasks/${task.task_id}/votes`,await ballot('alice','BUY'))).status,409);
 const done=await call(`/api/colony/tasks/${task.task_id}/finalize`,{});assert.equal(done.status,200,JSON.stringify(done));assert.equal(done.body.result.status,'NO_QUORUM');assert.equal(done.body.result.action,'HOLD');assert.equal(done.body.result.total,0);
 assert.deepEqual(await call(`/api/colony/tasks/${task.task_id}/finalize`,{}),done);
});
test('unanimous CLOSE and a tie produce persisted majority and HOLD outcomes',async t=>{
 const {call,task,ballot}=await taskFixture(t);
 for(const user of ['alice','bob'])assert.equal((await call(`/api/colony/tasks/${task.task_id}/votes`,await ballot(user,'CLOSE'),user)).status,201);
 const done=await call(`/api/colony/tasks/${task.task_id}/finalize`,{});assert.equal(done.body.result.action,'CLOSE');assert.equal(done.body.result.status,'FINALIZED');assert.equal(done.body.result.counts.CLOSE,2);
});

test('manifest ownership is pinned across sequences and malformed manifests fail closed',async t=>{
 const {call,register,identities}=await setup(t);await register('alice');await register('bob');
 const stolen=await signManifest(identities.alice,{owner_user_id:'bob',checkpoint_hash:'c'.repeat(64),sequence:1});
 assert.equal((await call('/api/federation/fly-manifest',stolen,'bob')).status,403);
 for(const body of [null,[],{owner_public_key:null}])assert.equal((await call('/api/federation/fly-manifest',body)).status,422);
 const legitimate=await signManifest(identities.alice,{owner_user_id:'alice',checkpoint_hash:'c'.repeat(64),sequence:1});assert.equal((await call('/api/federation/fly-manifest',legitimate)).status,201);
});
test('real browser client signed votes pass D1 service validation and fetch immutable result (fixture inference)',async t=>{
 const x=await taskFixture(t);const map=new Map();map.set(`defly.colony.sequence:alice:${x.identities.alice.fly_id}`,'1');
 const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
 const api=async(path,options={})=>{if(path==='/api/state')return {user:{id:'alice'}};const r=await x.call(path,options.body);if(r.status>=400)throw Error(r.body.error);return r.body;};
 let inferred=0;const client=createColonyClient({api,identity:x.identities.alice,storage,withBrain:async fn=>fn({saveCheckpoint:async()=>({hash:'c'.repeat(64)}),infer:async frame=>{assert.equal(frame.snapshot_hash,x.task.snapshot_hash);inferred++;return {decoder:{proposed_action:'BUY'}}}})});
 const joined=await client.join(x.id,{consent:true});assert.equal(joined.colony_id,x.id);
 const accepted=await client.vote(x.task.task_id);assert.equal(accepted.accepted,true);assert.equal(inferred,1);
 const dbvote=await x.env.DB.prepare('SELECT * FROM colony_votes WHERE task_id=? AND member_user_id=?').bind(x.task.task_id,'alice').first();assert.equal(dbvote.action,'BUY');assert.equal(dbvote.checkpoint_hash,'c'.repeat(64));
 await x.call(`/api/colony/tasks/${x.task.task_id}/votes`,await x.ballot('bob','BUY'),'bob');const final=await client.finalize(x.task.task_id);assert.equal(final.result.action,'BUY');assert.equal(final.result_hash,await digest(final.result));assert.deepEqual(await client.open(x.task.task_id),final);
});

test('a persisted split vote is HOLD, not plurality winner',async t=>{
 const {call,task,ballot}=await taskFixture(t);
 assert.equal((await call(`/api/colony/tasks/${task.task_id}/votes`,await ballot('alice','BUY'))).status,201);
 assert.equal((await call(`/api/colony/tasks/${task.task_id}/votes`,await ballot('bob','SELL'),'bob')).status,201);
 const done=await call(`/api/colony/tasks/${task.task_id}/finalize`,{});assert.equal(done.body.result.action,'HOLD');assert.equal(done.body.result.status,'HOLD');
});
