import test from 'node:test';
import assert from 'node:assert/strict';
import { vote } from '../worker/src/colony.mjs';

test('CLOSE participates and strict majority wins', () => {
  const r = vote([{action:'CLOSE'},{action:'CLOSE'},{action:'BUY'}], {quorum: .5});
  assert.equal(r.action, 'CLOSE'); assert.equal(r.status, 'FINALIZED');
});
test('tie is HOLD and reports participation', () => {
  const r = vote([{action:'BUY'},{action:'SELL'}], {quorum: .5});
  assert.equal(r.action, 'HOLD'); assert.equal(r.status, 'HOLD');
});
test('insufficient participation is NO_QUORUM', () => {
  const r = vote([{action:'BUY'}], {quorum: .75, memberCount: 4});
  assert.equal(r.status, 'NO_QUORUM'); assert.equal(r.action, 'HOLD');
});
