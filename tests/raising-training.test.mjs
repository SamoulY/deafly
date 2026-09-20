import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../worker/src/raising-training.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });

test('default checkpoint restores identical hash and masked deterministic inference', async () => {
  assert.equal(typeof api.createDefaultCheckpoint, 'function');
  const cp = api.createDefaultCheckpoint();
  assert.equal(cp.backend, 'market_only_readout_v1');
  const hash = await api.hashCheckpoint(cp);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(await api.hashCheckpoint(JSON.parse(JSON.stringify(cp))), hash);
  const x = api.FEATURE_NAMES.map(() => 0);
  assert.equal(api.predict(cp, x, [true,true,true,false]).action, 'HOLD');
  assert.deepEqual(api.predict(cp, x, [false,false,false,true]), {action:'CLOSE', probabilities:[0,0,0,1]});
  assert.throws(() => api.predict(cp,x,[false,false,false,false]), /mask/i);
});
const candles = (start=1, count=20) => Array.from({length:count}, (_,i) => ({time:start+i,open:100+i,high:102+i,low:99+i,close:101+i,volume:10+i,closed:true}));
test('feature extraction excludes future data and cosmetic identity and masks position actions', () => {
  assert.equal(typeof api.extractFeatures, 'function');
  const account = {cash:10000,initial_balance:10000,position:'FLAT',entry_price:0};
  const bars = candles();
  const x = api.extractFeatures({candles:bars,account,asOf:20});
  assert.equal(x.length,api.FEATURE_NAMES.length);
  assert.deepEqual(x,api.extractFeatures({candles:bars,account:{...account,id:'x',outfit:'hat',future_reward:9},asOf:20}));
  assert.throws(() => api.extractFeatures({candles:bars,account,asOf:19}), /future/i);
  assert.throws(() => api.extractFeatures({candles:[...bars,{...bars.at(-1),time:21,closed:false}],account,asOf:21}), /closed/i);
  assert.deepEqual(api.actionMask(account),[true,true,true,false]);
  assert.deepEqual(api.actionMask({...account,position:'SHORT'}),[false,false,true,true]);
});
function rows() {
  return Array.from({length:100},(_,i) => ({features:[i%2 ? 1 : -1,0,0,0,1,0,0],action:i%2 ? 'BUY' : 'SELL',time:i+1,session_id:`s${Math.floor(i/10)}`,observation_hash:`obs${i}`,training_eligible:true}));
}
test('real supervised training reduces loss deterministically without mutating inputs', async () => {
  assert.equal(typeof api.trainDecisionHead,'function');
  const input = {rows:rows(),parentCheckpoint:api.createDefaultCheckpoint(),maxEpochs:60,learningRate:0.15};
  const before = JSON.stringify(input);
  const result = await api.trainDecisionHead(input);
  assert.ok(result.metrics.train.loss < result.metrics.initial_train.loss * 0.5);
  assert.ok(result.metrics.validation.accuracy > 0.9);
  assert.equal(result.split_manifest.train.count,80);
  assert.equal(result.split_manifest.validation.count,20);
  assert.equal(JSON.stringify(input),before);
  assert.notEqual(result.parent_hash,result.checkpoint_hash);
  assert.equal((await api.trainDecisionHead(input)).checkpoint_hash,result.checkpoint_hash);
  assert.equal(await api.hashCheckpoint(JSON.parse(JSON.stringify(result.checkpoint))),result.checkpoint_hash);
  const stopped = await api.trainDecisionHead({...input,minDelta:10,patience:2});
  assert.equal(stopped.metrics.epochs_run,2);
  assert.equal(stopped.checkpoint.epoch,0);
});
test('training rejects insufficient labels, duplicate observations, masked labels and overlapping splits', async () => {
  await assert.rejects(api.trainDecisionHead({rows:rows().slice(0,70)}),/TRAINING_DATA_INSUFFICIENT/);
  await assert.rejects(api.trainDecisionHead({rows:rows().map(r => ({...r,action:'HOLD'}))}),/TRAINING_DATA_INSUFFICIENT/);
  const overlap=rows(); overlap[79].interval_end=85;
  await assert.rejects(api.trainDecisionHead({rows:overlap}),/overlap/i);
  const duplicate=rows(); duplicate[1].observation_hash=duplicate[0].observation_hash;
  await assert.rejects(api.trainDecisionHead({rows:duplicate}),/duplicate/i);
  const masked=rows(); masked[0].action_mask=[false,false,true,false];
  await assert.rejects(api.trainDecisionHead({rows:masked}),/masked/i);
  const sessions=rows(); sessions[95].session_id='s0';
  await assert.rejects(api.trainDecisionHead({rows:sessions}),/session/i);
});
test('frozen future evaluation preserves checkpoints and applies identical costs and forced settlement', async () => {
  assert.equal(typeof api.evaluateFrozen,'function');
  const trained=await api.trainDecisionHead({rows:rows()});
  const buy=api.createDefaultCheckpoint(); buy.bias=[10,0,0,0];
  const input={preCheckpoint:buy,postCheckpoint:buy,trainingManifest:trained.split_manifest,candles:candles(200,20),usedIntervals:[],feeBps:10,slippageBps:10};
  const snapshot=JSON.stringify(input);
  const result=await api.evaluateFrozen(input);
  assert.equal(JSON.stringify(input),snapshot);
  assert.equal(result.results.cash.net_pnl,0);
  assert.deepEqual(result.results.pre,result.results.post);
  assert.deepEqual(result.results.pre,result.results.buy_hold);
  assert.equal(result.results.pre.forced_trades,1);
  assert.equal(result.results.pre.voluntary_trades,1);
  assert.equal(result.results.pre.direction_accuracy,1);
  assert.equal(result.results.cash.direction_accuracy,null);
  assert.equal(result.status,'NO VERIFIED IMPROVEMENT');
  const free=await api.evaluateFrozen({...input,feeBps:0,slippageBps:0});
  assert.ok(result.results.pre.net_pnl < free.results.pre.net_pnl);
  await assert.rejects(api.evaluateFrozen({...input,candles:candles(95)}),/future|overlap/i);
  await assert.rejects(api.evaluateFrozen({...input,usedIntervals:[{start:210,end:250}]}),/reused|overlap/i);
});
test('continuation never moves parent validation into training and excludes reserved test intervals', async () => {
  const first=await api.trainDecisionHead({rows:rows()});
  const more=[...rows(),...rows().slice(0,20).map((r,i) => ({...r,time:101+i,session_id:`new${Math.floor(i/10)}`,observation_hash:`newobs${i}`}))];
  const continued=await api.trainDecisionHead({rows:more,parentCheckpoint:first.checkpoint});
  assert.deepEqual(continued.split_manifest.train.observation_hashes,first.split_manifest.train.observation_hashes);
  await assert.rejects(api.trainDecisionHead({rows:rows(),usedIntervals:[{start:45,end:50}]}),/reserved|test interval/i);
  const sparse=candles(200); sparse[5].time+=0.5;
  await assert.rejects(api.evaluateFrozen({preCheckpoint:first.checkpoint,postCheckpoint:first.checkpoint,trainingManifest:first.split_manifest,candles:sparse,usedIntervals:[]}),/cadence|gap/i);
});
test('continuation rejects moving parent validation observations into training', async () => {
  const first=await api.trainDecisionHead({rows:rows()});
  const moved=rows().map((r,i) => i>=80 && i<90 ? {...r,time:i-100} : r);
  moved.push(...rows().slice(0,10).map((r,i) => ({...r,time:101+i,session_id:'extra',observation_hash:`extra${i}`})));
  await assert.rejects(api.trainDecisionHead({rows:moved,parentCheckpoint:first.checkpoint}), /validation|split/i);
});
test('missing demonstration masks are inferred from account features so impossible CLOSE is rejected', async () => {
  const invalid=rows(); invalid[0].action='CLOSE';
  await assert.rejects(api.trainDecisionHead({rows:invalid}),/masked/i);
  for (const side of [-1,1]) {
    const positioned=rows(); positioned[0].features[5]=side;
    await assert.rejects(api.trainDecisionHead({rows:positioned}),/masked/i);
    positioned[0].action='CLOSE';
    await api.trainDecisionHead({rows:positioned,maxEpochs:1});
  }
  const cashless=rows(); cashless[0].features[4]=0;
  await assert.rejects(api.trainDecisionHead({rows:cashless}),/masked/i);
});

