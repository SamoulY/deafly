import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {initialTeachingModel,teachingFeatures,teachingHash,trainTeachingExample,taughtDecision,syncTeaching} from '../worker/src/companion-learning.mjs';
import {prepareBrowser,stepBrowser,BROWSER_BACKEND,PINNED_MANIFEST} from '../worker/src/browser-autonomy.mjs';
import {handleCompanion} from '../worker/src/companion.mjs';

const flat={cash:10000,position_side:'FLAT',position_qty:0,entry_price:0,revision:0};
function market(slope=0) {
  const now=Math.floor(Date.now()/60000)*60;
  return {symbol:'BTCUSD',source:'kraken-public',snapshot_hash:'a'.repeat(64),observed_at:now,candles:Array.from({length:40},(_,i)=>({time:now-(40-i)*60,open:100+i*slope,high:101+i*slope,low:99+i*slope,close:100+i*slope,volume:10}))};
}
const decoder=(difference=0,gate=1)=>({left_hz:Math.max(0,-difference),right_hz:Math.max(0,difference),difference_hz:difference,gate_spikes:gate,threshold_hz:5,proposed_action:!gate||Math.abs(difference)<5?'HOLD':difference>0?'BUY':'SELL'});
test('supervised updates reduce example loss, change later inference, and preserve neural gates and position rules',async()=>{
  const f=teachingFeatures(market(),flat),initial=initialTeachingModel();
  let model=initial;
  for(let i=0;i<3;i++){
    const step=trainTeachingExample(model,f,'BUY');
    assert.ok(step.probability_after>step.probability_before);
    model=step.model;
  }
  assert.notEqual(await teachingHash(initial),await teachingHash(model));
  assert.equal(taughtDecision(initial,f,decoder(),flat).action,'HOLD');
  assert.equal(taughtDecision(model,f,decoder(),flat).action,'BUY');
  assert.equal(taughtDecision(model,f,decoder(10,0),flat).action,'HOLD','silent brain cannot trade');
  assert.equal(taughtDecision(model,f,decoder(),{...flat,cash:0}).action,'HOLD','cash constraint survives learning');
  assert.equal(taughtDecision(model,f,decoder(),{...flat,position_side:'LONG'}).action,'HOLD');
  assert.equal(taughtDecision(model,f,decoder(),{...flat,position_side:'SHORT'}).action,'CLOSE');
  const once=trainTeachingExample(initial,f,'BUY').model;
  assert.equal(taughtDecision(once,f,decoder(-20),flat).action,'SELL','a demonstration is not a forced next order');
  for(const action of ['SELL','HOLD']){
    const step=trainTeachingExample(initial,f,action);
    assert.ok(step.probability_after>step.probability_before);
  }
  assert.throws(()=>teachingFeatures({candles:[{close:NaN,time:1},{close:1,time:2}]},flat),/CONTEXT_INVALID/);
  assert.throws(()=>trainTeachingExample(initial,f,'CLOSE'),/LABEL_INVALID/);
  assert.equal(taughtDecision({...initial,version:1,bias:[2,2,0]},f,decoder(),flat).action,'HOLD','conflicting equal directions abstain');
});
test('learning is conditioned on market context, rather than a stored next-action label',()=>{
  const up=teachingFeatures(market(.5),flat),down=teachingFeatures(market(-.5),flat);
  let model=initialTeachingModel();
  for(let i=0;i<30;i++){
    model=trainTeachingExample(model,up,'BUY').model;
    model=trainTeachingExample(model,down,'SELL').model;
  }
  assert.equal(taughtDecision(model,up,decoder(),flat).action,'BUY');
  assert.equal(taughtDecision(model,down,decoder(),flat).action,'SELL');
});

