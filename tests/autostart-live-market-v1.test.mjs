import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../pages/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../pages/index.html', import.meta.url), 'utf8');

test('boot defaults to raising; legacy autonomy requires explicit lab opt-in', () => {
  assert.match(app, /\bmode\s*=\s*["']raising["']/);
  const boot = app.match(/async\s+function\s+boot\s*\([^]*?(?=function\s+applyRaisingObservation)/)?.[0];
  assert.ok(boot, 'boot function exists');
  assert.match(boot, /initRaising\s*\(/);
  assert.doesNotMatch(boot, /\bstartAuto\s*\(|\/api\/autonomy\/start/);
  assert.match(html, /id="autonomousMode"[^>]*aria-pressed="false"/);
  assert.match(app, /#autonomousMode.*switchMode\("lab"\)/);
  const switching = app.slice(app.indexOf('async function switchMode'));
  assert.doesNotMatch(switching, /startAuto\(/);
  assert.match(boot, /await stopAuto\(\)/);
  assert.match(app, /async\s+function\s+startAuto\s*\([^)]*\)\s*\{\s*if\s*\(mode\s*!==\s*["']lab["']\)\s*return/);
  const start = app.slice(app.indexOf('async function startAuto'), app.indexOf('async function stopAuto'));
  assert.match(start, /await\s+browserBrain\.waitReady\(\)/);
  assert.match(start, /backend\s*:\s*['"]stonkfly-full-browser-wasm-v1['"]/);
  assert.ok(start.indexOf('await browserBrain.waitReady()') < start.indexOf('/api/autonomy/start'));
  assert.match(app, /#autoToggle[^\n]*onclick[^\n]*runAutonomy\(\(\) => startAuto\(\)\)/);
});
test('ten-second observation scheduler enforces thirty-second request throttle and single-flight', async () => {
  const {runInNewContext}=await import('node:vm');
  const source=app.slice(app.indexOf('let observationRefreshInFlight'),app.indexOf('async function applyObservation'));
  let now=100000,calls=0,resolve,applied=0;
  const context={mode:'lab',autoRunning:false,autoInFlight:false,Date:{now:()=>now},console,
    api:()=>{calls++;return new Promise(r=>resolve=r);},applyObservation:async()=>{applied++;}};
  const refresh=runInNewContext(source+';refreshObservation',context);
  const first=refresh();const concurrent=refresh(true);assert.equal(calls,1);
  resolve({candles:[]});await Promise.all([first,concurrent]);assert.equal(applied,1);
  now+=10000;await refresh();assert.equal(calls,1);
  now+=19999;await refresh();assert.equal(calls,1);
  now+=1;const next=refresh();assert.equal(calls,2);resolve({});await next;
  const forced=refresh(true);assert.equal(calls,3);resolve({});await forced;
  for(const guard of ['mode','autoRunning','autoInFlight']){
    const old=context[guard];context[guard]=guard==='mode'?'raising':true;
    await refresh(true);assert.equal(calls,3);context[guard]=old;
  }
  assert.match(app, /setInterval\(\s*refreshObservation\s*,\s*10000\s*,?\s*\)/);
});
test('autonomy awaits browser inference and fails closed without a server-policy fallback', async () => {
  const { runInNewContext } = await import('node:vm');
  const source = app.slice(app.indexOf('async function autoStep()'), app.indexOf('async function startAuto'));
  const calls = [];
  let rejectInference;
  const frame = { width: 1, height: 1, rgb: new Uint8Array(3), snapshot_hash: 'snapshot', frame_hash: 'frame' };
  const context = {
    mode: 'lab', autoRunning: true, autoInFlight: false, autoEpoch: 1,
    document: { hidden: false }, series: [], drawMarket() {}, scenes: {fly:{},vision:{}},
    api: async path => {
      calls.push(path);
      assert.equal(path, '/api/autonomy/prepare', 'no step or fallback may run before inference succeeds');
      return { observation: {candles:[{close:100}]}, challenge: { observed_at: 1 }, portfolio: {} };
    },
    encodeMarketObservation: async () => frame,
    browserBrain: { infer: actual => {
      assert.equal(actual, frame);
      return new Promise((resolve, reject) => { rejectInference = reject; });
    } },
    $: () => ({ getContext: () => ({ createImageData: () => ({ data: new Uint8Array(4) }), putImageData() {} }) }),
  };
  const step = runInNewContext(`(${source})`, context);
  const pending = step();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.autoInFlight, true);
  assert.deepEqual(calls, ['/api/autonomy/prepare']);
  await step();
  assert.equal(calls.length, 1, 'overlapping ticks cannot reuse a challenge');
  rejectInference(new Error('inference unavailable'));
  await assert.rejects(pending, /inference unavailable/);
  assert.equal(context.autoInFlight, false, 'failure releases the guard for a fresh attempt');
  assert.deepEqual(calls, ['/api/autonomy/prepare'], 'failure never submits an order or calls a fallback');
  context.mode = 'raising';
  await step();
  assert.equal(calls.length, 1, 'historical mode cannot execute autonomy');
});