function freeze(value) {
  if (value && typeof value==='object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
test('restored frozen checkpoints preserve inference and early stopping restores parent parameters', async () => {
  const first=await api.trainDecisionHead({rows:rows(),maxEpochs:2});
  const restored=freeze(JSON.parse(JSON.stringify(first.checkpoint)));
  const parentHash=await api.hashCheckpoint(restored);
  assert.equal(parentHash,first.checkpoint_hash);
  const features=rows()[0].features, mask=[true,true,true,false];
  assert.deepEqual(api.predict(restored,features,mask),api.predict(first.checkpoint,features,mask));
  const result=await api.trainDecisionHead(freeze({rows:rows(),parentCheckpoint:restored,minDelta:10,patience:2}));
  assert.deepEqual(result.checkpoint.weights,restored.weights);
  assert.deepEqual(result.checkpoint.bias,restored.bias);
  assert.equal(result.checkpoint.epoch,restored.epoch);
  result.checkpoint.weights[0][0]+=1;
  assert.equal(await api.hashCheckpoint(restored),parentHash);
});
test('HOLD evaluation is neutral and repeatable with frozen inputs and nonzero costs', async () => {
  const cp=api.createDefaultCheckpoint();
  const input=freeze({preCheckpoint:cp,postCheckpoint:cp,trainingManifest:{train:{end:80},validation:{end:100}},candles:candles(200),usedIntervals:[],feeBps:100,slippageBps:100});
  const result=await api.evaluateFrozen(input);
  assert.deepEqual(await api.evaluateFrozen(input),result);
  assert.deepEqual(result.results.pre,result.results.cash);
  assert.deepEqual(result.results.post,result.results.cash);
  for (const key of ['net_pnl','max_drawdown','fees_paid','voluntary_trades','forced_trades','direction_samples']) assert.equal(result.results.post[key],0,key);
  assert.equal(result.results.post.direction_accuracy,null);
  assert.equal(result.results.post.final_equity,10000);
  assert.equal(result.pre_hash,await api.hashCheckpoint(cp));
  assert.equal(result.post_hash,result.pre_hash);
  assert.equal(result.frozen,true);
  assert.equal(result.online_learning,false);
  assert.equal(result.user_intervention,false);
});
test('evaluation honors both checkpoint bounds and inclusive reserved interval boundaries', async () => {
  const cp=api.createDefaultCheckpoint();
  const input={preCheckpoint:cp,postCheckpoint:cp,trainingManifest:{train:{end:80},validation:{end:100}},candles:candles(200),usedIntervals:[]};
  for (const key of ['preCheckpoint','postCheckpoint']) {
    await assert.rejects(api.evaluateFrozen({...input,[key]:{...cp,seen_until:200}}),/future|overlap/i);
  }
  for (const interval of [{start:190,end:200},{start:219,end:230}]) {
    await assert.rejects(api.evaluateFrozen({...input,usedIntervals:[interval]}),/overlap/i);
  }
  await api.evaluateFrozen({...input,usedIntervals:[{start:180,end:199},{start:220,end:230}]});
});
test('ineligible rows have no effect on training and chronological input order is canonical', async () => {
  const source=rows();
  const expected=await api.trainDecisionHead({rows:source,maxEpochs:2});
  const actual=await api.trainDecisionHead({rows:[...source].reverse().concat({training_eligible:false,features:null}),maxEpochs:2});
  assert.equal(actual.checkpoint_hash,expected.checkpoint_hash);
  assert.equal(actual.data_hash,expected.data_hash);
  assert.equal(actual.metrics.excluded_rows,1);
  const duplicateTime=rows(); duplicateTime[1].time=duplicateTime[0].time;
  await assert.rejects(api.trainDecisionHead({rows:duplicateTime}),/chronolog/i);
  await assert.rejects(api.trainDecisionHead({rows:source.slice(10),parentCheckpoint:expected.checkpoint}),/replay/i);
});
