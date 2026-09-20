import test from 'node:test';import assert from 'node:assert/strict';import {vote} from '../worker/src/colony.mjs';
test('colony vote is deterministic and HOLD quorum wins',()=>{const r=vote([{action:'BUY',checkpoint_hash:'a'},{action:'HOLD',checkpoint_hash:'b'},{action:'HOLD',checkpoint_hash:'c'}]);assert.equal(r.action,'HOLD');assert.equal(r.agreement_rate,2/3);assert.equal(r.checkpoint_diversity,3);});
test('colony vote never accepts unknown actions',()=>assert.throws(()=>vote([{action:'NOPE',checkpoint_hash:'a'}]),/INVALID_ACTION/));
