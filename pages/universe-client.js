import {signManifest} from './fly-identity.js';
import {encodeMarketObservation} from './browser-brain-client.js?v=2';
import {digest} from './neural-contract.js';
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
export function createUniverseClient({api,identity,owner,checkpointKey,store,withBrain,register,getName}){
 const key=round=>`universe:${checkpointKey}:${round}`;
 const post=(path,body)=>api(path,{method:'POST',body});
 const proof=(hash,extra)=>signManifest(identity,{owner_user_id:owner,checkpoint_hash:hash,sequence:0,...extra});
 async function enroll(round,{consent}){
  if(consent!==true)throw Error('EXPLICIT_CONSENT_REQUIRED');
  // An ambiguous HTTP failure must retry the same frozen copy, not today's brain.
  let saved=await store.load(key(round));
  if(!saved)await withBrain(async brain=>{await register(brain);saved=await brain.captureCheckpoint();try{await store.save(key(round),saved,null);}catch(error){const winner=await store.load(key(round));if(!winner)throw error;saved=winner;}});
  return post('/api/universe/enroll',{name:getName?.()||'Fly',proof:await proof(saved.hash,{purpose:'universe-enroll-v1',round_id:round,consent:true})});
 }
 async function contribute({isActive=()=>true}={}){
  const {task}=await api('/api/universe/task');if(!task)return {waiting:true};
  const saved=await store.load(key(task.round_id));if(!saved||saved.hash!==task.checkpoint_hash)throw Error('FROZEN_CHECKPOINT_MISSING');
  if(await digest(ordered(task.snapshot))!==task.snapshot_hash)throw Error('SNAPSHOT_HASH_MISMATCH');
  return withBrain(async brain=>{
   if(!isActive())throw Error('DECISIONS_PAUSED');
   const checkpoint=await brain.saveCheckpoint();if(checkpoint.hash!==task.checkpoint_hash)throw Error('FROZEN_CHECKPOINT_MISMATCH');
   const frame=await encodeMarketObservation({...task.snapshot,candles:task.snapshot.bars,snapshot_hash:task.snapshot_hash}),output=await brain.infer(frame);
   if(!isActive())throw Error('DECISIONS_PAUSED');
   return post('/api/universe/predict',await proof(checkpoint.hash,{purpose:'universe-prediction-v1',task_id:task.id,snapshot_hash:task.snapshot_hash,teaching_hash:task.teaching_hash,decoder:output.decoder}));
  },{checkpointKey:key(task.round_id)});
 }
 return {enroll,contribute,async overview(round){const data=await api('/api/universe'+(round?'?round='+encodeURIComponent(round):''));await store.pruneEvaluationCopies?.(checkpointKey,[key(data.current_round_id),key(data.next_round.id)]);return data;}};
}
