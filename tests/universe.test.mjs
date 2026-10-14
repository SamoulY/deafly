import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handleUniverse,tickUniverse,ensureRounds,trainUniverse} from '../worker/src/universe.mjs';
import {RULES,trade,initialAccount,initialServerModel,learnCompletedRound,serverDecision,validDecoder} from '../worker/src/universe-policy.mjs';
import {initialTeachingModel} from '../worker/src/companion-learning.mjs';
import {createFlyIdentity,signManifest} from '../pages/fly-identity.js';
import {federation} from '../worker/src/federation.mjs';
const base=Date.UTC(2026,9,15)/1000;
const decoder=direction=>({left_hz:direction==='SELL'?10:0,right_hz:direction==='BUY'?10:0,difference_hz:direction==='BUY'?10:direction==='SELL'?-10:0,gate_spikes:1,proposed_action:direction});
async function setup(t){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-01-01',d1Databases:['DB']}));t.after(()=>mf.dispose());const DB=await mf.getD1Database('DB');
 for(const f of ['schema.sql','migrations/0008_federation.sql','migrations/0016_universe.sql'])await DB.exec((await readFile(new URL('../worker/'+f,import.meta.url),'utf8')).replace(/^\s*--.*$/gm,'').replace(/\r?\n/g,' '));
 await DB.exec('CREATE TABLE companion_models(user_id TEXT PRIMARY KEY,checkpoint_json TEXT,model_hash TEXT);');
 const env={DB},ids={};let time=base-60;
 async function register(user){await DB.prepare('INSERT INTO users(id,nickname,token_hash,created_at,last_seen_at) VALUES(?,?,?,?,?)').bind(user,user,user,time,time).run();ids[user]=await createFlyIdentity({getItem(){return null},setItem(){}},{genesis_model_hash:'a'.repeat(64)});const response=await federation(new Request('https://test/api/federation/fly-manifest',{method:'POST',body:JSON.stringify(await proof(user,{}))}),env,{id:user},'/api/federation/fly-manifest');assert.equal(response.status,201);}
 const proof=(u,extra)=>signManifest(ids[u],{owner_user_id:u,checkpoint_hash:(u==='alice'?'b':'c').repeat(64),sequence:0,...extra});
 const call=async(path,body,user='alice')=>{const r=await handleUniverse(new Request('https://test'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})}),env,user?{id:user}:null,{at:time});return {status:r.status,body:await r.json()};};
 const enroll=async u=>call('/api/universe/enroll',{proof:await proof(u,{purpose:'universe-enroll-v1',round_id:'day-'+base,consent:true}),name:u},u);
 const market=at=>({source:'kraken-public',synthetic:false,bars:Array.from({length:40},(_,i)=>{const ts=Math.floor(at/60)*60-(40-i)*60,price=100-(ts-base)/300;return {time:ts,open:price,high:price+1,low:price-1,close:price,volume:10};})});
 const tick=async at=>{time=at;return tickUniverse(env,{at,market:market(at)});};
 const predict=async(u,task,action='SELL')=>call('/api/universe/predict',await proof(u,{purpose:'universe-prediction-v1',task_id:task.id,snapshot_hash:task.snapshot_hash,teaching_hash:task.teaching_hash,decoder:decoder(action)}),u);
 return {DB,env,register,proof,call,enroll,tick,predict,market,setTime:at=>{time=at;}};
}
test('standard account prices spot trades, fees, slippage and drawdown without personal cash',()=>{
 const initial=initialAccount(100),sold=trade(initial,'SELL',90);assert.equal(initial.quantity,100);assert.equal(sold.next.quantity,0);assert.ok(sold.next.equity<9000);assert.ok(sold.next.drawdown>.1);assert.equal(sold.next.fees,sold.fee);const bought=trade(sold.next,'BUY',80);assert.equal(bought.next.cash,0);assert.ok(bought.next.quantity>100);assert.equal(trade(bought.next,'BUY',85).action,'HOLD');assert.ok(validDecoder(decoder('SELL')));assert.ok(!validDecoder({...decoder('SELL'),proposed_action:'BUY'}));
});
test('outcome-aware distillation changes only the server policy and penalizes losing examples',()=>{
 const before=initialAccount(100),sold=trade(before,'SELL',100).next,baseModel=initialServerModel(),x=[0,-1,.1,0,1,1,0];
 const positive=Array.from({length:100},(_,i)=>({task_id:'task'+i,policy_hash:'one',features:x,action:'SELL',before,after:sold,future_price:90}));
 const good=learnCompletedRound(baseModel,positive),bad=learnCompletedRound(baseModel,positive.map(e=>({...e,future_price:110})));
 assert.equal(serverDecision(baseModel,x),'HOLD');assert.equal(serverDecision(good.model,x),'SELL');assert.equal(serverDecision(bad.model,x),'HOLD');assert.equal(baseModel.samples,0);assert.equal(good.model.samples,100);
 const one=learnCompletedRound(baseModel,[positive[0]]),clones=learnCompletedRound(baseModel,Array.from({length:100},()=>positive[0]));assert.ok(Math.abs(one.model.bias[1]-clones.model.bias[1])<.003,'identical clones cannot multiply one task training weight');
});
test('enrollment requires owner consent, freezes next-period policy and keeps other accounts private',async t=>{
 const x=await setup(t);await x.register('alice');await x.register('bob');
 assert.equal((await x.call('/api/universe',undefined,null)).status,401);
 assert.equal((await x.call('/api/universe/enroll',{proof:await x.proof('alice',{purpose:'universe-enroll-v1',round_id:'day-'+base})})).status,422);
 assert.equal((await x.call('/api/universe/enroll',{proof:await x.proof('alice',{purpose:'universe-enroll-v1',round_id:'day-'+base,consent:true})},'bob')).status,403);
 assert.equal((await x.enroll('alice')).status,201);assert.equal((await x.enroll('alice')).status,200);
 const changed=await x.proof('alice',{checkpoint_hash:'d'.repeat(64),purpose:'universe-enroll-v1',round_id:'day-'+base,consent:true});assert.equal((await x.call('/api/universe/enroll',{proof:changed})).status,409);
 x.setTime(base+1);assert.equal((await x.enroll('bob')).status,409);
 const overview=(await x.call('/api/universe?round=day-'+base,undefined,'bob')).body;
 assert.equal(overview.leaderboard.length,1);assert.equal(overview.mine,null);assert.equal(overview.leaderboard[0].owner_id,undefined);assert.equal(overview.leaderboard[0].teaching_json,undefined);assert.equal(overview.leaderboard[0].consent_json,undefined);
});
test('forward evaluation binds frozen brain, uses future fills, excludes gaps and trains only completed periods',async t=>{
 const x=await setup(t);await x.register('alice');await x.register('bob');
 const head=initialTeachingModel();await x.DB.prepare('INSERT INTO companion_models VALUES(?,?,?)').bind('alice',JSON.stringify(head),'private-head').run();
 await x.enroll('alice');await x.enroll('bob');
 await x.DB.prepare('UPDATE universe_rounds SET ends_at=? WHERE id=?').bind(base+900,'day-'+base).run();
 for(let i=0;i<3;i++){
  await x.tick(base+i*300);const task=(await x.call('/api/universe/task')).body.task;assert.ok(task);
  const wrong=await x.proof('alice',{purpose:'universe-prediction-v1',task_id:task.id,snapshot_hash:task.snapshot_hash,teaching_hash:task.teaching_hash,decoder:decoder('SELL'),checkpoint_hash:'d'.repeat(64)});
  assert.equal((await x.call('/api/universe/predict',wrong)).status,409);
  assert.equal((await x.predict('alice',task)).status,201);assert.equal((await x.predict('alice',task)).body.replayed,true);
  assert.equal((await x.predict('alice',task,'BUY')).status,409);
  x.setTime(base+i*300+121);const bobTask={...task,checkpoint_hash:'c'.repeat(64),teaching_hash:(await x.DB.prepare('SELECT teaching_hash FROM universe_entries WHERE round_id=? AND owner_id=?').bind('day-'+base,'bob').first()).teaching_hash};assert.equal((await x.predict('bob',bobTask)).status,409);
  const count=(await x.DB.prepare('SELECT COUNT(*) AS n FROM universe_events').first()).n;await x.tick(base+i*300+180);assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM universe_events').first()).n,count,'fill bar must be closed before settlement');
  await x.tick(base+i*300+240);
  assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM universe_models').first()).n,0,'active period cannot teach the evaluated official model');
 }
 const events=await x.DB.prepare("SELECT * FROM universe_events WHERE owner_id='alice' ORDER BY created_at").all();assert.equal(events.results.length,3);assert.equal(events.results[0].mark_price,x.market(base+240).bars.find(b=>b.time===base+180).open);
 const final=await x.tick(base+900);assert.equal(final.ok,true);
 const view=(await x.call('/api/universe')).body;assert.equal(view.round.status,'COMPLETE');assert.equal(view.mine.rank,1);assert.equal(view.mine.teaching_version,0);assert.equal(view.leaderboard.find(e=>e.name==='bob').status,'INCOMPLETE');assert.equal(view.leaderboard.find(e=>e.name==='bob').rank,undefined);assert.equal(view.benchmarks.length,2);assert.equal(view.round.model_version,0);assert.equal(view.learning.model.version,1);assert.equal(view.learning.model.samples,2);
 assert.equal((await x.DB.prepare('SELECT checkpoint_json FROM companion_models WHERE user_id=?').bind('alice').first()).checkpoint_json,JSON.stringify(head));
 const before=(await x.DB.prepare('SELECT COUNT(*) AS n FROM universe_events').first()).n;await Promise.all([x.tick(base+901),x.tick(base+901)]);assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM universe_events').first()).n,before);await trainUniverse(x.DB,base+902);assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM universe_models').first()).n,1);
 await x.tick(base+86400);assert.equal((await x.call('/api/universe')).body.round.model_version,1,'trained model becomes available only in a later period');
});
test('late bootstrap and missing scheduler periods cannot fabricate complete ranks',async t=>{
 const x=await setup(t);await x.tick(base+400);const overview=(await x.call('/api/universe')).body;assert.equal(overview.round.settled_tasks,0);
 await x.tick(base+86400);const previous=(await x.call('/api/universe?round=day-'+base)).body;assert.equal(previous.round.status,'INCOMPLETE');assert.equal(previous.learning.state,'COLLECTING');
});
test('settlement batches remain atomic and can resume more than one chunk without duplicating balances',async t=>{
 const x=await setup(t);await ensureRounds(x.DB,base-60);
 const head=JSON.stringify(initialTeachingModel());
 // Additional entries are test-only; production enrollment requires signed consent.
 const members=Array.from({length:270},(_,i)=>['day-'+base,'member-'+i,'fly-'+i,'Fly '+i,'PERSONAL','d'.repeat(64),head,'head','{}',base-60]);
 await x.DB.prepare(`INSERT INTO universe_entries(round_id,owner_id,fly_id,display_name,kind,checkpoint_hash,teaching_json,teaching_hash,consent_json,joined_at) SELECT ${Array.from({length:10},(_,i)=>`json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?)`).bind(JSON.stringify(members)).run();
 await x.tick(base);await x.DB.exec("CREATE TRIGGER force_universe_failure BEFORE INSERT ON universe_events WHEN NEW.owner_id='member-15' BEGIN SELECT RAISE(ABORT,'TEST_UNIVERSE_FAILURE'); END;");
 await assert.rejects(x.tick(base+240),/TEST_UNIVERSE_FAILURE/);assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM universe_events').first()).n,0);assert.equal((await x.DB.prepare('SELECT SUM(revision) AS n FROM universe_entries').first()).n,0);
 await x.DB.exec('DROP TRIGGER force_universe_failure;');await x.tick(base+241);
 assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM universe_events').first()).n,272);assert.equal((await x.DB.prepare("SELECT status FROM universe_tasks LIMIT 1").first()).status,'SETTLED');assert.equal((await x.DB.prepare('SELECT MAX(revision) AS n FROM universe_entries').first()).n,1);
 await x.tick(base+242);assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM universe_events').first()).n,272);
});
