import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import * as core from '../worker/src/raising-core.mjs';
import * as training from '../worker/src/raising-training.mjs';
const service = await import('../worker/src/raising-training-service.mjs').catch(e => { if(e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
async function database(t) {
  const mf = new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}', compatibilityDate:'2026-01-01',d1Databases:['DB']}));
  t.after(() => mf.dispose());
  const DB = await mf.getD1Database('DB');
  await DB.exec('CREATE TABLE raising_sessions (id TEXT PRIMARY KEY,user_id TEXT,status TEXT,data_json TEXT); CREATE TABLE raising_demonstrations (session_id TEXT,record_json TEXT);');
  const sql = await readFile(new URL('../worker/migrations/0005_raising_training.sql',import.meta.url),'utf8');
  await DB.exec(sql);
  return {DB};
}
test('EVAL and teaching claims serialize in either order and allow practice replay',async t=>{
  const {DB}=await database(t);
  const data=JSON.stringify({bars:[{time:100},{time:200}]});
  await DB.prepare("INSERT INTO raising_interval_claims VALUES ('eval','alice','EVAL',100,200)").run();
  await assert.rejects(DB.prepare("INSERT INTO raising_sessions VALUES ('late','alice','ACTIVE',?)").bind(data).run(),/INTERVAL_ALREADY_EXPOSED/);
  const race=await Promise.allSettled([
    DB.prepare("INSERT INTO raising_sessions VALUES ('teach','bob','ACTIVE',?)").bind(data).run(),
    DB.prepare("INSERT INTO raising_interval_claims VALUES ('race','bob','EVAL',100,200)").run()
  ]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  await DB.prepare("INSERT INTO raising_sessions VALUES ('practice1','carol','COMPLETED',?)").bind(data).run();
  await DB.prepare("INSERT INTO raising_sessions VALUES ('practice2','carol','COMPLETED',?)").bind(data).run();
  await assert.rejects(DB.prepare("INSERT INTO raising_interval_claims VALUES ('after','carol','EVAL',150,250)").run(),/INTERVAL_ALREADY_EXPOSED/);
});
async function coreSession(env,id,start,symbol='BTC',pending=null) {
  const bars=Array.from({length:90},(_,i)=>({time:start+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:10+i}));
  const row={id,step:0,data_json:JSON.stringify({bars,symbol,provenance:{provider:'KRAKEN',synthetic:false,data_complete:true}}),state_json:JSON.stringify(core.initialState(start))};
  const statements=[env.DB.prepare('INSERT INTO raising_sessions VALUES (?,?,?,?)').bind(id,'alice','COMPLETED',row.data_json)];
  for(;row.step<core.STEPS;row.step++) {
    const next=await core.advance(row,row.step%2?'CLOSE':'BUY');
    statements.push(env.DB.prepare('INSERT INTO raising_demonstrations VALUES (?,?)').bind(id,JSON.stringify(next.record)));
    row.state_json=JSON.stringify(next.state);
  }
  if(pending) pending.push(...statements);
  else await env.DB.batch(statements);
}
test('real core replay and same-minute symbols do not poison subsequent training',async t=>{
  const env=await database(t);
  for(let i=0;i<10;i++) await coreSession(env,`s${i}`,10000+i*10000);
  await coreSession(env,'replay',10000);
  await coreSession(env,'eth',10000,'ETH');
  const listing=await (await service.handleRaisingTraining(request('training'),env,{id:'alice'})).json();
  assert.equal(listing.eligibility.eligible_count,120);
  assert.equal(listing.eligibility.excluded_sessions.length,2);
  const response=await service.handleRaisingTraining(request('training',{idempotency_key:'core'}),env,{id:'alice'});
  assert.equal(response.status,202);
  await service.runTrainingJobs(env);
  const job=await env.DB.prepare('SELECT * FROM raising_training_jobs').first();
  assert.equal(job.status,'COMPLETED',job.error);
});
test('restoring zero retains the global holdout after more core history',async t=>{
  const env=await database(t);
  for(let i=0;i<10;i++) await coreSession(env,`s${i}`,10000+i*10000);
  await service.handleRaisingTraining(request('training',{idempotency_key:'first'}),env,{id:'alice'});
  await service.runTrainingJobs(env);
  const first=JSON.parse((await env.DB.prepare('SELECT result_json FROM raising_training_jobs').first()).result_json).split_manifest;
  await service.handleRaisingTraining(request('versions/0/activate',{}),env,{id:'alice'});
  for(let i=10;i<13;i++) await coreSession(env,`s${i}`,10000+i*10000);
  await service.handleRaisingTraining(request('training',{idempotency_key:'second'}),env,{id:'alice'});
  await service.runTrainingJobs(env);
  const job=await env.DB.prepare("SELECT * FROM raising_training_jobs WHERE idempotency_key='second'").first();
  assert.equal(job.status,'COMPLETED',job.error);
  const second=JSON.parse(job.result_json).split_manifest;
  assert.deepEqual(second.train.observation_hashes,first.train.observation_hashes);
  assert.ok(first.validation.observation_hashes.every(h=>second.validation.observation_hashes.includes(h)));
  // A legacy/stale queue must not omit evidence assigned by the second run,
  // even when its parent is zero and the initial registry is satisfied.
  const oldRows=(await env.DB.prepare("SELECT rows_json FROM raising_training_jobs WHERE idempotency_key='first'").first()).rows_json;
  await env.DB.prepare("INSERT INTO raising_training_jobs (id,user_id,idempotency_key,status,parent_version_id,rows_json,created_at) VALUES ('stale-replay','alice','stale-replay','QUEUED','alice:0',?,1)").bind(oldRows).run();
  await service.runTrainingJobs(env);
  const stale=await env.DB.prepare("SELECT status,error FROM raising_training_jobs WHERE id='stale-replay'").first();
  assert.equal(stale.status,'FAILED');
  assert.match(stale.error,/GLOBAL_REPLAY_REQUIRED/);
  assert.equal(await env.DB.prepare("SELECT id FROM raising_versions WHERE training_id='stale-replay'").first(),null);
  const registry=await env.DB.prepare("SELECT COUNT(*) n FROM raising_observation_assignments WHERE user_id='alice'").first();
  assert.equal(registry.n,second.train.count+second.validation.count);
  await assert.rejects(env.DB.prepare("UPDATE raising_observation_assignments SET split='train' WHERE user_id='alice'").run(),/immutable/);
});
test('queued snapshots revalidate newly reserved EVAL history',async t=>{
  const env=await database(t);
  await service.handleRaisingTraining(request('versions/0/activate',{}),env,{id:'alice'});
  const rows=Array.from({length:100},(_,i)=>({features:[i%2?1:-1,0,0,0,1,0,0],action:i%2?'BUY':'SELL',time:i+1,session_id:`s${Math.floor(i/10)}`,observation_hash:`fixture${i}`,training_eligible:true,interval_start:Math.floor(i/10)*10+1,interval_end:Math.floor(i/10)*10+10}));
  await env.DB.prepare("INSERT INTO raising_training_jobs (id,user_id,idempotency_key,status,parent_version_id,rows_json,created_at) VALUES ('legacy','alice','legacy','QUEUED','alice:0',?,1)").bind(JSON.stringify(rows)).run();
  await env.DB.prepare("INSERT INTO raising_interval_claims VALUES ('eval','alice','EVAL',1,10)").run();
  await service.runTrainingJobs(env);
  const job=await env.DB.prepare("SELECT * FROM raising_training_jobs WHERE id='legacy'").first();
  assert.equal(job.status,'FAILED');
  assert.match(job.error,/overlap|EXPOSED/i);
});
test('capacity rejects explicitly without truncating canonical full replay',async t=>{
  const env=await database(t);
  // Capacity mechanics use compact scripted evidence; real-core integration is
  // covered above. Avoid thousands of crypto hashes and repeated large histories.
  const bars=Array.from({length:20},(_,i)=>({time:10000+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:10+i}));
  await env.DB.prepare('INSERT INTO raising_sessions VALUES (?,?,?,?)').bind('capacity','alice','COMPLETED',JSON.stringify({bars:[bars[0],{...bars.at(-1),time:200000}],provenance:{provider:'KRAKEN',synthetic:false,data_complete:true}})).run();
  const pending=Array.from({length:2004},(_,i)=>env.DB.prepare('INSERT INTO raising_demonstrations VALUES (?,?)').bind('capacity',JSON.stringify({source:'HUMAN',eligible:true,human_action:'HOLD',observation_hash:`capacity-${i}`,visible_bars:bars,observation:{time:12000+i,cash:10000,position:{side:'FLAT',entry_price:0}}})));
  for(let i=0;i<pending.length;i+=100) await env.DB.batch(pending.slice(i,i+100));
  const response=await service.handleRaisingTraining(request('training',{idempotency_key:'capacity'}),env,{id:'alice'});
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'DATASET_CAPACITY_EXCEEDED');
  const listing=await (await service.handleRaisingTraining(request('training'),env,{id:'alice'})).json();
  assert.equal(listing.eligibility.eligible_count,2004);
  assert.equal(listing.eligibility.capacity_exceeded,true);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM raising_training_jobs').first()).n,0);
});
const request = (path,body) => new Request(`https://test/api/raising/${path}`,body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('null and malformed bodies return client errors',async t=>{
  const env=await database(t);
  for(const [path,error] of [['training','INVALID_IDEMPOTENCY_KEY'],['evaluations','INVALID_TRAINING_ID']]) {
    const response=await service.handleRaisingTraining(request(path,null),env,{id:'alice'});
    assert.equal(response.status,422);
    assert.equal((await response.json()).error,error);
    const malformed=new Request(`https://test/api/raising/${path}`,{method:'POST',body:'{'});
    assert.equal((await service.handleRaisingTraining(malformed,env,{id:'alice'})).status,400);
  }
});
test('D1 persists user-isolated version zero and explicit activation restores its checkpoint',async t => {
  assert.equal(typeof service.handleRaisingTraining,'function');
  const env = await database(t);
  const r = await service.handleRaisingTraining(request('versions/0/activate',{}),env,{id:'alice'});
  assert.equal(r.status,200);
  const body = await r.json();
  assert.equal(body.active_version.id,'alice:0');
  const row = await env.DB.prepare('SELECT * FROM raising_versions WHERE id=?').bind('alice:0').first();
  assert.equal(await training.hashCheckpoint(JSON.parse(row.checkpoint_json)),row.checkpoint_hash);
  assert.equal((await service.handleRaisingTraining(request('versions/alice:0/activate',{}),env,{id:'bob'})).status,404);
  assert.equal(await service.handleRaisingTraining(request('profile'),env,{id:'alice'}),null);
});
test('cron deterministically trains an immutable queued snapshot, recovers stale lease, and never activates candidate',async t => {
  assert.equal(typeof service.runTrainingJobs,'function');
  const env = await database(t);
  await service.handleRaisingTraining(request('versions/0/activate',{}),env,{id:'alice'});
  // Synthetic scripted rows ONLY seed the internal queue to test persistence mechanics.
  const rows = Array.from({length:100},(_,i)=>({features:[i%2?1:-1,0,0,0,1,0,0],action:i%2?'BUY':'SELL',time:i+1,session_id:`s${Math.floor(i/10)}`,observation_hash:`fixture${i}`,training_eligible:true,interval_start:Math.floor(i/10)*10+1,interval_end:Math.floor(i/10)*10+10}));
  const input = JSON.stringify(rows);
  await env.DB.prepare("INSERT INTO raising_training_jobs (id,user_id,idempotency_key,status,parent_version_id,rows_json,created_at,lease_until) VALUES ('job','alice','key','RUNNING','alice:0',?,1,0)").bind(input).run();
  await Promise.all([service.runTrainingJobs(env),service.runTrainingJobs(env)]);
  const job = await env.DB.prepare("SELECT * FROM raising_training_jobs WHERE id='job'").first();
  assert.equal(job.status,'COMPLETED',job.error);
  const version = await env.DB.prepare('SELECT * FROM raising_versions WHERE training_id=?').bind('job').first();
  assert.equal(await training.hashCheckpoint(JSON.parse(version.checkpoint_json)),version.checkpoint_hash);
  assert.notEqual(version.checkpoint_hash,(await env.DB.prepare("SELECT checkpoint_hash FROM raising_versions WHERE id='alice:0'").first()).checkpoint_hash);
  assert.equal((await env.DB.prepare("SELECT version_id FROM raising_active_versions WHERE user_id='alice'").first()).version_id,'alice:0');
  await assert.rejects(env.DB.prepare("UPDATE raising_training_jobs SET rows_json='[]' WHERE id='job'").run(),/immutable/);
  await assert.rejects(env.DB.prepare("UPDATE raising_versions SET checkpoint_json='{}' WHERE id='job:version'").run(),/immutable/);
  assert.equal((await service.handleRaisingTraining(request(`versions/${version.id}/activate`,{}),env,{id:'alice'})).status,200);
});
test('invalid queued data persists FAILED and exhausted leases are bounded',async t => {
  const env = await database(t);
  await service.handleRaisingTraining(request('versions/0/activate',{}),env,{id:'alice'});
  await env.DB.prepare("INSERT INTO raising_training_jobs(id,user_id,idempotency_key,status,parent_version_id,rows_json,created_at) VALUES ('bad','alice','bad','QUEUED','alice:0','[]',1)").run();
  await env.DB.prepare("INSERT INTO raising_training_jobs(id,user_id,idempotency_key,status,parent_version_id,rows_json,created_at,attempts) VALUES ('stale','alice','stale','RUNNING','alice:0','[]',2,3)").run();
  await service.runTrainingJobs(env);
  const rows=(await env.DB.prepare('SELECT status,error FROM raising_training_jobs ORDER BY created_at').all()).results;
  assert.deepEqual(rows.map(r=>r.status),['FAILED','FAILED']);
  assert.match(rows[1].error,/RETRY_LIMIT/);
});
test('training listing fails closed for synthetic and incomplete human snapshots',async t => {
  const env = await database(t);

  await env.DB.prepare("INSERT INTO raising_sessions VALUES ('fake','alice','COMPLETED',?)").bind(JSON.stringify({provenance:{provider:'KRAKEN',synthetic:true,data_complete:true},bars:[]})).run();
  await env.DB.prepare("INSERT INTO raising_demonstrations VALUES ('fake',?)").bind(JSON.stringify({source:'HUMAN',eligible:true,human_action:'HOLD'})).run();
  const response = await service.handleRaisingTraining(request('training'),env,{id:'alice'});
  assert.ok(response);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.eligibility.eligible_count,0);
  assert.equal(body.active_version.id,'alice:0');
  const create=await service.handleRaisingTraining(request('training',{idempotency_key:'train'}),env,{id:'alice'});
  assert.equal(create.status,409);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM raising_training_jobs').first()).n,0);
});
async function humanFixtures(env) {
  // Fabricated provenance below is confined to the isolated D1 test database, never a service binding.

  for(let s=0;s<10;s++) {
    const bars=Array.from({length:80},(_,i)=>({time:10000+s*10000+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:10+i}));
    await env.DB.prepare('INSERT INTO raising_sessions VALUES (?,?,?,?)').bind(`human${s}`,'alice','COMPLETED',JSON.stringify({bars,provenance:{provider:'KRAKEN',synthetic:false,data_complete:true}})).run();
    for(let i=0;i<10;i++) {
      const visible_bars=bars.slice(0,20+i*5);
      const d={source:'HUMAN',eligible:true,human_action:i%2?'BUY':'HOLD',observation_hash:`h${s}-${i}`,visible_bars,observation:{time:visible_bars.at(-1).time,cash:10000,position:{side:'FLAT',entry_price:0}}};
      await env.DB.prepare('INSERT INTO raising_demonstrations VALUES (?,?)').bind(`human${s}`,JSON.stringify(d)).run();
    }
  }
}
test('POST queues eligible immutable data idempotently, isolates users, and waitUntil completes it',async t=>{
  const env=await database(t); await humanFixtures(env);
  const tasks=[];
  const responses=await Promise.all([1,2].map(()=>service.handleRaisingTraining(request('training',{idempotency_key:'same'}),env,{id:'alice'},{waitUntil:p=>tasks.push(p)})));
  assert.ok(responses.every(r=>[200,202].includes(r.status)));
  const bodies=await Promise.all(responses.map(r=>r.json()));
  assert.equal(bodies[0].job.id,bodies[1].job.id);
  await Promise.all(tasks);
  const job=await env.DB.prepare('SELECT * FROM raising_training_jobs').first();
  assert.equal(job.status,'COMPLETED',job.error);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM raising_training_jobs').first()).n,1);
  const other=await service.handleRaisingTraining(request('training'),env,{id:'bob'});
  assert.equal((await other.json()).jobs.length,0);
});
test('teaching committed during evaluation fetch rolls back evaluation atomically',async t=>{
  const env=await database(t); await humanFixtures(env);
  await service.handleRaisingTraining(request('training',{idempotency_key:'race'}),env,{id:'alice'});
  await service.runTrainingJobs(env);
  const job=await env.DB.prepare('SELECT id FROM raising_training_jobs').first();
  const original=globalThis.fetch;
  t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async()=>{
    await env.DB.prepare("INSERT INTO raising_sessions VALUES ('racing-teach','alice','ACTIVE',?)").bind(JSON.stringify({bars:[{time:(Math.floor(Date.now()/60000)-100)*60},{time:Math.floor(Date.now()/60000)*60}]})).run();
    return Response.json({error:[],result:{XXBTZUSD:Array.from({length:100},(_,i)=>[(Math.floor(Date.now()/60000)-100+i)*60,'100','102','99','100','100','10',1]),last:1}});
  };
  const response=await service.handleRaisingTraining(request('evaluations',{training_id:job.id}),env,{id:'alice'});
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'INTERVAL_ALREADY_EXPOSED');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM raising_evaluations').first()).n,0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM raising_interval_claims WHERE kind='EVAL'").first()).n,0);
});
test('evaluation claims are atomic, reject exposed history, persist frozen results and isolate users',async t=>{
  const env=await database(t); await humanFixtures(env);
  await service.handleRaisingTraining(request('training',{idempotency_key:'evaltrain'}),env,{id:'alice'});
  await service.runTrainingJobs(env);
  const job=await env.DB.prepare('SELECT id FROM raising_training_jobs').first();
  const original=globalThis.fetch;
  t.after(()=>{globalThis.fetch=original;});
  // Scripted Kraken wire response, not evidence of real market performance.
  globalThis.fetch=async()=>Response.json({error:[],result:{XXBTZUSD:Array.from({length:100},(_,i)=>[(Math.floor(Date.now()/60000)-100+i)*60,'100','102','99',String(100+i%2),'100','10',1]),last:1}});
  const responses=await Promise.all([1,2].map(()=>service.handleRaisingTraining(request('evaluations',{training_id:job.id}),env,{id:'alice'})));
  assert.ok(responses.every(Boolean));
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM raising_evaluations').first()).n,1);
  assert.equal((await service.handleRaisingTraining(request('evaluations',{training_id:job.id}),env,{id:'bob'})).status,404);
  const listing=await service.handleRaisingTraining(request('evaluations'),env,{id:'alice'});
  assert.equal((await listing.json()).evaluations.length,1);
  globalThis.fetch=async()=>Response.json({error:[],result:{XXBTZUSD:Array.from({length:100},(_,i)=>[(Math.floor(Date.now()/60000)-100+i)*60,'100','102','99','100','100','10',1]),last:1}});
  assert.equal((await service.handleRaisingTraining(request('evaluations',{training_id:job.id}),env,{id:'alice'})).status,409);
});
