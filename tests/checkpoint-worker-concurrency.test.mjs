import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('rejected overlapping worker controls cannot release the active initialization lock',async()=>{
 const source=readFileSync(new URL('../pages/full-brain/worker.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const messages=[];let finish;
 const context={self:{},postMessage:m=>messages.push(m),createBrain:()=>new Promise(r=>finish=r),checkpointStore:()=>({load:async()=>null}),createStateHasher:()=>({}),hash:()=>{},captureCheckpoint:()=>{},restoreCheckpoint:()=>{}};
 vm.runInNewContext(source,context);
 const init=context.self.onmessage({data:{type:'INIT',scope:'autonomy',sample_ids:[],checkpoint_key:'owner'}});
 await context.self.onmessage({data:{type:'SAVE_CHECKPOINT',request_id:1}});
 await context.self.onmessage({data:{type:'CHECKPOINT_STATUS',request_id:2}});
 assert.deepEqual(messages.map(m=>[m.request_id,m.message]),[[1,'Runtime busy'],[2,'Runtime busy']]);
 finish({arrays:{ids:[]},heapBytes:1});await init;
 assert.equal(messages.at(-1).type,'READY');
});
