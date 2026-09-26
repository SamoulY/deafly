import test from 'node:test';
import assert from 'node:assert/strict';
import {createStateHasher} from '../pages/full-brain/state-hash.mjs';

const sha=async bytes=>Array.from(bytes).join(':');
const arrays={contact:new Uint8Array([1,2]),weight:null,v:new Uint8Array([3]),post:new Uint8Array([9]),ids:new Uint8Array([8])};
arrays.weight=arrays.contact;

test('caches immutable contact alias while keeping the original inventory and hash',async()=>{
 const calls=[];const hash=async bytes=>{calls.push(bytes.byteLength);return sha(bytes);};
 const h=createStateHasher(arrays,hash);
 const before=async()=>{
  const states=[];for(const [name,a] of Object.entries(arrays))if(!['post','contact','ids'].includes(name))states.push([name,await hash(new Uint8Array(a.buffer,a.byteOffset,a.byteLength))]);
  return hash(new TextEncoder().encode(JSON.stringify(states)));
 };
 const expected=await before();calls.length=0;
 assert.equal(await h.checkpointHash({},{}),expected);
 assert.equal(await h.checkpointHash({},{}),expected);
 assert.equal(calls.filter(x=>x===2).length,1,'contact alias hashed only at initialization');
 arrays.v[0]=4;
 assert.equal(await h.checkpointHash({},{}),await before(),'mutable state still changes checkpoint hash');
});

test('rejects cache when weight is not the contact alias',()=>{
 assert.throws(()=>createStateHasher({...arrays,weight:new Uint8Array([1,2])},sha),/alias/);
});
