import { vote, ACTIONS } from './colony.mjs';
import { fetchMarket } from './market.mjs';
import { verifyManifest, canonical, digest } from './federation.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*'}});
const fail=(error,status=422)=>{throw Object.assign(new Error(error),{status});};
async function proofOwner(env,user,proof){
 const error=await verifyManifest(proof);if(error)fail(error);
 if(proof.owner_user_id!==user.id)fail('OWNER_MISMATCH',403);
 const registered=await env.DB.prepare('SELECT * FROM federation_fly_manifests WHERE fly_id=? ORDER BY sequence ASC LIMIT 1').bind(proof.fly_id).first();
 if(!registered)fail('FLY_NOT_REGISTERED',403);
 if(registered.owner_user_id!==user.id||canonical(JSON.parse(registered.owner_public_key))!==canonical(proof.owner_public_key))fail('OWNER_MISMATCH',403);
}
function taskView(row){return {task_id:row.task_id,colony_id:row.colony_id,snapshot:JSON.parse(row.snapshot_json),snapshot_hash:row.snapshot_hash,members:JSON.parse(row.members_json),quorum:row.quorum,required:Math.ceil(JSON.parse(row.members_json).length*row.quorum),deadline:row.deadline,created_at:row.created_at,status:row.status,result:row.result_json?JSON.parse(row.result_json):null,result_hash:row.result_hash,rule_version:'colony-v2',authority:'OWNER_SIGNED_REPORT',paper_only:true};}
async function finalizeTask(env,row){
 const members=JSON.parse(row.members_json);
   // Votes are append-only. A count compare-and-swap validates the exact read set;
   // a concurrent insert invalidates this update and forces a fresh aggregation.
   for(let attempt=0;attempt<8;attempt++){
    if(row.status==='FINALIZED')return json(taskView(row));
    const votes=(await env.DB.prepare('SELECT action,checkpoint_hash FROM colony_votes WHERE task_id=? ORDER BY member_user_id').bind(row.task_id).all()).results;
    if(Date.now()<row.deadline&&votes.length<members.length)fail('TASK_NOT_READY',409);
    const result={...vote(votes,{quorum:row.quorum,memberCount:members.length}),task_id:row.task_id,snapshot_hash:row.snapshot_hash,quorum:row.quorum,member_count:members.length,authority:'OWNER_SIGNED_REPORT',paper_only:true};
    await env.DB.prepare(`UPDATE colony_tasks SET status='FINALIZED',result_json=?,result_hash=? WHERE task_id=? AND status='OPEN'
     AND (SELECT COUNT(*) FROM colony_votes WHERE task_id=?)=?
     AND (deadline<=? OR (SELECT COUNT(*) FROM colony_votes WHERE task_id=?)=json_array_length(members_json))`).bind(JSON.stringify(result),await digest(result),row.task_id,row.task_id,votes.length,Date.now(),row.task_id).run();
    row=await env.DB.prepare('SELECT * FROM colony_tasks WHERE task_id=?').bind(row.task_id).first();
   }
   if(row.status==='FINALIZED')return json(taskView(row));
   fail('FINALIZATION_RETRY',409);
}
export async function colonyService(request,env,user,path){
 if(path!=='/api/colony'&&!path.startsWith('/api/colony/'))return null;
 if(path==='/api/colony/submissions'||path==='/api/colony/vote')return null;
 if(!user)return json({error:'UNAUTHORIZED'},401);
 try{
  let b={};if(request.method==='POST'){try{b=await request.json();}catch{fail('INVALID_JSON',400);}if(!b||Array.isArray(b)||typeof b!=='object')fail('INVALID_BODY');}
  if(path==='/api/colony/auto/enroll'&&request.method==='POST'){
   if(Object.keys(b).some(k=>k!=='proof'))fail('INVALID_BODY');
   await proofOwner(env,user,b.proof);
   if(b.proof.purpose!=='colony-auto-enroll'||b.proof.consent!==true)fail('EXPLICIT_CONSENT_REQUIRED');
   const id='defly-default-v1',now=Date.now();
   const saved=await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO colonies VALUES(?,?,?,?)').bind(id,'system:automatic-colony',0.5,now),
    env.DB.prepare('INSERT OR IGNORE INTO colony_members VALUES(?,?,?,?,?)').bind(id,user.id,b.proof.fly_id,JSON.stringify(b.proof),now)
   ]);
   const member=await env.DB.prepare('SELECT fly_id FROM colony_members WHERE colony_id=? AND member_user_id=?').bind(id,user.id).first();
   if(member?.fly_id!==b.proof.fly_id)fail('MEMBER_IDENTITY_PINNED',409);
   return json({colony_id:id,fly_id:member.fly_id,enrolled:true,paper_only:true},saved[1].meta.changes?201:200);
  }
  if(path==='/api/colony/auto/next'&&request.method==='POST'){
   if(Object.keys(b).some(k=>k!=='recover_task_id')||('recover_task_id' in b&&(typeof b.recover_task_id!=='string'||!b.recover_task_id.length||b.recover_task_id.length>100)))fail('INVALID_BODY');
   const colony_id='defly-default-v1';
   const member=await env.DB.prepare('SELECT fly_id FROM colony_members WHERE colony_id=? AND member_user_id=?').bind(colony_id,user.id).first();
   if(!member)fail('NOT_ENROLLED',403);
   // Explicit recovery is read-only and precedes dispatch/finalization. Ordinary
   // polling must advance instead of replaying the latest accepted ballot forever.
   if(b.recover_task_id){
    const recovered=await env.DB.prepare('SELECT * FROM colony_tasks WHERE task_id=? AND colony_id=?').bind(b.recover_task_id,colony_id).first();
    if(!recovered)fail('TASK_NOT_FOUND',404);
    if(!JSON.parse(recovered.members_json).some(m=>m.member_user_id===user.id&&m.fly_id===member.fly_id))fail('NOT_MEMBER',403);
    const my_vote=await env.DB.prepare('SELECT vote_id,action,checkpoint_hash FROM colony_votes WHERE task_id=? AND member_user_id=? AND fly_id=?').bind(recovered.task_id,user.id,member.fly_id).first();
    if(my_vote){
     const claim=await env.DB.prepare('SELECT claim_id,task_id,fly_id,created_at FROM colony_task_claims WHERE task_id=? AND member_user_id=? AND fly_id=?').bind(recovered.task_id,user.id,member.fly_id).first();
     return json({colony_id,fly_id:member.fly_id,task:taskView(recovered),claim,my_vote,waiting_reason:null,retry_after_ms:5000,paper_only:true});
    }
   }
   const empty=(waiting_reason,retry_after_ms=5000)=>json({colony_id,fly_id:member.fly_id,task:null,claim:null,my_vote:null,waiting_reason,retry_after_ms,paper_only:true});
   const open=()=>env.DB.prepare("SELECT * FROM colony_tasks WHERE colony_id=? AND status='OPEN' LIMIT 1").bind(colony_id).first();
   let row=await open();
   if(row){
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM colony_votes WHERE task_id=?').bind(row.task_id).first();
    if(row.deadline<=Date.now()||count.n===JSON.parse(row.members_json).length){await finalizeTask(env,row);row=await open();}
   }
   if(!row){
    const now=Date.now(),token=crypto.randomUUID();
    await env.DB.prepare('INSERT OR IGNORE INTO colony_auto_dispatch(colony_id) VALUES(?)').bind(colony_id).run();
    const lease=await env.DB.prepare(`UPDATE colony_auto_dispatch SET next_attempt_at=?,lease_token=? WHERE colony_id=? AND next_attempt_at<=?
     AND NOT EXISTS(SELECT 1 FROM colony_tasks WHERE colony_id=? AND status='OPEN')`).bind(now+60000,token,colony_id,now,colony_id).run();
    if(lease.meta.changes){
     let snapshot;try{snapshot=await fetchMarket('BTCUSD',env);}catch{fail('MARKET_UNAVAILABLE',503);}
     const at=Date.now();
     await env.DB.prepare(`INSERT INTO colony_tasks(task_id,colony_id,snapshot_json,snapshot_hash,members_json,quorum,deadline,created_at)
      SELECT ?,?,?,?,(SELECT json_group_array(json_object('member_user_id',member_user_id,'fly_id',fly_id)) FROM (SELECT member_user_id,fly_id FROM colony_members WHERE colony_id=? ORDER BY member_user_id)),0.5,?,?
      WHERE EXISTS(SELECT 1 FROM colony_auto_dispatch WHERE colony_id=? AND lease_token=? AND next_attempt_at>?)
      AND NOT EXISTS(SELECT 1 FROM colony_tasks WHERE colony_id=? AND status='OPEN')`).bind(crypto.randomUUID(),colony_id,JSON.stringify(snapshot),await digest(snapshot),colony_id,at+300000,at,colony_id,token,at,colony_id).run();
    }
    row=await open();
    if(!row){const gate=await env.DB.prepare('SELECT next_attempt_at FROM colony_auto_dispatch WHERE colony_id=?').bind(colony_id).first();return empty('RATE_LIMITED',Math.max(1000,gate.next_attempt_at-Date.now()));}
   }
   if(!JSON.parse(row.members_json).some(m=>m.member_user_id===user.id&&m.fly_id===member.fly_id))return empty('NEXT_ROUND',Math.max(1000,row.deadline-Date.now()));
   try{await env.DB.prepare('INSERT OR IGNORE INTO colony_task_claims VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),row.task_id,user.id,member.fly_id,Date.now()).run();}
   catch(e){if(/TASK_CLOSED_OR_NOT_MEMBER/.test(e.message))return empty('DISPATCH_BUSY');throw e;}
   const claim=await env.DB.prepare('SELECT claim_id,task_id,fly_id,created_at FROM colony_task_claims WHERE task_id=? AND member_user_id=?').bind(row.task_id,user.id).first();
   const my_vote=await env.DB.prepare('SELECT vote_id,action,checkpoint_hash FROM colony_votes WHERE task_id=? AND member_user_id=?').bind(row.task_id,user.id).first();
   return json({colony_id,fly_id:member.fly_id,task:taskView(row),claim,my_vote,waiting_reason:null,retry_after_ms:5000,paper_only:true});
  }
  if(path==='/api/colony'&&request.method==='POST'){
   if(!Number.isFinite(b.quorum)||b.quorum<=0||b.quorum>1)fail('INVALID_QUORUM');
   await proofOwner(env,user,b.proof);
   if(b.proof.purpose!=='colony-create'||b.proof.quorum!==b.quorum)fail('PROOF_BINDING_MISMATCH');
   const id=crypto.randomUUID(),now=Date.now();
   await env.DB.batch([
    env.DB.prepare('INSERT INTO colonies VALUES(?,?,?,?)').bind(id,user.id,b.quorum,now),
    env.DB.prepare('INSERT INTO colony_members VALUES(?,?,?,?,?)').bind(id,user.id,b.proof.fly_id,JSON.stringify(b.proof),now)
   ]);
   return json({colony_id:id},201);
  }
  const child=path.match(/^\/api\/colony\/([^/]+)\/(join|tasks)$/);
  if(child&&request.method==='POST'){
   if(child[1]==='defly-default-v1')fail('AUTOMATIC_ENROLLMENT_REQUIRED',403);
   const row=await env.DB.prepare('SELECT * FROM colonies WHERE colony_id=?').bind(child[1]).first();if(!row)fail('COLONY_NOT_FOUND',404);
   if(child[2]==='join'){
    await proofOwner(env,user,b.proof);
    if(b.proof.purpose!=='colony-join'||b.proof.colony_id!==row.colony_id)fail('PROOF_BINDING_MISMATCH');
    const prior=await env.DB.prepare('SELECT fly_id FROM colony_members WHERE colony_id=? AND member_user_id=?').bind(row.colony_id,user.id).first();
    if(prior){if(prior.fly_id!==b.proof.fly_id)fail('MEMBER_IDENTITY_PINNED',409);return json({colony_id:row.colony_id,fly_id:prior.fly_id});}
    await env.DB.prepare('INSERT INTO colony_members VALUES(?,?,?,?,?)').bind(row.colony_id,user.id,b.proof.fly_id,JSON.stringify(b.proof),Date.now()).run();
    return json({colony_id:row.colony_id,fly_id:b.proof.fly_id},201);
   }
   if(row.owner_user_id!==user.id)fail('OWNER_ONLY',403);
   if(Object.keys(b).some(k=>!['symbol','duration_ms'].includes(k))||typeof b.symbol!=='string'||!Number.isSafeInteger(b.duration_ms)||b.duration_ms<1000||b.duration_ms>3600000)fail('INVALID_TASK');
   let snapshot;try{snapshot=await fetchMarket(b.symbol,env);}catch(e){fail(e.message,e.message==='INVALID_SYMBOL'?422:503);}
   const now=Date.now(),id=crypto.randomUUID();
   await env.DB.prepare(`INSERT INTO colony_tasks(task_id,colony_id,snapshot_json,snapshot_hash,members_json,quorum,deadline,created_at)
    SELECT ?,?,?,?,(SELECT json_group_array(json_object('member_user_id',member_user_id,'fly_id',fly_id)) FROM (SELECT member_user_id,fly_id FROM colony_members WHERE colony_id=? ORDER BY member_user_id)),?,?,?`).bind(id,row.colony_id,JSON.stringify(snapshot),await digest(snapshot),row.colony_id,row.quorum,now+b.duration_ms,now).run();
   return json(taskView(await env.DB.prepare('SELECT * FROM colony_tasks WHERE task_id=?').bind(id).first()),201);
  }
  const correctionMatch=path.match(/^\/api\/colony\/tasks\/([^/]+)\/corrections$/);
  if(correctionMatch&&['GET','POST'].includes(request.method)){
   const task_id=correctionMatch[1];
   const task=await env.DB.prepare('SELECT members_json FROM colony_tasks WHERE task_id=?').bind(task_id).first();
   if(!task)fail('TASK_NOT_FOUND',404);
   if(!JSON.parse(task.members_json).some(m=>m.member_user_id===user.id))fail('NOT_MEMBER',403);
   const original=await env.DB.prepare('SELECT vote_id,fly_id,action,checkpoint_hash FROM colony_votes WHERE task_id=? AND member_user_id=?').bind(task_id,user.id).first();
   const fields='correction_id,task_id,vote_id,fly_id,action,note,created_at';
   const tags={authority:'HUMAN_CORRECTION',learning_applied:false,paper_only:true};
   if(request.method==='GET')return json({vote:original?{vote_id:original.vote_id,action:original.action,checkpoint_hash:original.checkpoint_hash}:null,corrections:(await env.DB.prepare(`SELECT ${fields} FROM colony_human_corrections WHERE task_id=? AND member_user_id=? ORDER BY created_at,correction_id`).bind(task_id,user.id).all()).results,...tags});
   if(Object.keys(b).some(k=>!['vote_id','action','note','correction_id'].includes(k))||typeof b.vote_id!=='string'||!ACTIONS.includes(b.action)||typeof b.correction_id!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(b.correction_id)||(b.note!==undefined&&(typeof b.note!=='string'||b.note.length>1000)))fail('INVALID_CORRECTION');
   if(!original||original.vote_id!==b.vote_id)fail('VOTE_OWNER_MISMATCH',403);
   const note=b.note??'';
   const prior=()=>env.DB.prepare(`SELECT ${fields} FROM colony_human_corrections WHERE member_user_id=? AND correction_id=?`).bind(user.id,b.correction_id).first();
   const response=(correction,status)=>{if(correction.task_id!==task_id||correction.vote_id!==b.vote_id||correction.action!==b.action||correction.note!==note)fail('CORRECTION_ID_CONFLICT',409);return json({correction,...tags},status);};
   const existing=await prior();if(existing)return response(existing,200);
   try{await env.DB.prepare('INSERT INTO colony_human_corrections VALUES(?,?,?,?,?,?,?,?)').bind(b.correction_id,task_id,b.vote_id,user.id,original.fly_id,b.action,note,Date.now()).run();}
   catch(e){if(/UNIQUE|CORRECTION_LIMIT/.test(e.message)){const saved=await prior();if(saved)return response(saved,200);fail('CORRECTION_LIMIT',409);}throw e;}
   return response(await prior(),201);
  }
  const operation=path.match(/^\/api\/colony\/tasks\/([^/]+)\/(votes|finalize)$/);
  if(operation&&request.method==='POST'){
   let row=await env.DB.prepare('SELECT * FROM colony_tasks WHERE task_id=?').bind(operation[1]).first();if(!row)fail('TASK_NOT_FOUND',404);
   const members=JSON.parse(row.members_json),member=members.find(m=>m.member_user_id===user.id);if(!member)fail('NOT_MEMBER',403);
   if(operation[2]==='votes'){
    await proofOwner(env,user,b);
    if(b.purpose!=='colony-vote'||b.task_id!==row.task_id||b.snapshot_hash!==row.snapshot_hash||!ACTIONS.includes(b.action)||! /^[a-f0-9]{64}$/.test(b.checkpoint_hash))fail('PROOF_BINDING_MISMATCH');
    if(b.fly_id!==member.fly_id)fail('MEMBER_IDENTITY_PINNED',403);
    if(row.status!=='OPEN'||Date.now()>=row.deadline)fail('TASK_CLOSED',409);
    const id=crypto.randomUUID();
    try{await env.DB.prepare('INSERT INTO colony_votes VALUES(?,?,?,?,?,?,?,?)').bind(id,row.task_id,user.id,b.fly_id,b.action,b.checkpoint_hash,JSON.stringify(b),Date.now()).run();}
    catch(e){if(/UNIQUE|TASK_CLOSED_OR_NOT_MEMBER/.test(e.message))fail('DUPLICATE_OR_CLOSED',409);throw e;}
    return json({accepted:true,vote_id:id,task_id:row.task_id,authority:'OWNER_SIGNED_REPORT'},201);
   }
   return await finalizeTask(env,row);
  }
  const taskMatch=path.match(/^\/api\/colony\/tasks\/([^/]+)$/);
  if(taskMatch&&request.method==='GET'){
   const row=await env.DB.prepare('SELECT * FROM colony_tasks WHERE task_id=?').bind(taskMatch[1]).first();if(!row)fail('TASK_NOT_FOUND',404);
   if(!JSON.parse(row.members_json).some(m=>m.member_user_id===user.id))fail('NOT_MEMBER',403);
   return json(taskView(row));
  }
  const match=path.match(/^\/api\/colony\/([^/]+)$/);
  if(match&&request.method==='GET'){
   const row=await env.DB.prepare('SELECT * FROM colonies WHERE colony_id=?').bind(match[1]).first();if(!row)fail('COLONY_NOT_FOUND',404);
   const members=(await env.DB.prepare('SELECT member_user_id,fly_id FROM colony_members WHERE colony_id=? ORDER BY member_user_id').bind(match[1]).all()).results;
   if(!members.some(m=>m.member_user_id===user.id))fail('NOT_MEMBER',403);
   return json({...row,members});
  }
  return json({error:'NOT_FOUND'},404);
 }catch(e){if(e.status)return json({error:e.message},e.status);throw e;}
}
