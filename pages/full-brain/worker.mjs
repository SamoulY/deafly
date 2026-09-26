import {createBrain,hash} from './brain.mjs';
import {captureCheckpoint,restoreCheckpoint,checkpointStore} from './checkpoint.mjs';
import {createStateHasher} from './state-hash.mjs';
let brain,stateHasher,sample=[],busy=false,scope='observation',checkpointKey=null;const store=checkpointStore();
self.onmessage=async({data:m})=>{try{
 if(m.type==='INIT'){if(busy)throw Error('Runtime busy');busy=true;scope=m.scope||'observation';brain=await createBrain((loaded,total)=>postMessage({type:'PROGRESS',loaded,total}));stateHasher=createStateHasher(brain.arrays,hash);const map=new Map(Array.from(brain.arrays.ids,(id,i)=>[String(id),i]));sample=m.sample_ids.map(id=>({id,index:map.get(id)}));if(sample.some(x=>x.index===undefined))throw Error('Unknown sample node');checkpointKey=m.checkpoint_key;let restored=false;if(scope==='autonomy'&&checkpointKey){const saved=await store.load(checkpointKey);if(saved){await restoreCheckpoint(brain,saved,scope);restored=true;}}busy=false;postMessage({type:'READY',scope,heap_bytes:brain.heapBytes,checkpoint_restored:restored});return;}
 if(m.type==='OBSERVE'||m.type==='REINFORCE'){
  if(!brain||busy)throw Error('Runtime not ready');busy=true;
  if(await hash(m.rgb)!==m.frame_hash)throw Error('Input frame integrity mismatch');
  const reinforcement=m.type==='REINFORCE'?(m.reward?.kind==='REWARD'?'reward':m.reward?.kind==='PUNISHMENT'?'aversive':'none'):'none';
  if(m.type==='REINFORCE' && scope!=='autonomy')throw Error('Reinforcement outside autonomous scope');
  if(reinforcement!=='none'&&!brain.m.reinforcement?.[reinforcement]?.length)throw Error('Original reinforcement circuit unavailable');
  const r=brain.observe(m.rgb,m.width,m.height,m.type==='REINFORCE'?500:100,reinforcement),node_ids=sample.map(x=>x.id),event_counts=sample.map(x=>r.counts[x.index]);
  // Hash mutable state in-place: never clone/transfer the 700MB graph per step.
  const memory_hash=await hash(new Uint8Array(brain.arrays.plastic_weight.buffer,brain.arrays.plastic_weight.byteOffset,brain.arrays.plastic_weight.byteLength));
  const checkpoint_hash=await stateHasher.checkpointHash(brain.learning,brain.sensory);
  if(m.type==='REINFORCE'&&checkpointKey)await store.save(checkpointKey,await captureCheckpoint(brain,scope));
  postMessage({type:m.type==='REINFORCE'?'REINFORCED':'ACTIVITY',request_id:m.request_id,payload:{backend:'stonkfly-full-browser-wasm-v1',truth_status:'real_full_kernel',scope,manifest_hash:brain.m.manifest_hash,checkpoint_hash,memory_hash,snapshot_hash:m.snapshot_hash,frame_hash:m.frame_hash,observed_at:m.observed_at,brain_ms:r.brain_ms,compute_ms:r.compute_ms,decoder:r.decoder,reinforcement,stimulus_ms:reinforcement==='none'?0:200,full_total_events:r.counts.reduce((a,b)=>a+b,0),activity:{node_ids,event_counts,total_events:event_counts.reduce((a,b)=>a+b,0),simulated_ms:r.simulated_ms}}});busy=false;
 }
}catch(e){busy=false;postMessage({type:'ERROR',request_id:m.request_id,message:e.message});}};
