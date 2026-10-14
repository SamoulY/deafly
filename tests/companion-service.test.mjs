import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handleCompanion} from '../worker/src/companion.mjs';
import {accountValue,decisionLabel} from '../pages/companion.js';

test('portfolio values use each decision snapshot, including shorts and missing quotes',()=>{
  assert.equal(accountValue({cash:10000,position_side:'FLAT'},null),10000);
  assert.equal(accountValue({cash:9000,position_side:'LONG',position_qty:.01,entry_price:100000},110000),10100);
  assert.equal(accountValue({cash:9000,position_side:'SHORT',position_qty:.01,entry_price:100000},90000),10100);
  assert.equal(accountValue({cash:9000,position_side:'LONG',position_qty:.01},null),null);
  assert.equal(decisionLabel({action:'SELL'}),'Opened a short');
  assert.equal(decisionLabel({action:'CLOSE'}),'Closed its position');
});
test('examples freeze server context, isolate owners, train once on retries and never execute',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-18',d1Databases:['DB']}));
  t.after(()=>mf.dispose());const DB=await mf.getD1Database('DB');
  for(const file of ['worker/schema.sql','worker/migrations/0012_companion_teaching.sql','worker/migrations/0013_companion_learning.sql'])await DB.exec((await readFile(file,'utf8')).replace(/^\s*--.*$/gm,'').replace(/\r?\n/g,' '));
  for(const owner of ['alice','bob']){
    await DB.prepare('INSERT INTO users VALUES (?,?,?,?,?)').bind(owner,owner,owner,1,1).run();
    await DB.prepare('INSERT INTO portfolios (user_id,cash,quantity,avg_cost) VALUES (?,10000,0,0)').bind(owner).run();
  }
  const market={symbol:'BTCUSD',source:'test',snapshot_hash:'a'.repeat(64),candles:[{time:40,close:200},{time:100,close:200}]};
  const call=async(path,body,owner='alice')=>{const response=await handleCompanion(new Request('https://local/api/companion'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})}),{DB},{id:owner},{observation:async()=>structuredClone(market)});return {status:response.status,data:await response.json()};};
  const before=(await call('')).data.portfolio;
  const context=await call('/contexts',{});assert.equal(context.status,201);
  market.candles.push({time:160,close:900});
  assert.equal((await call('/contexts',{candle_time:100,price:9999})).data.error,'LATEST_POINT_ONLY');
  const selected=await call('/contexts',{candle_time:160,price:9999});
  assert.equal(selected.status,201);assert.equal(selected.data.market.candles.length,3);
  assert.equal(selected.data.market.candles.at(-1).close,900,'server owns the latest price');
  assert.equal((await call('/contexts',{candle_time:40})).status,409);
  assert.equal((await call('/contexts',{candle_time:999})).status,409);
  assert.equal((await call('/contexts',{candle_time:'100'})).status,422);
  // Cancelling a prepared context creates no teaching record.
  assert.equal((await call('')).data.lessons.length,0);
  const example={context_id:context.data.id,action:'BUY',idempotency_key:'example_1234567890',price:999};
  assert.equal((await call('/lessons',example,'bob')).status,404);
  assert.equal((await call('/lessons',{...example,action:'CLOSE'})).status,422);
  const [first,retry]=await Promise.all([call('/lessons',example),call('/lessons',example)]);
  assert.equal(first.status,200);assert.equal(retry.status,200);assert.equal(first.data.lesson.id,retry.data.lesson.id);
  assert.equal(first.data.training_applied,true);
  assert.equal(first.data.training.model_version,1);
  assert.deepEqual(first.data.training,retry.data.training);
  assert.ok(first.data.training.probability_after>first.data.training.probability_before);
  assert.equal((await call('/lessons',{...example,action:'SELL'})).status,409);
  assert.equal((await call('/lessons',{...example,idempotency_key:'example_0987654321'})).status,409);
  market.candles[0].close=300;
  const after=(await call('')).data;
  assert.deepEqual(after.portfolio,before);assert.equal(after.lessons.length,1);assert.equal(after.lessons[0].context.market.candles[0].close,200);
  assert.equal(after.decisions.length,0);assert.equal((await call('',undefined,'bob')).data.lessons.length,0);
  assert.equal(after.learning.version,1);assert.equal(after.lessons[0].training_applied,true);
  assert.ok(after.lessons[0].probability_after>after.lessons[0].probability_before);
  assert.equal((await call('',undefined,'bob')).data.learning.version,0);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM learning_events').first()).n,0);
  const expired=await call('/contexts',{});await DB.prepare('UPDATE companion_contexts SET expires_at=0 WHERE id=?').bind(expired.data.id).run();
  assert.equal((await call('/lessons',{...example,context_id:expired.data.id,idempotency_key:'expired_1234567890'})).data.error,'CONTEXT_EXPIRED');
  // A committed receipt still works after its original context expires.
  await DB.prepare('UPDATE companion_contexts SET expires_at=0 WHERE id=?').bind(context.data.id).run();
  assert.equal((await call('/lessons',example)).data.lesson.id,first.data.lesson.id);
});
