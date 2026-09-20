import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../pages/app.js', import.meta.url), 'utf8');
test('chart starts empty and authoritative observation replaces the active series', () => {
  assert.match(app, /\blet\s+series\s*=\s*\[\s*\]/);
  assert.doesNotMatch(app, /\bseries\s*=\s*Array\.from\s*\(/);
  assert.match(app, /series\s*=\s*o\.candles\.map\s*\(/);
  assert.match(app, /series\s*=\s*\(s\.bars\s*\|\|\s*\[\s*\]\)\.map\s*\(/);
});
