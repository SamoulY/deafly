import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../pages/index.html', import.meta.url), 'utf8');
test('raising desk keeps neural telemetry available in an expanded disclosure', () => {
  const details = html.match(/<details\b(?=[^>]*\bclass=["']brain-detail["'])[^>]*>/)?.[0];
  assert.ok(details, 'telemetry disclosure exists');
  assert.match(details, /\sopen(?:\s|=|\/?>)/);
  assert.match(html, /VIEW\s+ACTIVITY\s+DETAILS/);
  assert.match(html, /id=["']brainActivity["']/);
});
