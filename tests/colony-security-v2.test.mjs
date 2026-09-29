import test from 'node:test';
import assert from 'node:assert/strict';
import { federation } from '../worker/src/federation.mjs';

test('legacy unsigned colony submissions are disabled until persisted task binding is implemented', async () => {
 const request = new Request('https://example.test/api/colony/submissions', {method:'POST',body:JSON.stringify({task_id:'spoof',fly_id:'victim',checkpoint_hash:'x',action:'BUY'})});
 const response = await federation(request, {}, {id:'attacker'}, '/api/colony/submissions');
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,'COLONY_V2_NOT_READY');
});
test('legacy ad-hoc aggregation cannot masquerade as immutable finalization', async () => {
 const request = new Request('https://example.test/api/colony/vote', {method:'POST',body:JSON.stringify({task_id:'spoof'})});
 const response = await federation(request, {}, {id:'attacker'}, '/api/colony/vote');
 assert.equal(response.status,503);
});
