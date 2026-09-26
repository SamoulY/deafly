import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolio,lockIntent,fill,units,decimal,actionMask,valueAccount} from '../worker/src/flydesk-broker.mjs';
import {indicators,aggregate,validateAnalysis} from '../worker/src/flydesk-indicators.mjs';
test('FlyDesk specification golden ledger matches every eight-decimal amount',()=>{
 const p=portfolio(),buy=fill(p,lockIntent(p,'BUY','100'),{ask:'100',bid:'100',time:1});
 assert.equal(buy.fill.quantity,'9.98501748');assert.equal(buy.fill.notional,'999.00099888');assert.equal(buy.fees,'0.99900100');assert.equal(buy.account.cash,'9000.00000012');
 const sell=fill(buy.account,lockIntent(buy.account,'SELL','110',{liquidate:true}),{ask:'110',bid:'110',time:2});
 assert.equal(sell.fill.notional,'1097.80274683');assert.equal(sell.fees,'1.09780275');assert.equal(sell.account.cash,'10096.70494420');assert.equal(sell.account.realized_pnl,'96.70494420');assert.equal(sell.account.cost_basis,'0.00000000');
});
test('spot mask prohibits shorts, repeated buys accumulate and ordinary sell is capped at snapshot amount',()=>{
 let p=portfolio();assert.deepEqual(actionMask(p,'100'),['BUY','HOLD']);assert.throws(()=>lockIntent(p,'SELL','100'),/UNAVAILABLE/);
 for(let i=0;i<2;i++)p=fill(p,lockIntent(p,'BUY','100'),{ask:'100',bid:'100'}).account;
 assert.ok(units(p.quantity)>units('19'));const intent=lockIntent(p,'SELL','100');assert.equal(intent.quantity,'10.00000000');
 p=fill(p,intent,{ask:'90',bid:'90'}).account;assert.ok(units(p.quantity)>0n);assert.ok(units(p.cost_basis)>0n);assert.equal(valueAccount(p,'90').side,'LONG');
 assert.throws(()=>fill(p,intent,{ask:'90',bid:'90'}),/STALE/);
});
test('10000 deterministic generated actions preserve nonnegative exact cash inventory and cost',()=>{
 let p=portfolio();let seed=981;for(let i=0;i<10000;i++){seed=(1664525*seed+1013904223)>>>0;const price=decimal(BigInt(5000000000+seed)),mask=actionMask(p,price),action=mask[seed%mask.length];p=fill(p,lockIntent(p,action,price),{ask:price,bid:price}).account;for(const k of ['cash','quantity','cost_basis','fees_paid'])assert.ok(units(p[k])>=0n,k);}
});
test('skip creates no order and RSI / SMA / EMA initialization matches flat and monotonic fixtures',()=>{
 const p=portfolio(),r=fill(p,lockIntent(p,'SKIP','100'),{});assert.equal(r.fill,null);assert.equal(r.account.cash,p.cash);
 const bars=Array.from({length:70},(_,i)=>({time:i*60,open:100,high:100,low:100,close:100,volume:10})),a=indicators(bars);
 assert.equal(a.sma20[18],null);assert.equal(a.sma20[19],100);assert.equal(a.rsi14[13],null);assert.equal(a.rsi14[14],50);assert.equal(a.macd[24],null);assert.equal(a.macd[25],0);assert.equal(a.signal[32],null);assert.equal(a.signal[33],0);
 assert.equal(indicators(bars.map((b,i)=>({...b,close:100+i}))).rsi14[14],100);
 const view=aggregate(bars,300,7*60);assert.equal(view.length,2);assert.equal(view[0].is_partial,false);assert.equal(view[1].is_partial,true);assert.equal(view[1].volume,20);
 assert.throws(()=>validateAnalysis({drawings:[{tool:'script'}]}),/DRAWING/);
});
