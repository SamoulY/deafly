import {fetchMarket} from './market.mjs';
import {canonical,digest,verifyManifest} from './federation.mjs';
import {initialTeachingModel,taughtDecision} from './companion-learning.mjs';
import {RULES,initialAccount,trade,inputs,initialServerModel,serverDecision,learnCompletedRound,validDecoder} from './universe-policy.mjs';
const json=(v,status=200)=>Response.json(v,{status,headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
const parse=JSON.parse,now=()=>Math.floor(Date.now()/1000),roundId=start=>'day-'+start;
const rows=async(q)=> (await q.all()).results;
export async function ensureRounds(db,at=now()){
 const start=Math.floor(at/RULES.duration)*RULES.duration;
 await db.batch([start,start+RULES.duration].map(s=>db.prepare('INSERT OR IGNORE INTO universe_rounds(id,starts_at,ends_at,rules_json,created_at) VALUES(?,?,?,?,?)').bind(roundId(s),s,s+RULES.duration,JSON.stringify(RULES),at)));
 return {current:roundId(start),next:roundId(start+RULES.duration)};
}
async function latestModel(db){const row=await db.prepare('SELECT * FROM universe_models ORDER BY version DESC LIMIT 1').first();return row?parse(row.model_json):initialServerModel();}
async function ownerProof(db,user,p){
 const error=await verifyManifest(p);if(error)fail(error);
 if(p.owner_user_id!==user.id)fail('OWNER_MISMATCH',403);
 if(!/^[a-f0-9]{64}$/.test(p.checkpoint_hash))fail('REAL_CHECKPOINT_REQUIRED');
 const saved=await db.prepare('SELECT owner_user_id,owner_public_key FROM federation_fly_manifests WHERE fly_id=? ORDER BY sequence LIMIT 1').bind(p.fly_id).first();
 if(!saved||saved.owner_user_id!==user.id||canonical(parse(saved.owner_public_key))!==canonical(p.owner_public_key))fail('FLY_NOT_REGISTERED',403);
}
function publicRound(r){return r?{id:r.id,starts_at:r.starts_at,ends_at:r.ends_at,status:r.status,rules:parse(r.rules_json),model_version:r.model_version,settled_tasks:r.settled_tasks,last_mark_at:r.last_mark_at}:null;}
function entryView(e,r){
 const s=e.state_json?parse(e.state_json):null,expected=Math.floor((r.ends_at-r.starts_at)/parse(r.rules_json).interval);
 const eligible=r.status==='COMPLETE'&&e.received===expected&&e.missed===0;
 return {fly_id:e.fly_id,name:e.display_name,kind:e.kind,net_return:s?s.equity/parse(r.rules_json).initial_usd-1:null,max_drawdown:s?.drawdown??null,equity:s?.equity??null,fees:s?.fees??0,received:e.received,missed:e.missed,expected,coverage:r.settled_tasks?e.received/r.settled_tasks:0,status:r.status==='PENDING'?'QUEUED':eligible?'RANKED':r.status==='RUNNING'?'EVALUATING':'INCOMPLETE',checkpoint_hash:e.checkpoint_hash,teaching_version:e.teaching_json?parse(e.teaching_json).version:null};
}
async function overview(db,user,requested,at){
 const ids=await ensureRounds(db,at),round=await db.prepare('SELECT * FROM universe_rounds WHERE id=?').bind(requested||ids.current).first();if(!round)fail('ROUND_NOT_FOUND',404);
 const entries=await rows(db.prepare('SELECT * FROM universe_entries WHERE round_id=?').bind(round.id));
 const personal=entries.filter(e=>e.kind==='PERSONAL').map(e=>({...entryView(e,round),mine:e.owner_id===user.id}));
 personal.sort((a,b)=>(a.status==='RANKED'?0:1)-(b.status==='RANKED'?0:1)||(b.net_return??-Infinity)-(a.net_return??-Infinity)||a.fly_id.localeCompare(b.fly_id));
 const ranked=personal.filter(e=>e.status==='RANKED');ranked.forEach((e,i)=>{e.rank=i&&e.net_return===ranked[i-1].net_return?ranked[i-1].rank:i+1;e.percentile=ranked.length>1?Math.round(100*ranked.filter(other=>other.net_return<e.net_return).length/(ranked.length-1)):null;});
 const model=await db.prepare('SELECT version,source_round,samples,contributors,created_at,training_loss FROM universe_models ORDER BY version DESC LIMIT 1').first();
 const training=await db.prepare("SELECT round_id,samples,status FROM universe_training WHERE status='RUNNING' ORDER BY round_id LIMIT 1").first();
 const next=await db.prepare('SELECT * FROM universe_rounds WHERE id=?').bind(ids.next).first(),enrolled=await db.prepare('SELECT fly_id,checkpoint_hash,teaching_hash FROM universe_entries WHERE round_id=? AND owner_id=?').bind(ids.next,user.id).first();
 const recent=await rows(db.prepare("SELECT ev.action,ev.created_at,ev.fee,ev.mark_price FROM universe_events ev WHERE ev.round_id=? AND ev.owner_id='@official' ORDER BY ev.created_at DESC LIMIT 8").bind(round.id));
 const clock=await db.prepare('SELECT last_tick,last_error FROM universe_clock WHERE id=1').first();
 return {current_round_id:ids.current,round:publicRound(round),next_round:publicRound(next),enrolled_next:enrolled,rounds:(await rows(db.prepare('SELECT * FROM universe_rounds ORDER BY starts_at DESC LIMIT 15'))).map(publicRound),leaderboard:personal,benchmarks:entries.filter(e=>e.kind!=='PERSONAL').map(e=>entryView(e,round)),mine:personal.find(e=>e.mine)||null,learning:{state:training?'TRAINING':model?'TRAINED':'COLLECTING',model,job:training,direction:'PERSONAL_TO_SERVER_ONLY',backend:'universe-distillation-v1'},official_decisions:recent,clock,execution_trust:'OWNER_SIGNED_BROWSER_REPORT',paper_only:true};
}
export async function handleUniverse(request,env,user,{at=now()}={}){
 const url=new URL(request.url),path=url.pathname,db=env.DB;
 if(!path.startsWith('/api/universe'))return null;
 if(!user)return json({error:'UNAUTHORIZED'},401);
 try{
  if(path==='/api/universe'&&request.method==='GET')return json(await overview(db,user,url.searchParams.get('round'),at));
  if(path==='/api/universe/enroll'&&request.method==='POST'){
   const {proof:p,name}=await request.json();await ownerProof(db,user,p);
   if(p.purpose!=='universe-enroll-v1'||p.consent!==true)fail('EXPLICIT_CONSENT_REQUIRED');
   const ids=await ensureRounds(db,at);if(p.round_id!==ids.next)fail('ENROLL_NEXT_ROUND_ONLY',409);
   const existing=await db.prepare('SELECT * FROM universe_entries WHERE round_id=? AND owner_id=?').bind(p.round_id,user.id).first();
   if(existing){if(existing.fly_id!==p.fly_id||existing.checkpoint_hash!==p.checkpoint_hash)fail('ROUND_POLICY_ALREADY_FROZEN',409);return json({enrolled:true,round_id:p.round_id,checkpoint_hash:existing.checkpoint_hash,teaching_hash:existing.teaching_hash});}
   // Read the existing private head; aggregation never writes personal teaching tables.
   const head=await db.prepare('SELECT checkpoint_json,model_hash FROM companion_models WHERE user_id=?').bind(user.id).first();
   const model=head?parse(head.checkpoint_json):initialTeachingModel(),hash=head?.model_hash||await digest(model);
   const display=String(name||'Fly').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,32)||'Fly';
   try{const inserted=await db.prepare("INSERT INTO universe_entries(round_id,owner_id,fly_id,display_name,kind,checkpoint_hash,teaching_json,teaching_hash,consent_json,joined_at) SELECT ?,?,?,?,'PERSONAL',?,?,?,?,? WHERE (SELECT COUNT(*) FROM universe_entries WHERE round_id=? AND kind='PERSONAL')<1000").bind(p.round_id,user.id,p.fly_id,display,p.checkpoint_hash,JSON.stringify(model),hash,JSON.stringify(p),at,p.round_id).run();if(!inserted.meta.changes)fail('ROUND_CAPACITY_REACHED',409);}
   catch(e){if(/UNIQUE/.test(e.message))fail('ROUND_POLICY_ALREADY_FROZEN',409);throw e;}
   return json({enrolled:true,round_id:p.round_id,checkpoint_hash:p.checkpoint_hash,teaching_hash:hash},201);
  }
  if(path==='/api/universe/task'&&request.method==='GET'){
   const ids=await ensureRounds(db,at),entry=await db.prepare('SELECT * FROM universe_entries WHERE round_id=? AND owner_id=?').bind(ids.current,user.id).first();
   if(!entry)return json({task:null,reason:'NOT_ENROLLED'});
   const task=await db.prepare("SELECT t.* FROM universe_tasks t LEFT JOIN universe_predictions p ON p.task_id=t.id AND p.owner_id=? WHERE t.round_id=? AND t.status='OPEN' AND t.deadline>? AND p.task_id IS NULL ORDER BY t.slot DESC LIMIT 1").bind(user.id,ids.current,at).first();
   return json({task:task?{id:task.id,round_id:task.round_id,snapshot:parse(task.snapshot_json),snapshot_hash:task.snapshot_hash,deadline:task.deadline,checkpoint_hash:entry.checkpoint_hash,teaching_hash:entry.teaching_hash}:null,reason:task?null:'WAITING'});
  }
  if(path==='/api/universe/predict'&&request.method==='POST'){
   const p=await request.json();await ownerProof(db,user,p);
   if(p.purpose!=='universe-prediction-v1'||!validDecoder(p.decoder))fail('INVALID_PREDICTION');
   const task=await db.prepare('SELECT * FROM universe_tasks WHERE id=?').bind(String(p.task_id||'')).first();
   const entry=task&&await db.prepare('SELECT * FROM universe_entries WHERE round_id=? AND owner_id=?').bind(task.round_id,user.id).first();
   if(!entry||entry.fly_id!==p.fly_id)fail('NOT_ENROLLED',403);
   if(p.checkpoint_hash!==entry.checkpoint_hash||p.teaching_hash!==entry.teaching_hash||p.snapshot_hash!==task.snapshot_hash)fail('FROZEN_POLICY_OR_SNAPSHOT_MISMATCH',409);
   const prior=await db.prepare('SELECT decoder_json FROM universe_predictions WHERE task_id=? AND owner_id=?').bind(task.id,user.id).first();
   if(prior){if(canonical(parse(prior.decoder_json))!==canonical(p.decoder))fail('PREDICTION_ALREADY_SUBMITTED',409);return json({accepted:true,replayed:true});}
   if(at>=task.deadline||task.status!=='OPEN')fail('TASK_CLOSED',409);
   await db.prepare('INSERT INTO universe_predictions VALUES(?,?,?,?,?,?,?)').bind(task.id,user.id,p.fly_id,p.checkpoint_hash,JSON.stringify(p.decoder),JSON.stringify(p),at).run();
   return json({accepted:true},201);
  }
  return json({error:'NOT_FOUND'},404);
 }catch(e){if(/UNIVERSE_PREDICTION_CONFLICT|UNIQUE constraint/.test(e.message))return json({error:'PREDICTION_ALREADY_SUBMITTED'},409);return json({error:e.status?e.message:'UNIVERSE_UNAVAILABLE'},e.status||503);}
}

async function activate(db,round,price,at){
 const model=await latestModel(db),state=JSON.stringify(initialAccount(price,parse(round.rules_json)));
 await db.batch([
  db.prepare("UPDATE universe_rounds SET status='RUNNING',model_json=?,model_version=?,start_price=?,last_price=?,last_mark_at=? WHERE id=? AND status='PENDING'").bind(JSON.stringify(model),model.version,price,price,at,round.id),
  ...[['@official','Official fly','OFFICIAL'],['@bitcoin','Hold Bitcoin','BITCOIN']].map(([id,name,kind])=>db.prepare('INSERT OR IGNORE INTO universe_entries(round_id,owner_id,fly_id,display_name,kind,joined_at) VALUES(?,?,?,?,?,?)').bind(round.id,id,id,name,kind,at)),
  db.prepare('UPDATE universe_entries SET state_json=? WHERE round_id=? AND state_json IS NULL').bind(state,round.id),
 ]);
}
async function markRound(db,id,price,time){
 const val="(json_extract(state_json,'$.cash')+json_extract(state_json,'$.quantity')*?)",peak=`max(json_extract(state_json,'$.peak'),${val})`;
 await db.batch([
  db.prepare(`UPDATE universe_entries SET state_json=json_set(state_json,'$.equity',${val},'$.drawdown',max(json_extract(state_json,'$.drawdown'),1-${val}/${peak}),'$.peak',${peak}) WHERE round_id=? AND state_json IS NOT NULL`).bind(price,price,price,price,id),
  db.prepare('UPDATE universe_rounds SET last_price=?,last_mark_at=? WHERE id=?').bind(price,time,id),
 ]);
}
async function settle(db,task,bar,at){
 const round=await db.prepare('SELECT * FROM universe_rounds WHERE id=?').bind(task.round_id).first(),rules=parse(round.rules_json),snapshot=parse(task.snapshot_json);
 // Bounded chunks are resumable through immutable event receipts. A task closes only
 // after every participant (including both benchmarks) has one atomic account update.
 const entries=await rows(db.prepare('SELECT e.*,p.decoder_json FROM universe_entries e LEFT JOIN universe_predictions p ON p.task_id=? AND p.owner_id=e.owner_id LEFT JOIN universe_events ev ON ev.task_id=? AND ev.owner_id=e.owner_id WHERE e.round_id=? AND ev.task_id IS NULL ORDER BY e.owner_id LIMIT 256').bind(task.id,task.id,task.round_id));
 if(entries.length){
  const events=entries.map(e=>{
   const before=parse(e.state_json),x=inputs(snapshot,before),received=e.kind!=='PERSONAL'||!!e.decoder_json;let action='HOLD';
   if(e.kind==='OFFICIAL')action=serverDecision(parse(round.model_json),x);
   if(e.kind==='PERSONAL'&&received)action=taughtDecision(parse(e.teaching_json),x,parse(e.decoder_json),{cash:before.cash,position_side:before.quantity?'LONG':'FLAT'}).direction;
   const result=trade(before,action,bar.open,rules);
   return [task.id,task.round_id,e.owner_id,e.revision,result.action,received?1:0,JSON.stringify(x),e.state_json,JSON.stringify(result.next),result.fee,result.fill,bar.open,task.fill_at];
  });
  // One bound JSON batch avoids one D1 subrequest per fly. Per-row triggers still
  // validate revisions and apply each receipt atomically within this statement.
  await db.prepare(`INSERT INTO universe_events SELECT ${Array.from({length:13},(_,i)=>`json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?)`).bind(JSON.stringify(events)).run();
 }
 const remaining=await db.prepare('SELECT 1 AS remaining FROM universe_entries e LEFT JOIN universe_events ev ON ev.task_id=? AND ev.owner_id=e.owner_id WHERE e.round_id=? AND ev.task_id IS NULL LIMIT 1').bind(task.id,task.round_id).first();
 if(!remaining)await db.batch([db.prepare("UPDATE universe_tasks SET status='SETTLED',fill_price=? WHERE id=? AND status='OPEN'").bind(bar.open,task.id),db.prepare("UPDATE universe_rounds SET settled_tasks=(SELECT COUNT(*) FROM universe_tasks WHERE round_id=? AND status='SETTLED') WHERE id=?").bind(task.round_id,task.round_id)]);
 return !remaining;
}
export async function trainUniverse(db,at=now()){
 let job=await db.prepare("SELECT * FROM universe_training WHERE status='RUNNING' ORDER BY round_id LIMIT 1").first();
 if(!job){
  const round=await db.prepare("SELECT r.id FROM universe_rounds r LEFT JOIN universe_training j ON j.round_id=r.id WHERE r.status='COMPLETE' AND r.ends_at<=? AND j.round_id IS NULL ORDER BY r.starts_at LIMIT 1").bind(at).first();if(!round)return;
  const base=await latestModel(db);await db.prepare('INSERT OR IGNORE INTO universe_training(round_id,model_json,parent_version) VALUES(?,?,?)').bind(round.id,JSON.stringify(base),base.version).run();job=await db.prepare('SELECT * FROM universe_training WHERE round_id=?').bind(round.id).first();
 }
 for(let batch=0;batch<4;batch++){
  const task=await db.prepare("SELECT t.*,(SELECT fill_price FROM universe_tasks n WHERE n.round_id=t.round_id AND n.slot=t.slot+1 AND n.status='SETTLED') AS future_price FROM universe_tasks t WHERE t.round_id=? AND t.slot>? AND t.status='SETTLED' ORDER BY t.slot LIMIT 1").bind(job.round_id,job.cursor).first();
  if(!task){
   const contributors=(await db.prepare("SELECT COUNT(DISTINCT e.owner_id) AS n FROM universe_events ev JOIN universe_entries e ON e.round_id=ev.round_id AND e.owner_id=ev.owner_id WHERE ev.round_id=? AND ev.received=1 AND e.kind='PERSONAL'").bind(job.round_id).first()).n;
   const model=parse(job.model_json);model.version=job.parent_version+1;
   const statements=[];
   if(job.samples)statements.push(db.prepare('INSERT OR IGNORE INTO universe_models VALUES(?,?,?,?,?,?,?)').bind(model.version,job.round_id,JSON.stringify(model),job.samples,contributors,at,job.loss_total/job.samples));
   statements.push(db.prepare("UPDATE universe_training SET status='COMPLETE' WHERE round_id=?").bind(job.round_id));await db.batch(statements);return;
  }
  const events=task.future_price?await rows(db.prepare("SELECT ev.*,e.checkpoint_hash,e.teaching_hash FROM universe_events ev JOIN universe_entries e ON e.round_id=ev.round_id AND e.owner_id=ev.owner_id WHERE ev.task_id=? AND ev.received=1 AND e.kind='PERSONAL' ORDER BY e.fly_id").bind(task.id)):[];
  const examples=events.map(e=>({task_id:e.task_id,policy_hash:e.checkpoint_hash+e.teaching_hash,features:parse(e.features_json),action:e.action,before:parse(e.before_json),after:parse(e.after_json),future_price:task.future_price}));
  const trained=learnCompletedRound(parse(job.model_json),examples);job={...job,cursor:task.slot,model_json:JSON.stringify(trained.model),samples:job.samples+examples.length,loss_total:job.loss_total+trained.loss*examples.length};
  await db.prepare('UPDATE universe_training SET cursor=?,model_json=?,samples=?,loss_total=? WHERE round_id=?').bind(job.cursor,job.model_json,job.samples,job.loss_total,job.round_id).run();
 }
}
export async function tickUniverse(env,{at=now(),market=null}={}){
 const db=env.DB,token=crypto.randomUUID();
 const lease=await db.prepare('UPDATE universe_clock SET lease_until=?,token=? WHERE id=1 AND lease_until<=?').bind(at+180,token,at).run();if(!lease.meta.changes)return {busy:true};
 try{
  const ids=await ensureRounds(db,at);market=market||await fetchMarket('BTCUSD',env);
  if(market.synthetic||!market.bars?.length)throw Error('UNIVERSE_REAL_MARKET_REQUIRED');
  const bars=market.bars,last=bars.at(-1);if(last.time+60>at||at-(last.time+60)>90)throw Error('UNIVERSE_MARKET_STALE');
  // Settle old tasks before opening new ones. Exact future bars, never a supplied
  // client price, determine fills; a missing execution bar invalidates that task.
  const pending=await rows(db.prepare("SELECT * FROM universe_tasks WHERE status='OPEN' AND fill_at+60<=? ORDER BY fill_at LIMIT 4").bind(at));
  for(const task of pending){const bar=bars.find(b=>b.time===task.fill_at);if(bar){let done=false;for(let chunk=0;chunk<4&&!done;chunk++)done=await settle(db,task,bar,at);if(!done)return {settling:true};}else if(task.fill_at<bars[0].time)await db.prepare("UPDATE universe_tasks SET status='MISSING_DATA' WHERE id=?").bind(task.id).run();}
  const expired=await rows(db.prepare("SELECT * FROM universe_rounds WHERE ends_at<=? AND status IN ('PENDING','RUNNING') ORDER BY ends_at LIMIT 4").bind(at));
  for(const r of expired){
   if(await db.prepare("SELECT 1 AS pending FROM universe_tasks WHERE round_id=? AND status='OPEN' LIMIT 1").bind(r.id).first())continue;
   const end=bars.find(b=>b.time===r.ends_at-60);if(end&&r.start_price)await markRound(db,r.id,end.close,r.ends_at);
   const rules=parse(r.rules_json),complete=!!end&&r.settled_tasks===(r.ends_at-r.starts_at)/rules.interval;
   await db.prepare('UPDATE universe_rounds SET status=? WHERE id=?').bind(complete?'COMPLETE':'INCOMPLETE',r.id).run();
  }
  let round=await db.prepare('SELECT * FROM universe_rounds WHERE id=?').bind(ids.current).first();
  if(round.status==='PENDING'){await activate(db,round,last.close,at);round=await db.prepare('SELECT * FROM universe_rounds WHERE id=?').bind(ids.current).first();}
  const rules=parse(round.rules_json),slot=Math.floor((at-round.starts_at)/rules.interval),start=round.starts_at+slot*rules.interval;
  // Late scheduler invocations never invent a past decision opportunity.
  if(round.status==='RUNNING'&&at-start<60){
   const snapshot={symbol:'BTCUSD',source:market.source||market.provider,bars:bars.slice(-40),observed_at:at};
   await db.prepare('INSERT OR IGNORE INTO universe_tasks(id,round_id,slot,snapshot_json,snapshot_hash,deadline,fill_at,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(round.id+'-'+slot,round.id,slot,JSON.stringify(snapshot),await digest(snapshot),start+rules.submission_seconds,start+rules.submission_seconds+60,at).run();
  }
  await markRound(db,round.id,last.close,last.time+60);
  await trainUniverse(db,at);
  await db.prepare('UPDATE universe_clock SET last_tick=?,last_error=NULL WHERE id=1 AND token=?').bind(at,token).run();return {ok:true};
 }catch(e){await db.prepare('UPDATE universe_clock SET last_error=? WHERE id=1 AND token=?').bind(String(e.message).slice(0,180),token).run();throw e;}
 finally{await db.prepare('UPDATE universe_clock SET lease_until=0 WHERE id=1 AND token=?').bind(token).run();}
}
