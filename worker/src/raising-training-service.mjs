import * as training from './raising-training.mjs';
import {marketHistory} from './market.mjs';
const CORS={"access-control-allow-origin":"*","access-control-allow-headers":"content-type,x-session-token,idempotency-key","access-control-allow-methods":"GET,POST,OPTIONS"};
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...CORS}});
async function versionZero(db,userId) {
  const cp = training.createDefaultCheckpoint();
  await db.prepare('INSERT OR IGNORE INTO raising_versions (id,user_id,checkpoint_json,checkpoint_hash,created_at) VALUES (?,?,?,?,?)').bind(`${userId}:0`,userId,JSON.stringify(cp),await training.hashCheckpoint(cp),Date.now()).run();
  await db.prepare('INSERT OR IGNORE INTO raising_active_versions (user_id,version_id,updated_at) VALUES (?,?,?)').bind(userId,`${userId}:0`,Date.now()).run();
}
export async function handleRaisingTraining(request,env,user,ctx) {
  const path = new URL(request.url).pathname;
  const match = path.match(/^\/api\/raising\/versions\/([^/]+)\/activate$/);
  const isTraining = path === '/api/raising/training';
  const isEvaluation = path === '/api/raising/evaluations';
  if (!match && !isTraining && !isEvaluation) return null;
  if (!user?.id) return json({error:'UNAUTHORIZED'},401);
  if(isEvaluation) return handleEvaluation(request,env,user);
  if(isTraining) {
    await versionZero(env.DB,user.id);
    const {rows,excluded_sessions,exclusion_counts} = await eligibleRows(env.DB,user.id);
    if(request.method==='GET') {
      const jobs = (await env.DB.prepare('SELECT id,status,created_at,completed_at,parent_version_id,result_json,error FROM raising_training_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(user.id).all()).results;
      const versions = (await env.DB.prepare('SELECT id,checkpoint_hash,training_id,created_at FROM raising_versions WHERE user_id=? ORDER BY created_at').bind(user.id).all()).results;
      const active = await env.DB.prepare('SELECT version_id FROM raising_active_versions WHERE user_id=?').bind(user.id).first();
      return json({jobs:jobs.map(j=>({...j,result:j.result_json?JSON.parse(j.result_json):null,result_json:undefined})),versions,active_version:versions.find(v=>v.id===active.version_id),eligibility:{eligible_count:rows.length,min_train:64,min_validation:16,capacity:2000,capacity_exceeded:rows.length>2000,excluded_sessions,exclusion_counts},backend:'market_only_readout_v1',paper_only:true});
    }
    if(request.method==='POST') {
      let body; try {body=await request.json();} catch {return json({error:'INVALID_JSON'},400);}
      const key=body?.idempotency_key;
      if(typeof key!=='string'||!key.length||key.length>100) return json({error:'INVALID_IDEMPOTENCY_KEY'},422);
      const existing=await env.DB.prepare('SELECT id,status FROM raising_training_jobs WHERE user_id=? AND idempotency_key=?').bind(user.id,key).first();
      if(existing) return json({job:existing});
      if(rows.length>2000) return json({error:'DATASET_CAPACITY_EXCEEDED',capacity:2000,eligible_count:rows.length},409);
      if(rows.length<80) return json({error:'INSUFFICIENT_ELIGIBLE_HISTORY'},409);
      const active=await env.DB.prepare('SELECT version_id FROM raising_active_versions WHERE user_id=?').bind(user.id).first();
      const id=crypto.randomUUID();
      await env.DB.prepare("INSERT OR IGNORE INTO raising_training_jobs (id,user_id,idempotency_key,status,parent_version_id,rows_json,created_at) VALUES (?,?,?,'QUEUED',?,?,?)").bind(id,user.id,key,active.version_id,JSON.stringify(rows),Date.now()).run();
      const job=await env.DB.prepare('SELECT id,status FROM raising_training_jobs WHERE user_id=? AND idempotency_key=?').bind(user.id,key).first();
      if(ctx?.waitUntil) ctx.waitUntil(runTrainingJobs(env));
      return json({job},202);
    }
    return json({error:'METHOD_NOT_ALLOWED'},405);
  }
  if(request.method !== 'POST') return json({error:'METHOD_NOT_ALLOWED'},405);
  await versionZero(env.DB,user.id);
  const id = match[1] === '0' ? `${user.id}:0` : decodeURIComponent(match[1]);
  const row = await env.DB.prepare('SELECT * FROM raising_versions WHERE id=? AND user_id=?').bind(id,user.id).first();
  if(!row) return json({error:'NOT_FOUND'},404);
  if(await training.hashCheckpoint(JSON.parse(row.checkpoint_json)) !== row.checkpoint_hash) return json({error:'CHECKPOINT_CORRUPT'},409);
  await env.DB.prepare('UPDATE raising_active_versions SET version_id=?,updated_at=? WHERE user_id=?').bind(id,Date.now(),user.id).run();
  return json({active_version:{id:row.id,checkpoint_hash:row.checkpoint_hash,backend:'market_only_readout_v1'}});
}
async function handleEvaluation(request,env,user) {
  const db=env.DB;
  if(request.method==='GET') {
    const rows=(await db.prepare('SELECT id,training_id,status,result_json,created_at,error FROM raising_evaluations WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(user.id).all()).results;
    return json({evaluations:rows.map(r=>({...r,result:r.result_json?JSON.parse(r.result_json):null,result_json:undefined}))});
  }
  if(request.method!=='POST') return json({error:'METHOD_NOT_ALLOWED'},405);
  let body; try {body=await request.json();} catch {return json({error:'INVALID_JSON'},400);}
  if(typeof body?.training_id!=='string') return json({error:'INVALID_TRAINING_ID'},422);
  const job=await db.prepare("SELECT * FROM raising_training_jobs WHERE id=? AND user_id=? AND status='COMPLETED'").bind(body.training_id,user.id).first();
  if(!job) return json({error:'NOT_FOUND'},404);
  const parent=await db.prepare('SELECT * FROM raising_versions WHERE id=? AND user_id=?').bind(job.parent_version_id,user.id).first();
  const candidate=await db.prepare('SELECT * FROM raising_versions WHERE training_id=? AND user_id=?').bind(job.id,user.id).first();
  if(!parent || !candidate) return json({error:'CHECKPOINT_MISSING'},409);
  const manifest=JSON.parse(job.result_json).split_manifest;
  const used=(await db.prepare('SELECT start,end FROM raising_interval_claims WHERE user_id=?').bind(user.id).all()).results;
  const sessions=(await db.prepare('SELECT data_json FROM raising_sessions WHERE user_id=?').bind(user.id).all()).results;
  for(const s of sessions) {
    const bars=JSON.parse(s.data_json).bars;
    if(!bars?.length) return json({error:'HISTORY_INCOMPLETE'},409);
    used.push({start:bars[0].time,end:bars.at(-1).time});
  }
  let candles;
  try {
    const live=await marketHistory('BTCUSD',env);
    const data=live.bars;
    const seen=Math.max(manifest.validation.end,...used.map(x=>x.end));
    candles=data.slice(0,-1).map(b=>({...b,closed:true})).filter(b=>b.time>seen&&b.time+60<=Date.now()/1000).slice(0,120);
  } catch {return json({error:'HISTORY_UNAVAILABLE'},503);}
  if(candles.length<32) return json({error:'INSUFFICIENT_UNSEEN_HISTORY'},409);
  let result;
  try {result=await training.evaluateFrozen({preCheckpoint:JSON.parse(parent.checkpoint_json),postCheckpoint:JSON.parse(candidate.checkpoint_json),trainingManifest:manifest,candles,usedIntervals:used,feeBps:10,slippageBps:5,notionalFraction:0.1});}
  catch(error) {return json({error:'INVALID_EVALUATION_HISTORY',message:error.message},409);}
  result.evaluator_scope='REFERENCE_ENGINE_NEXT_MINUTE_NOT_CORE_FIVE_MINUTE';
  const id=crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT INTO raising_interval_claims (id,user_id,kind,start,end) VALUES (?,?,'EVAL',?,?)").bind(id,user.id,result.interval.start,result.interval.end),
      db.prepare("INSERT INTO raising_evaluations (id,user_id,training_id,status,result_json,candles_json,created_at) VALUES (?,?,?,'COMPLETED',?,?,?)").bind(id,user.id,job.id,JSON.stringify(result),JSON.stringify(candles),Date.now())
    ]);
  } catch(error) {if(String(error).includes('INTERVAL_ALREADY_EXPOSED')) return json({error:'INTERVAL_ALREADY_EXPOSED'},409); throw error;}
  return json({evaluation:{id,training_id:job.id,status:'COMPLETED',result}},201);
}
async function eligibleRows(db,userId) {
  const records = (await db.prepare("SELECT s.id,s.data_json,d.record_json FROM raising_sessions s JOIN raising_demonstrations d ON d.session_id=s.id WHERE s.user_id=? AND s.status='COMPLETED' ORDER BY s.rowid,d.rowid").bind(userId).all()).results;
  const rows=[], invalid=new Set(), excluded_sessions=[], exclusion_counts={};
  for(const record of records) {
    try {
      const data=JSON.parse(record.data_json),d=JSON.parse(record.record_json);
      if(data.provenance?.synthetic!==false || data.provenance?.data_complete!==true || String(data.provenance?.provider).toUpperCase()!=='KRAKEN' || d.source!=='HUMAN' || d.eligible!==true) {invalid.add(record.id);continue;}
      if(!Array.isArray(d.visible_bars) || !d.observation_hash || !training.ACTIONS.includes(d.human_action)) {invalid.add(record.id);continue;}
      const o=d.observation;
      const account={cash:o.cash,initial_balance:10000,position:o.position.side,entry_price:o.position.entry_price};
      const features=training.extractFeatures({candles:d.visible_bars.map(b=>({...b,closed:true})),account,asOf:o.time});
      rows.push({features,action:d.human_action,time:o.time,session_id:record.id,observation_hash:d.observation_hash,training_eligible:true,action_mask:training.actionMask(account),interval_start:data.bars[0].time,interval_end:data.bars.at(-1).time});
    } catch { invalid.add(record.id); }
  }
  const used=(await db.prepare("SELECT start,end FROM raising_interval_claims WHERE user_id=? AND kind='EVAL'").bind(userId).all()).results;
  const groups=new Map(),selected=[],hashes=new Set();
  for(const row of rows) {if(!groups.has(row.session_id)) groups.set(row.session_id,[]); groups.get(row.session_id).push(row);}
  for(const [session_id,group] of groups) {
    const first=group[0],localHashes=new Set(group.map(r=>r.observation_hash)),times=new Set(group.map(r=>r.time));
    let reason=invalid.has(session_id)?'INVALID_EVIDENCE':null;
    if(used.some(x=>first.interval_start<=x.end&&first.interval_end>=x.start)) reason='EVAL_EXPOSED';
    else if(selected.some(r=>first.interval_start<=r.interval_end&&first.interval_end>=r.interval_start)) reason='OVERLAPPING_SESSION';
    else if(localHashes.size!==group.length || times.size!==group.length || group.some(r=>hashes.has(r.observation_hash))) reason='DUPLICATE_OBSERVATION';
    if(reason) {excluded_sessions.push({session_id,reason});exclusion_counts[reason]=(exclusion_counts[reason]||0)+1;continue;}
    selected.push(...group);group.forEach(r=>hashes.add(r.observation_hash));
  }
  for(const session_id of invalid) if(!groups.has(session_id)) {excluded_sessions.push({session_id,reason:'INVALID_EVIDENCE'});exclusion_counts.INVALID_EVIDENCE=(exclusion_counts.INVALID_EVIDENCE||0)+1;}
  return {rows:selected.sort((a,b)=>a.time-b.time),excluded_sessions,exclusion_counts};
}
export async function runTrainingJobs(env) {
  const db = env.DB, now = Date.now();
  const jobs = (await db.prepare("SELECT id FROM raising_training_jobs WHERE status='QUEUED' OR (status='RUNNING' AND lease_until<?) ORDER BY created_at LIMIT 2").bind(now).all()).results;
  for(const {id} of jobs) {
    const token = crypto.randomUUID();
    const job = await db.prepare("UPDATE raising_training_jobs SET status='RUNNING',lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND (status='QUEUED' OR (status='RUNNING' AND lease_until<?)) RETURNING *").bind(token,now+120000,id,now).first();
    if(!job) continue;
    try {
      if(job.attempts>3) throw new Error('RETRY_LIMIT');
      const parent = await db.prepare('SELECT * FROM raising_versions WHERE id=? AND user_id=?').bind(job.parent_version_id,job.user_id).first();
      if(!parent || await training.hashCheckpoint(JSON.parse(parent.checkpoint_json)) !== parent.checkpoint_hash) throw new Error('PARENT_CHECKPOINT_INVALID');
      const rows = JSON.parse(job.rows_json);
      if(rows.length>2000) throw new Error('DATASET_LIMIT');
      const usedIntervals=(await db.prepare("SELECT start,end FROM raising_interval_claims WHERE user_id=? AND kind='EVAL'").bind(job.user_id).all()).results;
      const registry=await db.prepare('SELECT * FROM raising_split_registry WHERE user_id=?').bind(job.user_id).first();
      const assignments=(await db.prepare('SELECT observation_hash,split FROM raising_observation_assignments WHERE user_id=?').bind(job.user_id).all()).results;
      const suppliedHashes=new Set(rows.map(r=>r.observation_hash));
      if(assignments.some(a=>!suppliedHashes.has(a.observation_hash))) throw new Error('GLOBAL_REPLAY_REQUIRED');
      let validationFraction=0.2;
      if(registry) {
        const manifest=JSON.parse(registry.manifest_json),supplied=new Set(rows.map(r=>r.observation_hash));
        if([...manifest.train.observation_hashes,...manifest.validation.observation_hashes].some(h=>!supplied.has(h))) throw new Error('GLOBAL_REPLAY_REQUIRED');
        const boundary=rows.filter(r=>r.time<registry.validation_start).length;
        validationFraction=1-(boundary+0.5)/rows.length;
      }
      const result = await training.trainDecisionHead({rows,parentCheckpoint:JSON.parse(parent.checkpoint_json),usedIntervals,validationFraction,maxEpochs:40,patience:5});
      if(registry && result.split_manifest.validation.start!==registry.validation_start) throw new Error('GLOBAL_SPLIT_CONFLICT');
      const {checkpoint,...summary} = result;
      const intervals=[...new Map(rows.map(r=>[r.session_id,r])).values()];
      await db.batch([
        ...intervals.map(r=>db.prepare("INSERT OR IGNORE INTO raising_interval_claims (id,user_id,kind,start,end) SELECT ?,?,'TRAIN',?,? WHERE EXISTS (SELECT 1 FROM raising_training_jobs WHERE id=? AND status='RUNNING' AND lease_token=?)").bind(`job:${id}:${r.session_id}`,job.user_id,r.interval_start,r.interval_end,id,token)),
        db.prepare("INSERT OR IGNORE INTO raising_split_registry (user_id,manifest_json,validation_start) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM raising_training_jobs WHERE id=? AND status='RUNNING' AND lease_token=?)").bind(job.user_id,JSON.stringify(result.split_manifest),result.split_manifest.validation.start,id,token),
        db.prepare("INSERT OR IGNORE INTO raising_versions (id,user_id,checkpoint_json,checkpoint_hash,training_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM raising_training_jobs WHERE id=? AND status='RUNNING' AND lease_token=?)").bind(`${id}:version`,job.user_id,JSON.stringify(checkpoint),result.checkpoint_hash,id,Date.now(),id,token),
        db.prepare("UPDATE raising_training_jobs SET status='COMPLETED',result_json=?,completed_at=?,lease_until=0 WHERE id=? AND status='RUNNING' AND lease_token=?").bind(JSON.stringify(summary),Date.now(),id,token)
      ]);
    } catch(error) {
      await db.prepare("UPDATE raising_training_jobs SET status='FAILED',error=?,completed_at=?,lease_until=0 WHERE id=? AND status='RUNNING' AND lease_token=?").bind(String(error.message).slice(0,500),Date.now(),id,token).run();
    }
  }
}
