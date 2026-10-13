import test from 'node:test';
import assert from 'node:assert/strict';
import {initialBitcoin} from '../worker/src/initial-bitcoin.mjs';
import {startDev} from '../scripts/flydesk-dev.mjs';

test('starting allocation spends the $10,000 budget including costs at a fresh BTCUSD quote',()=>{
  const market={symbol:'BTCUSD',source:'test',snapshot_hash:'a',candles:[{time:120,close:65000}]};
  const p=initialBitcoin(market,180);
  assert.ok(p.quantity>0&&p.quantity<1);assert.equal(p.position_side,'LONG');
  assert.equal(p.quantity,p.position_qty);assert.equal(p.entry_price,p.avg_cost);
  assert.ok(p.cash>=0&&p.cash<.001);assert.ok(p.fee>0);
  assert.ok(Math.abs(p.cash+p.quantity*p.fill_price+p.fee-10000)<1e-8);
  assert.equal(p.revision,1);assert.equal(p.provenance.candle_time,120);
  assert.throws(()=>initialBitcoin(market,271),/MARKET_STALE/);
  assert.throws(()=>initialBitcoin(market,179),/MARKET_STALE/);
  assert.throws(()=>initialBitcoin({...market,symbol:'BTCUSDT'},180),/MARKET_STALE/);
});
test('new identity, BTC position, and opening receipt commit together; reload never buys again; unavailable quotes create nothing',async t=>{
  let fail=false;
  const dev=await startDev({fixture:true,port:18988,apiPort:18989,outboundService:async()=>{
    if(fail)return new Response('unavailable',{status:503});
    const end=Math.floor(Date.now()/60000)*60;
    return Response.json({error:[],result:{XBTUSD:Array.from({length:40},(_,i)=>[end-(40-i)*60,'65000','65001','64999','65000','0','10',1]),last:end}});
  }});t.after(()=>dev.close());
  const create=()=>dev.mf.dispatchFetch('http://local/api/session',{method:'POST',body:JSON.stringify({nickname:'initial test'})});
  const session=await (await create()).json();assert.ok(session.token);
  const get=async()=>{const r=await dev.mf.dispatchFetch('http://local/api/companion',{headers:{'X-Session-Token':session.token}});assert.equal(r.status,200);return r.json();};
  const before=await get();assert.equal(before.portfolio.position_side,'LONG');assert.equal(before.opening.portfolio.initial_budget,10000);assert.equal(before.decisions.length,0);assert.equal(before.learning.version,0);
  assert.deepEqual((await get()).portfolio,before.portfolio);
  assert.equal((await dev.db.prepare('SELECT COUNT(*) n FROM decisions').first()).n,1);
  assert.equal((await dev.db.prepare('SELECT COUNT(*) n FROM companion_training').first()).n,0);
  // Fail the last write: the identity and position must also roll back.
  await dev.db.exec("CREATE TRIGGER reject_initial BEFORE INSERT ON model_states BEGIN SELECT RAISE(ABORT,'TEST_ROLLBACK'); END;");
  assert.equal((await create()).status,500);
  assert.equal((await dev.db.prepare('SELECT COUNT(*) n FROM users').first()).n,1);
  assert.equal((await dev.db.prepare('SELECT COUNT(*) n FROM portfolios').first()).n,1);
  await dev.db.exec('DROP TRIGGER reject_initial;');fail=true;
  assert.equal((await create()).status,503);
  assert.equal((await dev.db.prepare('SELECT COUNT(*) n FROM users').first()).n,1);
  assert.deepEqual((await get()).portfolio,before.portfolio);
});
