import test from 'node:test';import assert from 'node:assert/strict';import {createFlyIdentity,signManifest} from '../pages/fly-identity.js';import {verifyManifest} from '../worker/src/federation.mjs';
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
test('fly identity signs a manifest accepted by router verifier',async()=>{const id=await createFlyIdentity(store(),{genesis_model_hash:'g'});const m=await signManifest(id,{checkpoint_hash:'c',sequence:0,parent_checkpoint_hash:null});assert.equal(await verifyManifest(m),null);});
test('identity is stable in local store',async()=>{const s=store(),a=await createFlyIdentity(s,{genesis_model_hash:'g'}),b=await createFlyIdentity(s,{genesis_model_hash:'other'});assert.equal(a.fly_id,b.fly_id);});
