import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.mjs';

test('raising endpoints require a session before invoking domain handlers', async () => {
  for (const path of ['/api/raising/profile', '/api/raising/training']) {
    const response = await worker.fetch(new Request('https://local.test' + path), {});
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'UNAUTHORIZED');
  }
});

test('authenticated raising catalog is routed through the Worker', async () => {
  const env = { DB: { prepare(sql) {
    if (sql.includes('FROM raising_catalog')) return { async all() { return {results:Array.from({length:12},(_,i)=>({id:'test-item-'+i}))}; } };
    assert.match(sql, /SELECT \* FROM users/);
    return { bind() { return this; }, async first() { return { id: 'routing-user' }; } };
  } } };
  const response = await worker.fetch(new Request('https://local.test/api/raising/catalog', {
    headers: { 'X-Session-Token': 'local-routing-fixture' },
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.cosmetic_only, true);
  assert.ok(body.items.length >= 12);
});