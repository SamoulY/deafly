import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../pages/session-client.js').catch(() => ({}));
const storage = () => {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
};
test('invalid persisted session stays stored and requires explicit reset', async () => {
  const store = storage();
  store.setItem('defly.session:https://example.test', 'invalid');
  const calls = [];
  const client = module.createSessionClient({ origin: 'https://example.test', storage: store, fetch: async url => {
    calls.push(url);
    if (url.endsWith('/api/session')) return Response.json({ token: 'new' });
    return calls.length === 1 ? Response.json({error:'UNAUTHORIZED'}, {status:401}) : Response.json({portfolio:{}});
  }});
  await assert.rejects(client.restore(), {code:'SESSION_RESET_REQUIRED'});
  assert.equal(store.getItem('defly.session:https://example.test'), 'invalid');
  assert.equal(calls.length, 1);
  await client.reset();
  assert.equal(store.getItem('defly.session:https://example.test'), 'new');
});
test('new session is persisted and origin configuration is local-aware', async () => {
  const store = storage();
  const client = module.createSessionClient({origin:'https://example.test', storage:store, fetch:async url => Response.json(url.endsWith('/api/session') ? {token:'created'} : {portfolio:{cash:10000}})});
  assert.equal((await client.restore()).portfolio.cash, 10000);
  assert.equal(store.getItem('defly.session:https://example.test'), 'created');
  assert.equal(module.resolveApiOrigin('', 'localhost'), 'http://localhost:8787');
  assert.equal(module.resolveApiOrigin('https://custom.test/', 'localhost'), 'https://custom.test');
});
test('restores persisted session before considering creation', async () => {
  assert.equal(typeof module.createSessionClient, 'function');
  const store = storage();
  store.setItem('defly.session:http://localhost:8787', 'saved');
  const calls = [];
  const client = module.createSessionClient({ origin: 'http://localhost:8787', storage: store, fetch: async (url, options) => {
    calls.push([url, options]);
    return Response.json({ portfolio: { cash: 123 } });
  }});
  assert.equal((await client.restore()).portfolio.cash, 123);
  assert.equal(calls.length, 1);
  assert.ok(calls[0][0].endsWith('/api/state'));
  assert.equal(calls[0][1].headers['X-Session-Token'], 'saved');
});
