import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserBrainClient} from '../pages/browser-brain-client.js';
test('save and following reinforcement queue behind inference without overlapping worker requests',async()=>{
 const sent=[];const worker={postMessage:m=>sent.push(m),terminate(){}};const c=createBrowserBrainClient({workerFactory:()=>worker,isHidden:()=>false});
 c.start([],'autonomy');worker.onmessage({data:{type:'READY'}});
 const frame={snapshot_hash:'s',frame_hash:'f'};const inference=c.infer(frame);const save=c.saveCheckpoint();save.catch(()=>{});
 try{
 assert.equal(sent.at(-1).type,'OBSERVE','save must wait for inference');
 worker.onmessage({data:{type:'ACTIVITY',request_id:sent.at(-1).request_id,payload:frame}});await inference;
 assert.equal(sent.at(-1).type,'SAVE_CHECKPOINT');
 const reward=c.reinforce(frame,{kind:'REWARD'});reward.catch(()=>{});
 assert.equal(sent.at(-1).type,'SAVE_CHECKPOINT','reinforcement waits for save');
 worker.onmessage({data:{type:'CHECKPOINT_SAVED',request_id:sent.at(-1).request_id,payload:{hash:'saved'}}});await save;
 assert.equal(sent.at(-1).type,'REINFORCE');worker.onmessage({data:{type:'REINFORCED',request_id:sent.at(-1).request_id,payload:frame}});await reward;
 }finally{c.cancel();inference.catch(()=>{});}
});
