import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
globalThis.crypto ||= webcrypto;
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
test('personal initialization requires owner, uses real manifest, preserves checkpoint key and isolates identity',async()=>{
 const mod=await import('../pages/personal-fly.js').catch(()=>({}));
 assert.equal(typeof mod.initializePersonalFly,'function','personal initialization missing');
 const storage=memory(),manifest=JSON.parse(await readFile(new URL('../pages/full-brain/manifest.json',import.meta.url)));
 const args={storage,fetchManifest:async()=>manifest};
 await assert.rejects(()=>mod.initializePersonalFly({...args,ownerToken:null}),/owner/i);
 const a=await mod.initializePersonalFly({...args,ownerToken:'owner-a'}),again=await mod.initializePersonalFly({...args,ownerToken:'owner-a'}),b=await mod.initializePersonalFly({...args,ownerToken:'owner-b'});
 assert.equal(a.identity.genesis_model_hash,manifest.manifest_hash);
 assert.equal(a.checkpointKey,Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('owner-a'))).toString('hex'));
 assert.equal(a.identity.fly_id,again.identity.fly_id);assert.notEqual(a.identity.fly_id,b.identity.fly_id);
 await assert.rejects(()=>mod.initializePersonalFly({...args,ownerToken:'c',fetchManifest:async()=>({})}),/manifest/i);
});

test('checkpoint UI distinguishes restored, saved, empty and observation; errors propagate',async()=>{
 const m=await import('../pages/personal-fly.js');assert.equal(typeof m.checkpointLabel,'function');
 assert.match(m.checkpointLabel({state:'saved',restored:true,hash:'abc'}),/RESTORED.*abc/);
 assert.match(m.checkpointLabel({state:'saved',hash:'def'}),/SAVED.*def/);
 assert.match(m.checkpointLabel({state:'empty'}),/NO SAVED/);
});
test('app scopes all full-brain starts behind identity and wires cosmetic identity and checkpoint controls',async()=>{
 const app=await readFile(new URL('../pages/app.js',import.meta.url),'utf8'),html=await readFile(new URL('../pages/index.html',import.meta.url),'utf8');
 assert.ok(!app.includes('FRESH SESSION WEIGHTS'));assert.ok(!app.includes('RESET TO ORIGINAL WEIGHTS'));
 assert.match(app,/await initializePersonalFly/);assert.match(app,/setAppearance\?\.\(personalFly.identity.fly_id\)/);
 assert.equal((app.match(/browserBrain.start\(/g)||[]).length,2,'personal and exclusive colony wrappers only');
 assert.match(app,/if \(colonyBusy \|\| colonyAutomatic \|\| !personalFly\) return/);
 const colony=app.slice(app.indexOf('async function withColonyBrain'),app.indexOf('async function runAutonomy'));
 assert.match(colony,/if \(colonyBusy \|\| modeBusy \|\| !personalFly\) throw/);
 assert.ok(colony.indexOf('colonyBusy = true')<colony.indexOf('browserBrain.start('));
 for(const id of ['checkpointSave','checkpointRefresh','checkpointStatus'])assert.ok(html.includes(`id="${id}"`));
 assert.match(html,/LOCAL ONLY/);assert.match(app,/browserBrain.saveCheckpoint\(\)/);
});
