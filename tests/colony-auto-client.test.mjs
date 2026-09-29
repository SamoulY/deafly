import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlyIdentity} from '../pages/fly-identity.js';
import {createColonyClient} from '../pages/colony-client.js';
import {verifyManifest,digest} from '../worker/src/federation.mjs';
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
test('automatic enrollment binds consent; authenticated claim and correction remain separate from signed vote',async()=>{
 const storage=store(),identity=await createFlyIdentity(storage,{genesis_model_hash:'a'.repeat(64)}),calls=[];
 const api=async(path,o={})=>{calls.push([path,o.body]);if(path==='/api/state')return {user:{id:'alice'}};return {enrolled:true}};
 const client=createColonyClient({api,identity,storage,withBrain:fn=>fn({saveCheckpoint:async()=>({hash:'b'.repeat(64)})})});
 assert.equal(typeof client.enroll,'function');await assert.rejects(client.enroll({consent:false}),/CONSENT/);assert.equal(calls.length,0);
 await client.enroll({consent:true});const proof=calls.find(([p])=>p.endsWith('/enroll'))[1].proof;assert.equal(await verifyManifest(proof),null);assert.equal(proof.purpose,'colony-auto-enroll');assert.equal(proof.consent,true);assert.equal((await client.saved()).auto_consent,true);
 await client.claim();assert.ok(calls.some(([p])=>p==='/api/colony/auto/next'));
 await client.correct({task_id:'t',vote_id:'v',action:'SELL',correction_id:'correction-1'});assert.deepEqual(calls.at(-1),['/api/colony/tasks/t/corrections',{vote_id:'v',action:'SELL',correction_id:'correction-1'}]);assert.equal(calls.filter(([p])=>p.endsWith('/votes')).length,0);
});

test('pause during inference never submits a signed vote',async()=>{
 const storage=store(),identity=await createFlyIdentity(storage,{genesis_model_hash:'a'.repeat(64)}),calls=[];let active=true;
 const snapshot={bars:[{close:10},{close:12}],symbol:'BTCUSD'};
 const task={task_id:'t',snapshot,snapshot_hash:await digest(snapshot),status:'OPEN',deadline:Date.now()+60000,members:[{member_user_id:'alice',fly_id:identity.fly_id}]};
 const api=async(path,o={})=>{calls.push(path);return path==='/api/state'?{user:{id:'alice'}}:task;};
 const client=createColonyClient({api,identity,storage,withBrain:fn=>fn({saveCheckpoint:async()=>({hash:'b'.repeat(64)}),infer:async()=>{active=false;return {decoder:{proposed_action:'BUY'}}}})});
 await assert.rejects(client.vote('t',{isActive:()=>active}),/PAUSED/);assert.equal(calls.some(p=>p.endsWith('/votes')),false);
});
