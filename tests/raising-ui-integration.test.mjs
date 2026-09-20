import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('workstation boots raising without auto-start or synthetic seed; live refresh is mode guarded',async()=>{
 const app=await readFile(new URL('../pages/app.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../pages/index.html',import.meta.url),'utf8');
 assert.match(html,/id="raisingRoot"/);
 assert.match(html,/id="resetSession"/);
 const boot=app.slice(app.indexOf('async function boot'),app.indexOf('async function refreshObservation'));
 assert.match(boot,/sessionClient.restore/);
 assert.match(boot,/initRaising/);
 assert.doesNotMatch(boot,/await startAuto/);
 assert.doesNotMatch(app,/61000 \+ i/);
 assert.match(app,/if \(mode !== "lab"\) return/);
});
