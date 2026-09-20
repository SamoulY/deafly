import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalSymbol,fetchMarket,validateBars} from '../worker/src/market.mjs';
const now=1800000000000;
const bars=()=>Array.from({length:90},(_,i)=>({time:now/1000-(90-i)*60,open:100,high:102,low:99,close:101,volume:1}));
test('USD and USDT are distinct, unknown instruments fail closed',()=>{assert.equal(canonicalSymbol('btcusd'),'BTCUSD');assert.equal(canonicalSymbol('BTCUSDT'),'BTCUSDT');assert.throws(()=>canonicalSymbol('FAKE'));});
test('closed bars reject gaps duplicates stale and malformed data',()=>{assert.equal(validateBars(bars(),{now}).length,90);for(const rows of [bars().filter((_,i)=>i!==40),[...bars(),bars()[89]],bars().map(b=>({...b,time:b.time-600})),bars().map(b=>({...b,close:NaN}))])assert.throws(()=>validateBars(rows,{now}));});
test('USD provider failure never falls back to a USDT instrument',async()=>{const urls=[];await assert.rejects(fetchMarket('BTCUSD',{}, {now,fetchImpl:async url=>{urls.push(url);throw Error('offline');}}));assert.equal(urls.length,1);assert.match(urls[0],/pair=XBTUSD&/);});
test('USDT failover preserves exact instrument and actual provenance',async()=>{const urls=[];const result=await fetchMarket('BTCUSDT',{}, {now,fetchImpl:async url=>{urls.push(url);if(url.includes('kraken'))throw Error('offline');return Response.json({code:'0',data:bars().reverse().map(b=>[b.time*1000,b.open,b.high,b.low,b.close,b.volume,0,0,'1'])});}});assert.equal(result.symbol,'BTCUSDT');assert.equal(result.provider,'okx');assert.equal(result.source,'okx-public');assert.equal(result.attempted.length,1);assert.match(urls[1],/BTC-USDT/);});