async function setup(t){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-18',d1Databases:['DB']}));
  t.after(()=>mf.dispose());const DB=await mf.getD1Database('DB');
  for(const file of ['worker/schema.sql',...['0006_browser_autonomy.sql','0007_market_source.sql','0012_companion_teaching.sql','0013_companion_learning.sql'].map(f=>'worker/migrations/'+f)])await DB.exec((await readFile(file,'utf8')).replace(/^\s*--.*$/gm,'').replace(/\r?\n/g,' '));
  for(const uid of ['alice','bob']){
    await DB.prepare('INSERT INTO users VALUES (?,?,?,?,?)').bind(uid,uid,uid,1,1).run();
    await DB.prepare('INSERT INTO portfolios (user_id,cash) VALUES (?,10000)').bind(uid).run();
    await DB.prepare("INSERT INTO autonomous_runs VALUES (?,?,'RUNNING',0,10000,NULL,NULL,NULL,1,1)").bind(uid+'run',uid).run();
    await DB.prepare('INSERT INTO browser_autonomy_runs VALUES(?,?,?)').bind(uid+'run',BROWSER_BACKEND,PINNED_MANIFEST).run();
  }
  const observe=async()=>market();
  const api=async(uid,path,body)=>{
    const response=await handleCompanion(new Request('https://local/api/companion'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body)})}),{DB},{id:uid},{observation:observe});
    return {status:response.status,...await response.json()};
  };
  const teach=async(uid,action)=>{const context=await api(uid,'/contexts',{});return api(uid,'/lessons',{context_id:context.id,action,idempotency_key:crypto.randomUUID()});};
  const prepare=async(uid)=>{const r=await prepareBrowser({DB},{id:uid},observe);return {status:r.status,...await r.json()};};
  const proposal=(prepared,d=decoder())=>({challenge_id:prepared.challenge_id,neural:{backend:BROWSER_BACKEND,manifest_hash:PINNED_MANIFEST,checkpoint_hash:'b'.repeat(64),memory_hash:'c'.repeat(64),frame_hash:'d'.repeat(64),snapshot_hash:prepared.challenge.snapshot_hash,symbol:'BTCUSD',source:'kraken-public',observed_at:prepared.challenge.observed_at,proposed_action:'HOLD',decoder:d}});
  const step=async(uid,body)=>{const r=await stepBrowser({DB},{id:uid},body,observe);return {...await r.json(),http_status:r.status};};
  return {DB,api,teach,prepare,proposal,step};
}
test('server-trained head affects only future autonomous steps, survives reload, and isolates users',async t=>{
  const x=await setup(t),before=(await x.api('alice','')).portfolio;
  const frozenBefore=await x.prepare('alice');
  const receipts=await Promise.all([x.teach('alice','BUY'),x.teach('alice','BUY'),x.teach('alice','BUY')]);
  assert.ok(receipts.every(r=>r.training_applied));
  assert.deepEqual((await x.api('alice','')).portfolio,before);
  assert.equal((await x.api('alice','')).decisions.length,0);
  const loaded=await syncTeaching(x.DB,'alice');assert.equal(loaded.model.version,3);
  assert.equal((await syncTeaching(x.DB,'bob')).model.version,0);
  const oldStep=await x.step('alice',x.proposal(frozenBefore));
  assert.equal(oldStep.executed_action,'HOLD','in-flight decisions retain their frozen model');
  assert.equal(oldStep.learning.version,0);
  const future=await x.prepare('alice'),body=x.proposal(future);
  // Client-supplied learned weights/labels cannot select the final action.
  body.teaching={action:'SELL',model:{bias:[-100,100,-100]}};
  const next=await x.step('alice',body);
  assert.equal(next.http_status,200);assert.equal(next.executed_action,'BUY');
  assert.equal(next.provenance.raw_neural_action,'HOLD');
  assert.equal(next.provenance.teaching.model_version,3);
  assert.equal(next.provenance.teaching.comparison.effect,'changed');
  assert.equal(next.provenance.teaching.comparison.without_teaching,'HOLD');
  assert.equal(next.learning.policy_hash,loaded.hash);
  assert.equal(next.portfolio.position_side,'LONG');
  const retry=await x.step('alice',body);
  assert.equal(retry.decision_id,next.decision_id);assert.equal(retry.replayed,true);
  const history=await x.api('alice','');assert.equal(history.decisions.length,2);
  assert.equal(history.decisions.find(d=>d.id===next.decision_id).teaching_evidence.effect,'changed');
  assert.equal(history.decisions.find(d=>d.id===oldStep.decision_id).teaching_evidence.effect,'no_examples');
  assert.ok(history.decisions.every(d=>!('checkpoint_json' in d)&&!('features_json' in d)));
  const bob=await x.prepare('bob');assert.equal((await x.step('bob',x.proposal(bob))).executed_action,'HOLD');
  assert.equal((await x.step('bob',body)).http_status,409);
  const forged=await x.prepare('alice');const forgedBody=x.proposal(forged);forgedBody.neural.proposed_action='SELL';
  assert.equal((await x.step('alice',forgedBody)).error,'BROWSER_ACTION_MISMATCH');
  const silent=await x.prepare('alice');
  assert.equal((await x.step('alice',x.proposal(silent,decoder(0,0)))).executed_action,'HOLD');
});
test('pre-release lessons catch up once, transaction failure rolls back, and concurrent learners do not lose updates',async t=>{
  const x=await setup(t);
  const contexts=await Promise.all(Array.from({length:5},()=>x.api('alice','/contexts',{})));
  for(const context of contexts)await x.DB.prepare('INSERT INTO companion_lessons VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),'alice',context.id,'SELL',crypto.randomUUID(),1).run();
  await Promise.all([syncTeaching(x.DB,'alice'),syncTeaching(x.DB,'alice'),syncTeaching(x.DB,'alice')]);
  const model=await syncTeaching(x.DB,'alice');assert.equal(model.model.version,5);
  assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM companion_training').first()).n,5);
  const trained=await x.DB.prepare('SELECT * FROM companion_training LIMIT 1').first();
  const pending=await x.api('alice','/contexts',{}),id=crypto.randomUUID();
  await x.DB.prepare('INSERT INTO companion_lessons VALUES(?,?,?,?,?,?)').bind(id,'alice',pending.id,'HOLD',crypto.randomUUID(),2).run();
  await assert.rejects(x.DB.batch([
    x.DB.prepare('UPDATE companion_models SET version=99 WHERE user_id=?').bind('alice'),
    x.DB.prepare('INSERT INTO companion_training VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,'alice',5,6,trained.checkpoint_json,trained.model_hash,0,1,trained.features_json,3),
  ]),/TEACHING_VERSION_CONFLICT/);
  assert.equal((await x.DB.prepare('SELECT version FROM companion_models WHERE user_id=?').bind('alice').first()).version,5);
  assert.equal((await syncTeaching(x.DB,'alice')).model.version,6);
  assert.equal((await syncTeaching(x.DB,'alice')).model.version,6);
});
test('a failed training transaction leaves the example pending and a later refresh applies it once',async t=>{
  const x=await setup(t);
  await x.DB.exec("CREATE TRIGGER test_training_failure BEFORE INSERT ON companion_training BEGIN SELECT RAISE(ABORT,'TEST_STORAGE_FAILURE'); END;");
  const saved=await x.teach('alice','BUY');
  assert.equal(saved.status,200);assert.equal(saved.training_applied,false);assert.equal(saved.learning.pending,true);
  assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM companion_lessons').first()).n,1);
  assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM companion_training').first()).n,0);
  assert.equal((await x.DB.prepare('SELECT version FROM companion_models WHERE user_id=?').bind('alice').first()).version,0);
  await assert.rejects(x.prepare('alice'),/TEST_STORAGE_FAILURE/,'autonomy must not bypass a failed pending lesson');
  await x.DB.exec('DROP TRIGGER test_training_failure;');
  const refreshed=await x.api('alice','');
  assert.equal(refreshed.lessons[0].training_applied,true);assert.equal(refreshed.learning.version,1);
  assert.equal((await x.api('alice','')).learning.version,1);
  assert.equal(refreshed.portfolio.cash,10000);assert.deepEqual(refreshed.decisions,[]);
});
test('bounded legacy catch-up reports remaining work and never executes against a partial backlog',async t=>{
  const x=await setup(t),portfolio=(await x.api('alice','')).portfolio,now=Math.floor(Date.now()/1000);
  for(let i=0;i<51;i++){
    const id=crypto.randomUUID(),context={id,market:market(),portfolio,created_at:now,expires_at:now+600};
    await x.DB.batch([
      x.DB.prepare('INSERT INTO companion_contexts VALUES(?,?,?,?,?)').bind(id,'alice',JSON.stringify(context),now,now+600),
      x.DB.prepare('INSERT INTO companion_lessons VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),'alice',id,'HOLD',crypto.randomUUID(),now),
    ]);
  }
  const partial=await x.prepare('alice');assert.equal(partial.error,'TEACHING_SYNC_PENDING');
  assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM browser_autonomy_challenges').first()).n,0);
  assert.equal((await syncTeaching(x.DB,'alice')).pending,true);
  const complete=await x.prepare('alice');assert.equal(complete.teaching.version,51);
  assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM companion_training').first()).n,51);
});
test('the real WASM brain and server-trained head jointly determine the next autonomous paper decision',{timeout:180000},async t=>{
  const x=await setup(t);
  const server=createServer(async(req,res)=>{
    try {
      const path=new URL(req.url,'http://local').pathname;
      if(path==='/'){res.setHeader('content-type','text/html');res.end('<html><body>Companion kernel integration</body></html>');return;}
      res.setHeader('content-type',/\.m?js$/.test(path)?'text/javascript':path.endsWith('.wasm')?'application/wasm':'application/octet-stream');
      res.end(await readFile(new URL('../pages'+path,import.meta.url)));
    } catch {res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const reference=await x.prepare('bob');
  const neural=await page.evaluate(async prepared=>{
    const {createBrowserBrainClient,encodeMarketObservation}=await import('/browser-brain-client.js');
    const client=createBrowserBrainClient();
    client.setCheckpointKey('test-only-companion-kernel');
    client.start([],'autonomy',{checkpointPersistence:'ephemeral'});
    try {
      await client.waitReady();const frame=await encodeMarketObservation(prepared.observation);
      frame.observed_at=prepared.challenge.observed_at*1000;
      return await client.infer(frame);
    } finally {client.cancel();}
  },reference);
  assert.ok(neural.decoder.gate_spikes>0,'test uses a real active neural circuit');
  const raw=neural.decoder.proposed_action,label=raw==='HOLD'?'BUY':'HOLD';
  const body=prepared=>({challenge_id:prepared.challenge_id,neural:{...neural,snapshot_hash:prepared.challenge.snapshot_hash,observed_at:prepared.challenge.observed_at*1000,symbol:'BTCUSD',source:'kraken-public',proposed_action:raw}});
  const untrained=await x.step('bob',body(reference));assert.equal(untrained.executed_action,raw);
  for(let i=0;i<3;i++)assert.equal((await x.teach('alice',label)).training_applied,true);
  assert.equal((await x.api('alice','')).decisions.length,0,'training cannot submit an order');
  const trained=await x.step('alice',body(await x.prepare('alice')));
  assert.equal(trained.http_status,200);assert.equal(trained.learning.version,3);
  assert.equal(trained.provenance.decoder.proposed_action,raw);
  assert.equal(trained.executed_action,label);
  assert.notEqual(trained.executed_action,untrained.executed_action);
  console.log('REAL_COMPANION_LEARNING',JSON.stringify({neural_direction:raw,neural_gate_spikes:neural.decoder.gate_spikes,untrained_action:untrained.executed_action,trained_action:trained.executed_action,model_version:trained.learning.version,training_changed_future_decision:true}));
});
