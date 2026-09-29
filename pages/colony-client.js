import {signManifest} from './fly-identity.js';
import {encodeMarketObservation} from './browser-brain-client.js';
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(v)))),b=>b.toString(16).padStart(2,'0')).join('');
const idPath=id=>encodeURIComponent(String(id||'').trim());
export function createColonyClient({api,identity,storage=localStorage,withBrain}) {
 let owner,sequence=0,busy=false;
 const post=(path,body)=>api(path,{method:'POST',body});
 async function init(){if(!owner){owner=(await api('/api/state')).user?.id;if(!owner)throw Error('SESSION_OWNER_REQUIRED');sequence=Number(storage.getItem(`defly.colony.sequence:${owner}:${identity.fly_id}`)||0);}return owner;}
 const key=()=>`defly.colony:${owner}:${identity.fly_id}`;
 async function remember(values){await init();let old={};try{old=JSON.parse(storage.getItem(key())||'{}')}catch{}storage.setItem(key(),JSON.stringify({...old,...values}));}
 async function saved(){await init();try{return JSON.parse(storage.getItem(key())||'{}')}catch{return {}}}
 async function proof(hash,extra){await init();if(!/^[a-f0-9]{64}$/.test(hash||''))throw Error('REAL_CHECKPOINT_REQUIRED');return signManifest(identity,{owner_user_id:owner,checkpoint_hash:hash,sequence,...extra});}
 const sequenceKey=()=>`defly.colony.sequence:${owner}:${identity.fly_id}`;
 function advanceSequence(next=0){const stored=Number(storage.getItem(sequenceKey()));sequence=Math.max(Number.isSafeInteger(sequence)&&sequence>=0?sequence:0,Number.isSafeInteger(stored)&&stored>=0?stored:0,next);storage.setItem(sequenceKey(),String(sequence));}
 async function register(brain){
  await init();
  for(let attempt=0;attempt<3;attempt++){
   advanceSequence();
   const checkpoint=await brain.saveCheckpoint();
   const signed=await proof(checkpoint.hash,{});
   // Reserve before sending: an ambiguous network failure may already be committed.
   advanceSequence(signed.sequence+1);
   try{await post('/api/federation/fly-manifest',signed);return checkpoint.hash;}
   catch(error){
    const current=error.current;
    if(error.status!==409||error.code!=='SEQUENCE_CONFLICT'||!Number.isSafeInteger(current?.sequence)||current.sequence<0||current.sequence>=Number.MAX_SAFE_INTEGER||current.owner_user_id!==owner)throw error;
    advanceSequence(current.sequence+1);
    if(attempt===2)throw error;
   }
  }
 }
 async function exclusive(fn){if(busy)throw Error('COLONY_BUSY');busy=true;try{return await fn()}finally{busy=false}}
 async function create({consent,quorum=0.5}){if(consent!==true)throw Error('EXPLICIT_CONSENT_REQUIRED');if(!Number.isFinite(quorum)||quorum<=0||quorum>1)throw Error('INVALID_QUORUM');return exclusive(()=>withBrain(async brain=>{const hash=await register(brain);const result=await post('/api/colony',{quorum,proof:await proof(hash,{purpose:'colony-create',quorum})});await remember({colony_id:result.colony_id,task_id:''});return result;}));}
 async function join(colony_id,{consent}){if(consent!==true)throw Error('EXPLICIT_CONSENT_REQUIRED');return exclusive(()=>withBrain(async brain=>{const hash=await register(brain);const result=await post(`/api/colony/${idPath(colony_id)}/join`,{proof:await proof(hash,{purpose:'colony-join',colony_id})});await remember({colony_id,task_id:''});return result;}));}
 async function open(task_id){const task=await api(`/api/colony/tasks/${idPath(task_id)}`);await remember({task_id:task.task_id,colony_id:task.colony_id});return task;}
 async function vote(task_id,{isActive=()=>true}={}){return exclusive(()=>withBrain(async brain=>{const check=()=>{if(!isActive())throw Error('DECISIONS_PAUSED');};check();await init();const task=await open(task_id);if(task.status!=='OPEN'||Date.now()>=task.deadline)throw Error('TASK_CLOSED');if(!task.members.some(m=>m.member_user_id===owner&&m.fly_id===identity.fly_id))throw Error('NOT_MEMBER');if(await digest(task.snapshot)!==task.snapshot_hash)throw Error('SNAPSHOT_HASH_MISMATCH');const checkpoint=await brain.saveCheckpoint();const frame=await encodeMarketObservation({...task.snapshot,candles:task.snapshot.bars,snapshot_hash:task.snapshot_hash});check();const output=await brain.infer(frame);check();const action=output?.decoder?.proposed_action;if(!['BUY','SELL','HOLD','CLOSE'].includes(action))throw Error('DECODER_ACTION_UNAVAILABLE');const ballot=await proof(checkpoint.hash,{purpose:'colony-vote',task_id:task.task_id,snapshot_hash:task.snapshot_hash,action});check();await remember({pending_vote_task_id:task.task_id});check();const result=await post(`/api/colony/tasks/${idPath(task.task_id)}/votes`,ballot);return {...result,task_id:task.task_id,action,checkpoint_hash:checkpoint.hash};}));}
 async function enroll({consent}){if(consent!==true)throw Error('EXPLICIT_CONSENT_REQUIRED');return exclusive(()=>withBrain(async brain=>{const hash=await register(brain);const result=await post('/api/colony/auto/enroll',{proof:await proof(hash,{purpose:'colony-auto-enroll',consent:true})});await remember({auto_consent:true,colony_id:result.colony_id});return result;}));}
 async function claim(){const pending=(await saved()).pending_vote_task_id;return post('/api/colony/auto/next',pending?{recover_task_id:pending}:{});}
 async function acknowledgeVote(task_id){if((await saved()).pending_vote_task_id===task_id)await remember({pending_vote_task_id:''});}
 async function correct({task_id,vote_id,action,correction_id}){await init();if(!task_id||!vote_id||!correction_id||!['BUY','SELL','HOLD','CLOSE'].includes(action))throw Error('INVALID_CORRECTION');return post(`/api/colony/tasks/${idPath(task_id)}/corrections`,{vote_id,action,correction_id});}
 return {init,saved,enroll,claim,acknowledgeVote,correct,create,join,open,vote,colony:colony_id=>api(`/api/colony/${idPath(colony_id)}`),async createTask(colony_id,{symbol='BTCUSD',duration_ms=300000}={}){const task=await post(`/api/colony/${idPath(colony_id)}/tasks`,{symbol,duration_ms});await remember({colony_id,task_id:task.task_id});return task;},async finalize(task_id){await post(`/api/colony/tasks/${idPath(task_id)}/finalize`,{});return open(task_id);}};
}
