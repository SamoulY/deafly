import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {federation,digest} from '../worker/src/federation.mjs';
import {createFlyIdentity,signManifest} from '../pages/fly-identity.js';
async function setup(t){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-01-01',d1Databases:['DB']}));t.after(()=>mf.dispose());const DB=await mf.getD1Database('DB');
 await DB.exec((await readFile(new URL('../worker/schema.sql',import.meta.url),'utf8')).replace(/\n/g,' '));
 for(const f of ['0008_federation.sql','0009_colony_tasks.sql','0010_colony_auto.sql'])await DB.exec((await readFile(new URL('../worker/migrations/'+f,import.meta.url),'utf8')).replace(/\n/g,' '));
 const env={DB};const call=async(path,body,user='alice')=>{const r=await federation(new Request('https://test'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})}),env,user?{id:user}:null,path);return {status:r?.status,body:r?await r.json():null};};
 const ids={};const proof=async(user,extra={})=>signManifest(ids[user],{owner_user_id:user,checkpoint_hash:'b'.repeat(64),sequence:0,...extra});
 async function register(user){await DB.prepare('INSERT INTO users(id,nickname,token_hash,created_at,last_seen_at) VALUES(?,?,?,?,?)').bind(user,user,user,Date.now(),Date.now()).run();ids[user]=await createFlyIdentity({getItem(){return null},setItem(){}},{genesis_model_hash:'a'.repeat(64)});assert.equal((await call('/api/federation/fly-manifest',await proof(user),user)).status,201);}
 const enroll=async user=>call('/api/colony/auto/enroll',{proof:await proof(user,{purpose:'colony-auto-enroll',consent:true})},user);
 return {DB,env,call,ids,proof,register,enroll};
}
test('automatic enrollment requires signed explicit consent and registered pinned own identity',async t=>{
 const x=await setup(t);await x.register('alice');await x.register('bob');
 assert.equal((await x.call('/api/colony/auto/enroll',{},null)).status,401);
 const made=await x.enroll('alice');assert.equal(made.status,201,JSON.stringify(made));assert.equal(made.body.colony_id,'defly-default-v1');
 assert.equal((await x.enroll('alice')).status,200);
 assert.equal((await x.call('/api/colony/auto/enroll',{proof:await x.proof('alice',{purpose:'colony-auto-enroll',consent:true})},'bob')).status,403);
 assert.equal((await x.call('/api/colony/auto/enroll',{proof:await x.proof('bob',{purpose:'colony-auto-enroll'})},'bob')).status,422);
 assert.equal((await x.call('/api/colony/auto/enroll',{proof:{...await x.proof('bob',{purpose:'colony-auto-enroll',consent:true}),consent:false}},'bob')).status,422);
 x.ids.carol=await createFlyIdentity({getItem(){return null},setItem(){}},{genesis_model_hash:'a'.repeat(64)});assert.equal((await x.enroll('carol')).status,403);
 const results=await Promise.all([x.enroll('bob'),x.enroll('bob')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);
 const first=x.ids.alice; x.ids.alice=await createFlyIdentity({getItem(){return null},setItem(){}},{genesis_model_hash:'a'.repeat(64)});assert.equal((await x.call('/api/federation/fly-manifest',await x.proof('alice'))).status,201);assert.equal((await x.enroll('alice')).status,409);x.ids.alice=first;
 assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM colony_members').first()).n,2);
});

async function market(t){const prior=globalThis.fetch;t.after(()=>{globalThis.fetch=prior});let fetched=0;globalThis.fetch=async()=>{fetched++;const end=Math.floor(Date.now()/60000)*60-60;return Response.json({error:[],result:{XBTUSD:Array.from({length:40},(_,i)=>[end-(39-i)*60,'100','102','99','101','100',10,1])}})};return ()=>fetched;}
test('automatic dispatch shares one frozen snapshot, idempotent claims, excludes late members and bounds generation',async t=>{
 const x=await setup(t),fetched=await market(t);for(const u of ['alice','bob','carol'])await x.register(u);await x.enroll('alice');await x.enroll('bob');
 assert.equal((await x.call('/api/colony/auto/next',{},'carol')).status,403);
 assert.equal((await x.call('/api/colony/auto/next',{quorum:0.01})).status,422);
 const first=await x.call('/api/colony/auto/next',{});assert.equal(first.status,200,JSON.stringify(first));const task=first.body.task;assert.equal(task.members.length,2);assert.equal(task.snapshot_hash,await digest(task.snapshot));
 const concurrent=await Promise.all(Array.from({length:8},()=>x.call('/api/colony/auto/next',{})));for(const r of concurrent){assert.equal(r.body.task.task_id,task.task_id);assert.equal(r.body.claim.claim_id,first.body.claim.claim_id);}
 const bob=await x.call('/api/colony/auto/next',{},'bob');assert.equal(bob.body.task.task_id,task.task_id);assert.notEqual(bob.body.claim.claim_id,first.body.claim.claim_id);
 await x.enroll('carol');const late=await x.call('/api/colony/auto/next',{},'carol');assert.equal(late.body.task,null);assert.equal(late.body.waiting_reason,'NEXT_ROUND');assert.equal((await x.call('/api/colony/tasks/'+task.task_id,undefined,'carol')).status,403);
 for(const u of ['alice','bob'])assert.equal((await x.call('/api/colony/tasks/'+task.task_id+'/votes',await x.proof(u,{purpose:'colony-vote',task_id:task.task_id,snapshot_hash:task.snapshot_hash,action:'BUY'}),u)).status,201);
 const next=await x.call('/api/colony/auto/next',{});assert.equal(next.body.waiting_reason,'RATE_LIMITED');const done=await x.call('/api/colony/tasks/'+task.task_id);assert.equal(done.body.result.total,2);assert.equal(done.body.result.member_count,2);assert.equal(done.body.result_hash,await digest(done.body.result));assert.equal(fetched(),1);
 await x.DB.prepare('UPDATE colony_auto_dispatch SET next_attempt_at=0').run();
 const races=await Promise.all(Array.from({length:8},()=>x.call('/api/colony/auto/next',{},'carol')));assert.ok(races.some(r=>r.body.task));const current=await x.call('/api/colony/auto/next',{},'carol');assert.equal(current.body.task.members.length,3);assert.equal(current.body.task.required,2);assert.equal(fetched(),2);assert.equal((await x.DB.prepare("SELECT COUNT(*) AS n FROM colony_tasks WHERE status='OPEN'").first()).n,1);
 await assert.rejects(x.DB.prepare('DELETE FROM colony_task_claims').run(),/immutable/);
});
test('explicit recovery returns an accepted signed one-member ballot after lost response and finalization',async t=>{
 const x=await setup(t),fetched=await market(t);await x.register('alice');await x.enroll('alice');
 const first=(await x.call('/api/colony/auto/next',{})).body,task=first.task;
 // The server accepts the signature, but the client loses the response and vote ID.
 assert.equal((await x.call('/api/colony/tasks/'+task.task_id+'/votes',await x.proof('alice',{purpose:'colony-vote',task_id:task.task_id,snapshot_hash:task.snapshot_hash,action:'BUY'}))).status,201);
 const accepted=await x.DB.prepare('SELECT vote_id,action,checkpoint_hash FROM colony_votes WHERE task_id=?').bind(task.task_id).first();
 const ordinary=await x.call('/api/colony/auto/next',{});assert.equal(ordinary.body.task,null);assert.equal(ordinary.body.waiting_reason,'RATE_LIMITED');
 assert.equal((await x.call('/api/colony/tasks/'+task.task_id)).body.status,'FINALIZED');
 const recovered=await x.call('/api/colony/auto/next',{recover_task_id:task.task_id});
 assert.equal(recovered.status,200,JSON.stringify(recovered));assert.equal(recovered.body.task.task_id,task.task_id);assert.equal(recovered.body.task.status,'FINALIZED');assert.deepEqual(recovered.body.my_vote,accepted);assert.deepEqual(recovered.body.claim,first.claim);
 const correction=await x.call('/api/colony/tasks/'+task.task_id+'/corrections',{correction_id:'recovered-correction',vote_id:recovered.body.my_vote.vote_id,action:'SELL'});assert.equal(correction.status,201);
 assert.equal((await x.call('/api/colony/auto/next',{})).body.task,null);
 await x.DB.prepare('UPDATE colony_auto_dispatch SET next_attempt_at=0').run();
 const next=await x.call('/api/colony/auto/next',{});assert.notEqual(next.body.task.task_id,task.task_id);assert.equal(next.body.my_vote,null);assert.equal(fetched(),2);
 assert.equal((await x.call('/api/colony/auto/next',{recover_task_id:task.task_id})).body.my_vote.vote_id,accepted.vote_id);
 assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM colony_task_claims').first()).n,2);
});

test('recovery rejects unauthorized, wrong-colony and unpinned tasks and validates bounded IDs',async t=>{
 const x=await setup(t);await market(t);for(const u of ['alice','bob','carol'])await x.register(u);await x.enroll('alice');
 const task=(await x.call('/api/colony/auto/next',{})).body.task;
 await x.call('/api/colony/tasks/'+task.task_id+'/votes',await x.proof('alice',{purpose:'colony-vote',task_id:task.task_id,snapshot_hash:task.snapshot_hash,action:'BUY'}));
 await x.call('/api/colony/auto/next',{});await x.enroll('bob');
 const body={recover_task_id:task.task_id};
 assert.equal((await x.call('/api/colony/auto/next',body,null)).status,401);
 assert.equal((await x.call('/api/colony/auto/next',body,'carol')).status,403);
 const late=await x.call('/api/colony/auto/next',body,'bob');assert.equal(late.status,403);assert.equal(late.body.error,'NOT_MEMBER');assert.equal(late.body.my_vote,undefined);
 for(const id of [null,0,true,[],{},'', 'x'.repeat(101)])assert.equal((await x.call('/api/colony/auto/next',{recover_task_id:id})).status,422);
 assert.equal((await x.call('/api/colony/auto/next',{...body,fly_id:x.ids.bob.fly_id})).status,422);
 assert.equal((await x.call('/api/colony/auto/next',{recover_task_id:'x'.repeat(100)})).status,404);
 const manual=await x.call('/api/colony',{quorum:0.5,proof:await x.proof('alice',{purpose:'colony-create',quorum:0.5})});
 const other=await x.call('/api/colony/'+manual.body.colony_id+'/tasks',{symbol:'BTCUSD',duration_ms:300000});assert.equal(other.status,201);
 assert.equal((await x.call('/api/colony/auto/next',{recover_task_id:other.body.task_id})).status,404);
 // Valid immutable snapshot with the same owner but a different fly is not ours.
 await x.DB.prepare('INSERT INTO colony_tasks(task_id,colony_id,snapshot_json,snapshot_hash,members_json,quorum,deadline,created_at) VALUES(?,?,?,?,?,?,?,?)').bind('wrong-pinned-fly','defly-default-v1','{}',await digest({}),JSON.stringify([{member_user_id:'alice',fly_id:x.ids.bob.fly_id}]),0.5,Date.now()+300000,Date.now()).run();
 assert.equal((await x.call('/api/colony/auto/next',{recover_task_id:'wrong-pinned-fly'})).status,403);
 assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM colony_task_claims').first()).n,1);
});

test('authorized recovery without a ballot dispatches normally and never invents a vote or claim',async t=>{
 const x=await setup(t);await market(t);await x.register('alice');await x.enroll('alice');
 const first=(await x.call('/api/colony/auto/next',{})).body;
 const retry=(await x.call('/api/colony/auto/next',{recover_task_id:first.task.task_id})).body;assert.equal(retry.task.task_id,first.task.task_id);assert.deepEqual(retry.claim,first.claim);assert.equal(retry.my_vote,null);
 // An expired immutable task with no ballot falls through to the current task.
 await x.DB.prepare('INSERT INTO colony_tasks(task_id,colony_id,snapshot_json,snapshot_hash,members_json,quorum,deadline,created_at,status,result_json,result_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind('no-ballot-finalized','defly-default-v1','{}',await digest({}),JSON.stringify(first.task.members),0.5,Date.now()-1,Date.now()-300001,'FINALIZED','{}',await digest({})).run();
 const noVote=(await x.call('/api/colony/auto/next',{recover_task_id:'no-ballot-finalized'})).body;assert.equal(noVote.task.task_id,first.task.task_id);assert.equal(noVote.my_vote,null);
 // Recovery can return an accepted ballot without fabricating a dispatch claim.
 await x.call('/api/colony/tasks/'+first.task.task_id+'/votes',await x.proof('alice',{purpose:'colony-vote',task_id:first.task.task_id,snapshot_hash:first.task.snapshot_hash,action:'BUY'}));
 await x.call('/api/colony/auto/next',{});
 const id='signed-without-claim',snapshot_hash=await digest({});
 await x.DB.prepare('INSERT INTO colony_tasks(task_id,colony_id,snapshot_json,snapshot_hash,members_json,quorum,deadline,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,'defly-default-v1','{}',snapshot_hash,JSON.stringify(first.task.members),0.5,Date.now()+300000,Date.now()).run();
 const accepted=await x.call('/api/colony/tasks/'+id+'/votes',await x.proof('alice',{purpose:'colony-vote',task_id:id,snapshot_hash,action:'HOLD'}));assert.equal(accepted.status,201);
 const recovered=(await x.call('/api/colony/auto/next',{recover_task_id:id})).body;assert.equal(recovered.task.task_id,id);assert.equal(recovered.my_vote.vote_id,accepted.body.vote_id);assert.equal(recovered.claim,null);
 assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM colony_task_claims').first()).n,1);
});

test('provider failure is bounded and never publishes synthetic work',async t=>{
 const x=await setup(t);await x.register('alice');await x.enroll('alice');const prior=globalThis.fetch;t.after(()=>{globalThis.fetch=prior});let n=0;globalThis.fetch=async()=>{n++;throw Error('offline')};
 assert.equal((await x.call('/api/colony/auto/next',{})).status,503);const again=await x.call('/api/colony/auto/next',{});assert.equal(again.body.task,null);assert.equal(again.body.waiting_reason,'RATE_LIMITED');assert.equal(n,1);assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM colony_tasks').first()).n,0);
});

test('human corrections are own-vote bound, append-only, idempotent and never alter signed results or learning',async t=>{
 const x=await setup(t);await market(t);for(const u of ['alice','bob']){await x.register(u);await x.enroll(u);}const task=(await x.call('/api/colony/auto/next',{})).body.task;
 const path='/api/colony/tasks/'+task.task_id, corrections=path+'/corrections';
 assert.equal((await x.call(corrections,{correction_id:'correction-1',vote_id:'invented',action:'SELL'})).status,403);
 let vote_id;for(const u of ['alice','bob']){const accepted=await x.call(path+'/votes',await x.proof(u,{purpose:'colony-vote',task_id:task.task_id,snapshot_hash:task.snapshot_hash,action:'BUY'}),u);if(u==='alice')vote_id=accepted.body.vote_id;}
 const finalized=(await x.call(path+'/finalize',{})).body;const original=await x.DB.prepare('SELECT * FROM colony_votes WHERE vote_id=?').bind(vote_id).first();
 const body={correction_id:'correction-1',vote_id,action:'SELL',note:'I would wait for confirmation.'};
 assert.equal((await x.call(corrections,body,'bob')).status,403);
 const made=await x.call(corrections,body);assert.equal(made.status,201,JSON.stringify(made));assert.equal(made.body.learning_applied,false);assert.equal(made.body.correction.fly_id,x.ids.alice.fly_id);
 assert.equal((await x.call(corrections,body)).status,200);assert.equal((await x.call(corrections,{...body,action:'HOLD'})).status,409);
 assert.equal((await x.call(corrections,{...body,correction_id:'correction-2',fly_id:x.ids.bob.fly_id})).status,422);
 assert.equal((await x.call(corrections,{...body,correction_id:'correction-2',note:'x'.repeat(1001)})).status,422);
 const races=await Promise.all([x.call(corrections,{...body,correction_id:'correction-2'}),x.call(corrections,{...body,correction_id:'correction-2'})]);assert.deepEqual(races.map(r=>r.status).sort(),[200,201]);
 const mine=await x.call(corrections);assert.equal(mine.body.vote.vote_id,vote_id);assert.equal(mine.body.corrections.length,2);assert.equal((await x.call(corrections,undefined,'bob')).body.corrections.length,0);
 await Promise.all(Array.from({length:25},(_,i)=>x.call(corrections,{...body,correction_id:'correction-more-'+i})));assert.equal((await x.call(corrections)).body.corrections.length,20);assert.equal((await x.call(corrections,{...body,correction_id:'correction-overflow'})).status,409);
 assert.deepEqual((await x.call(path)).body,finalized);assert.deepEqual(await x.DB.prepare('SELECT * FROM colony_votes WHERE vote_id=?').bind(vote_id).first(),original);
 await assert.rejects(x.DB.prepare("UPDATE colony_human_corrections SET action='BUY'").run(),/immutable/);await assert.rejects(x.DB.prepare('DELETE FROM colony_human_corrections').run(),/immutable/);
});

test('default colony cannot bypass automatic consent through manual join and dispatch finalizes expired zero votes honestly',async t=>{
 const x=await setup(t);await market(t);await x.register('alice');await x.register('bob');await x.enroll('alice');
 const join=await x.call('/api/colony/defly-default-v1/join',{proof:await x.proof('bob',{purpose:'colony-join',colony_id:'defly-default-v1'})},'bob');assert.equal(join.status,403);
 const now=Date.now(),members=[{member_user_id:'alice',fly_id:x.ids.alice.fly_id}];await x.DB.prepare('INSERT INTO colony_tasks(task_id,colony_id,snapshot_json,snapshot_hash,members_json,quorum,deadline,created_at) VALUES(?,?,?,?,?,?,?,?)').bind('expired-round','defly-default-v1','{}',await digest({}),JSON.stringify(members),0.5,now-1,now-300001).run();
 const next=await x.call('/api/colony/auto/next',{});assert.equal(next.status,200);const old=await x.call('/api/colony/tasks/expired-round');assert.equal(old.body.result.status,'NO_QUORUM');assert.equal(old.body.result.total,0);assert.equal(old.body.result.required,1);
});
