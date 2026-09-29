import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {startDev} from '../scripts/flydesk-dev.mjs';
test('observation is frozen for 500ms; autonomy remains mutable and saves checkpoints',async()=>{
 const source=readFileSync(new URL('../pages/full-brain/worker.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 for(const scope of ['observation','autonomy']){
  const messages=[];let frozen,duration,saves=0;
  const brain={arrays:{ids:[],plastic_weight:new Float32Array(1)},m:{manifest_hash:'manifest'},heapBytes:1,observe:(rgb,w,h,ms)=>{duration=ms;return {counts:new Int32Array(1),simulated_ms:ms};}};
  const context={self:{},postMessage:m=>messages.push(m),createBrain:async(_,options)=>{frozen=options.frozen;return brain;},checkpointStore:()=>({load:async()=>null,save:async()=>saves++}),createStateHasher:()=>({checkpointHash:async()=> 'hash'}),hash:async()=> 'hash',captureCheckpoint:async()=>({}),restoreCheckpoint:async()=>{}};
  vm.runInNewContext(source,context);await context.self.onmessage({data:{type:'INIT',scope,sample_ids:[],checkpoint_key:'owner'}});
  await context.self.onmessage({data:{type:'OBSERVE',rgb:new Uint8Array(3),frame_hash:'hash',width:1,height:1}});
  assert.equal(messages.at(-1).type,'ACTIVITY');assert.equal(frozen,scope==='observation');assert.equal(duration,scope==='observation'?500:100);assert.equal(messages.at(-1).payload.weights_frozen,scope==='observation');assert.equal(saves,scope==='autonomy'?1:0);
 }
});
test('local schema includes colony tasks and automatic dispatch without renaming migrations',async t=>{
 const dev=await startDev({fixture:true,port:18976,apiPort:18977});t.after(()=>dev.close());
 for(const name of ['worker/migrations/0009_colony_tasks.sql','worker/migrations/0010_colony_auto.sql'])assert.ok(await dev.db.prepare('SELECT name FROM local_schema_migrations WHERE name=?').bind(name).first());
 for(const table of ['colony_tasks','colony_auto_dispatch','colony_task_claims','colony_human_corrections'])assert.ok(await dev.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first());
});
