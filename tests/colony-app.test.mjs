import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('automatic decisions dispose on session replacement and yield explicitly to personal autonomy',async()=>{const app=await readFile('pages/app.js','utf8');assert.match(app,/colonyUI\?\.dispose\(\)/);assert.match(app,/beforeStart:async/);assert.match(app,/onRunning:running/);assert.match(app,/colonyUI\?\.pause\('Paused — personal autonomy selected\.'\)/);assert.match(app,/if \(colonyBusy \|\| colonyAutomatic/);});
test('app mounts colony only after session identity and guards shared brain entry points',async()=>{const app=await readFile('pages/app.js','utf8'),html=await readFile('pages/index.html','utf8');assert.match(app,/createColonyClient/);assert.match(app,/async function withColonyBrain/);assert.match(app,/if \(colonyBusy/);assert.match(html,/id="colonyRoot"/);assert.ok(app.indexOf('await initPersonalIdentity();')<app.indexOf('await mountColonyUI('));});
test('colony inference is ephemeral and cannot overwrite personal checkpoint',async()=>{
 const [app,client,worker]=await Promise.all([readFile('pages/app.js','utf8'),readFile('pages/browser-brain-client.js','utf8'),readFile('pages/full-brain/worker.mjs','utf8')]);
 assert.match(app,/browserBrain\.start\(anatomy\?\.nodes\.map\(n => n\.id\) \|\| \[\], 'autonomy', \{checkpointPersistence:'ephemeral'\}\)/);
 assert.match(client,/checkpoint_persistence:checkpointPersistence/);
 assert.match(worker,/checkpoint_persistence==='ephemeral'/);
 assert.match(worker,/checkpointPersistence!=='ephemeral'/);
});
