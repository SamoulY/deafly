import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const worker = readFileSync(new URL('worker/src/index.mjs', root), 'utf8');
const html = readFileSync(new URL('pages/index.html', root), 'utf8');
const app = readFileSync(new URL('pages/app.js', root), 'utf8');

test('worker contract exposes health, paper trading and prediction routes', () => {
  for (const route of ['/health','/api/session','/api/state','/api/markets','/api/candles/','/api/decision','/api/predictions','/api/predict']) assert.ok(worker.includes(route), route);
});

test('client never sends authoritative price, pnl, cash or points', () => {
  assert.doesNotMatch(app, /body\s*:\s*JSON\.stringify\([^)]*(price|pnl|cash|points)/i);
});

test('page identifies paper-only and disconnected neural runtime truthfully', () => {
  assert.match(html, /PAPER ONLY/);
  assert.match(html, /BROWSER RUNTIME PREPARING/);
  assert.match(html, /NEURAL ACTIVITY UNAVAILABLE/);
  assert.doesNotMatch(html, /REAL STONKFLY SPIKES/);
});

test('mobile viewport and accessible decision controls exist', () => {
  assert.match(html, /viewport-fit=cover/);
  for (const label of ['PREDICT YES','PREDICT NO']) assert.ok(html.includes(label), label);
});
