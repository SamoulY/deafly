export const ACTIONS = Object.freeze(['BUY', 'SELL', 'HOLD', 'CLOSE']);
export const FEATURE_NAMES = Object.freeze(['return_1', 'return_window', 'range', 'volume_change', 'cash_ratio', 'position_side', 'unrealized_return']);
const BACKEND = 'market_only_readout_v1';
const copy = x => JSON.parse(JSON.stringify(x));
function requireThat(ok, message) { if (!ok) throw new Error(message); }
function vector(x) { requireThat(Array.isArray(x) && x.length === FEATURE_NAMES.length && x.every(Number.isFinite), 'Invalid features'); }
function canonical(x) {
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`;
  return JSON.stringify(x);
}
async function hash(x) {
  const bytes = new TextEncoder().encode(canonical(x));
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export function createDefaultCheckpoint() {
  return {backend:BACKEND, schema_version:1, feature_names:[...FEATURE_NAMES], weights:ACTIONS.map(() => FEATURE_NAMES.map(() => 0)), bias:[0,0,0.01,0], epoch:0, seen_until:null};
}
function validateCheckpoint(cp) {
  requireThat(cp?.backend === BACKEND && canonical(cp.feature_names) === canonical(FEATURE_NAMES), 'Invalid checkpoint schema');
  requireThat(Array.isArray(cp.weights) && cp.weights.length === 4, 'Invalid weights');
  cp.weights.forEach(vector);
  requireThat(cp.bias?.length === 4 && cp.bias.every(Number.isFinite), 'Invalid bias');
}
export async function hashCheckpoint(cp) { validateCheckpoint(cp); return hash(cp); }
export function predict(cp, features, mask) {
  validateCheckpoint(cp); vector(features);
  requireThat(Array.isArray(mask) && mask.length === 4 && mask.every(v => typeof v === 'boolean') && mask.some(Boolean), 'Invalid action mask');
  const logits = cp.weights.map((w,i) => mask[i] ? w.reduce((s,v,j) => s + v * features[j], cp.bias[i]) : -Infinity);
  const max = Math.max(...logits);
  const exp = logits.map(v => Math.exp(v-max));
  const sum = exp.reduce((s,v) => s+v,0);
  const probabilities = exp.map(v => v/sum);
  return {action:ACTIONS[probabilities.indexOf(Math.max(...probabilities))], probabilities};
}
export function actionMask(account) {
  requireThat(['FLAT','LONG','SHORT'].includes(account?.position), 'Invalid position');
  const flat = account.position === 'FLAT';
  return [flat && account.cash > 0,flat && account.cash > 0,true,!flat];
}
function validateCandles(candles, asOf) {
  requireThat(Array.isArray(candles) && candles.length >= 2 && Number.isFinite(asOf), 'Insufficient candles');
  candles.forEach((b,i) => {
    requireThat(b.closed === true, 'Only closed candles');
    requireThat(Number.isFinite(b.time) && b.time <= asOf, 'Invalid or future candle');
    requireThat(!i || b.time > candles[i-1].time, 'Candle chronology invalid');
    requireThat(['open','high','low','close','volume'].every(k => Number.isFinite(b[k])) && b.low > 0 && b.volume >= 0 && b.low <= Math.min(b.open,b.close) && b.high >= Math.max(b.open,b.close), 'Invalid OHLCV');
  });
}
export function extractFeatures({candles,account,asOf}) {
  validateCandles(candles,asOf); actionMask(account);
  requireThat(Number.isFinite(account.cash) && Number.isFinite(account.initial_balance) && account.initial_balance > 0, 'Invalid account');
  const last = candles.at(-1), prev = candles.at(-2), first = candles[Math.max(0,candles.length-20)];
  const side = account.position === 'LONG' ? 1 : account.position === 'SHORT' ? -1 : 0;
  requireThat(!side || (Number.isFinite(account.entry_price) && account.entry_price > 0), 'Invalid entry');
  const values = [last.close/prev.close-1,last.close/first.close-1,(last.high-last.low)/last.close,prev.volume ? last.volume/prev.volume-1 : 0,account.cash/account.initial_balance,side,side ? side*(last.close/account.entry_price-1) : 0];
  return values.map(v => Math.max(-10,Math.min(10,v)));
}
function classification(cp, rows) {
  let loss=0, correct=0;
  const confusion = ACTIONS.map(() => [0,0,0,0]);
  const counts = [0,0,0,0];
  for (const r of rows) {
    const y=ACTIONS.indexOf(r.action), p=predict(cp,r.features,r.action_mask);
    const predicted=ACTIONS.indexOf(p.action);
    loss -= Math.log(Math.max(1e-15,p.probabilities[y]));
    correct += predicted === y ? 1 : 0; confusion[y][predicted]++; counts[y]++;
  }
  const f1 = counts.map((n,i) => {
    const tp=confusion[i][i], denominator=n+confusion.reduce((s,row) => s+row[i],0);
    return denominator ? 2*tp/denominator : 0;
  });
  return {loss:loss/rows.length,accuracy:correct/rows.length,macro_f1:f1.reduce((s,v) => s+v,0)/4,confusion_matrix:confusion,class_counts:counts,count:rows.length};
}
export async function trainDecisionHead({rows,parentCheckpoint=createDefaultCheckpoint(),validationFraction=0.2,maxEpochs=30,patience=5,learningRate=0.1,minDelta=1e-6,usedIntervals=[]}) {
  validateCheckpoint(parentCheckpoint);
  requireThat(Array.isArray(rows), 'Invalid rows');
  requireThat(validationFraction > 0 && validationFraction < 1 && Number.isInteger(maxEpochs) && maxEpochs > 0 && maxEpochs <= 1000 && Number.isInteger(patience) && patience > 0 && Number.isFinite(learningRate) && learningRate > 0 && learningRate <= 1 && Number.isFinite(minDelta) && minDelta >= 0, 'Invalid training configuration');
  const selected = rows.filter(r => r.training_eligible === true).map(r => ({features:[...r.features],action:r.action,time:r.time,session_id:r.session_id,observation_hash:r.observation_hash,action_mask:r.action_mask ? [...r.action_mask] : actionMask({cash:r.features[4],position:r.features[5] === 0 ? 'FLAT' : r.features[5] > 0 ? 'LONG' : 'SHORT'}),interval_start:r.interval_start ?? r.time,interval_end:r.interval_end ?? r.time})).sort((a,b) => a.time-b.time);
  const observations=new Set();
  selected.forEach((r,i) => {
    vector(r.features);
    requireThat(Number.isFinite(r.time) && (!i || r.time > selected[i-1].time), 'Invalid chronological time');
    requireThat(typeof r.session_id === 'string' && r.session_id.length && typeof r.observation_hash === 'string' && r.observation_hash.length, 'Missing observation provenance');
    requireThat(!observations.has(r.observation_hash), 'Duplicate observation'); observations.add(r.observation_hash);
    requireThat(Number.isFinite(r.interval_start) && Number.isFinite(r.interval_end) && r.interval_start <= r.time && r.interval_end >= r.time, 'Invalid scenario interval');
    predict(parentCheckpoint,r.features,r.action_mask);
    requireThat(ACTIONS.includes(r.action) && r.action_mask[ACTIONS.indexOf(r.action)], 'Invalid or masked label');
  });
  let boundary=Math.floor(selected.length*(1-validationFraction));
  requireThat(Array.isArray(usedIntervals), 'Invalid reserved test intervals');
  for (const interval of usedIntervals) {
    requireThat(Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.start<=interval.end, 'Invalid reserved test interval');
    requireThat(selected.every(r => r.interval_end<interval.start || r.interval_start>interval.end), 'Reserved test interval overlaps training data');
  }
  const parentSplit=parentCheckpoint.training?.split_manifest;
  if (parentSplit) {
    boundary=selected.findIndex(r => r.time>=parentSplit.validation.start);
    requireThat(boundary>=0, 'Parent validation replay required');
    const supplied=new Set(selected.map(r => r.observation_hash));
    requireThat([...parentSplit.train.observation_hashes,...parentSplit.validation.observation_hashes].every(h => supplied.has(h)), 'Full parent demonstration replay required');
  }
  while (boundary > 0 && selected[boundary]?.session_id === selected[boundary-1].session_id) boundary--;
  const train=selected.slice(0,boundary), validation=selected.slice(boundary);
  if (parentSplit) {
    const trainHashes=new Set(train.map(r => r.observation_hash));
    const validationHashes=new Set(validation.map(r => r.observation_hash));
    requireThat(parentSplit.train.observation_hashes.every(h => trainHashes.has(h)) && parentSplit.validation.observation_hashes.every(h => validationHashes.has(h)), 'Parent split assignments must remain unchanged');
  }
  const counts=ACTIONS.map(a => train.filter(r => r.action===a).length);
  requireThat(train.length>=64 && validation.length>=16 && counts.filter(n => n>=8).length>=2, `TRAINING_DATA_INSUFFICIENT: train=${train.length}/64 validation=${validation.length}/16 classes_with_8=${counts.filter(n => n>=8).length}/2`);
  const trainSessions=new Set(train.map(r => r.session_id));
  requireThat(validation.every(r => !trainSessions.has(r.session_id)), 'Session crosses split');
  const manifest = part => ({start:Math.min(...part.map(r => r.interval_start)),end:Math.max(...part.map(r => r.interval_end)),count:part.length,sessions:[...new Set(part.map(r => r.session_id))],observation_hashes:part.map(r => r.observation_hash)});
  const split_manifest={train:manifest(train),validation:manifest(validation)};
  requireThat(split_manifest.train.end < split_manifest.validation.start, 'Scenario overlap across splits');
  let cp=copy(parentCheckpoint), best=copy(cp), bestLoss=classification(cp,validation).loss, stale=0, epochsRun=0;
  const initial_train=classification(cp,train);
  for (let epoch=1;epoch<=maxEpochs;epoch++) {
    const dw=ACTIONS.map(() => FEATURE_NAMES.map(() => 0)), db=[0,0,0,0];
    for (const r of train) {
      const p=predict(cp,r.features,r.action_mask).probabilities, y=ACTIONS.indexOf(r.action);
      p.forEach((value,k) => {
        const error=value-(k===y ? 1 : 0); db[k]+=error;
        r.features.forEach((x,j) => { dw[k][j]+=error*x; });
      });
    }
    cp.weights=cp.weights.map((w,k) => w.map((v,j) => v-learningRate*dw[k][j]/train.length));
    cp.bias=cp.bias.map((v,k) => v-learningRate*db[k]/train.length);
    cp.epoch=(parentCheckpoint.epoch ?? 0)+epoch; epochsRun=epoch;
    const loss=classification(cp,validation).loss;
    if (loss < bestLoss-minDelta) { best=copy(cp); bestLoss=loss; stale=0; } else stale++;
    if (stale>=patience) break;
  }
  best.seen_until=Math.max(parentCheckpoint.seen_until ?? -Infinity,split_manifest.validation.end);
  const data_hash=await hash(selected);
  best.training={data_hash,split_manifest,optimizer:'full_batch_gradient_descent',learning_rate:learningRate,max_epochs:maxEpochs,patience,min_delta:minDelta,feature_scaling:'fixed_clip_10_no_fitted_normalizer',code_version:'raising-training-v1'};
  return {checkpoint:best,checkpoint_hash:await hashCheckpoint(best),parent_hash:await hashCheckpoint(parentCheckpoint),data_hash,split_manifest,metrics:{initial_train,train:classification(best,train),validation:classification(best,validation),epochs_run:epochsRun,selected_epoch:best.epoch,excluded_rows:rows.length-selected.length}};
}
function rollout(policy, candles, rules) {
  const {initialBalance,feeBps,slippageBps,notionalFraction}=rules;
  const fee=feeBps/10000, slip=slippageBps/10000;
  let cash=initialBalance, side=0, quantity=0, entry=0, peak=initialBalance, mdd=0, voluntary=0, forced=0, directions=0, correct=0, fees=0;
  const equity = price => cash+side*quantity*(price-entry);
  const mark = price => { const e=equity(price); peak=Math.max(peak,e); mdd=Math.max(mdd,(peak-e)/peak); };
  function close(price, isForced) {
    const fill=price*(1-side*slip), cost=quantity*fill*fee;
    cash+=side*quantity*(fill-entry)-cost; fees+=cost;
    side=0; quantity=0; entry=0;
    if (isForced) forced++; else voluntary++;
  }
  let decisions=0;
  for (let i=1;i<candles.length-1;i++) {
    const account={cash,initial_balance:initialBalance,position:side===1 ? 'LONG' : side===-1 ? 'SHORT' : 'FLAT',entry_price:entry};
    const mask=actionMask(account), next=candles[i+1];
    const features=extractFeatures({candles:candles.slice(Math.max(0,i-19),i+1),account,asOf:candles[i].time});
    const action=policy(features,mask,decisions); decisions++;
    if (action==='CLOSE' && side) close(next.open,false);
    if ((action==='BUY' || action==='SELL') && !side && cash>0) {
      side=action==='BUY' ? 1 : -1; entry=next.open*(1+side*slip);
      quantity=Math.min(initialBalance*notionalFraction,cash/(1+fee))/entry;
      const cost=quantity*entry*fee; cash-=cost; fees+=cost; voluntary++;
      const change=next.close-next.open;
      if (change!==0) { directions++; correct+=Math.sign(change)===side ? 1 : 0; }
    }
    mark(next.open); mark(next.close);
  }
  if (side) close(candles.at(-1).close,true);
  mark(candles.at(-1).close);
  return {net_pnl:cash-initialBalance,final_equity:cash,max_drawdown:mdd,fees_paid:fees,voluntary_trades:voluntary,forced_trades:forced,voluntary_trade_rate:voluntary/decisions,forced_trade_rate:forced/decisions,direction_accuracy:directions ? correct/directions : null,direction_samples:directions,decisions};
}
export async function evaluateFrozen({preCheckpoint,postCheckpoint,trainingManifest,candles,usedIntervals,initialBalance=10000,feeBps=10,slippageBps=5,notionalFraction=0.25}) {
  validateCheckpoint(preCheckpoint); validateCheckpoint(postCheckpoint);
  validateCandles(candles,candles?.at(-1)?.time);
  requireThat(candles.length>=3,'Insufficient evaluation candles');
  const cadence=candles[1].time-candles[0].time;
  requireThat(candles.slice(1).every((b,i) => b.time-candles[i].time===cadence), 'Evaluation candle cadence gap');
  const interval={start:candles[0].time,end:candles.at(-1).time};
  requireThat(Number.isFinite(trainingManifest?.train?.end) && Number.isFinite(trainingManifest?.validation?.end), 'Training manifest required');
  const seen=Math.max(trainingManifest.train.end,trainingManifest.validation.end,preCheckpoint.seen_until ?? -Infinity,postCheckpoint.seen_until ?? -Infinity);
  requireThat(interval.start>seen,'Evaluation must be strictly future without overlap');
  requireThat(Array.isArray(usedIntervals),'usedIntervals registry required');
  for (const used of usedIntervals) {
    requireThat(Number.isFinite(used.start) && Number.isFinite(used.end) && used.start<=used.end,'Invalid used interval');
    requireThat(interval.end<used.start || interval.start>used.end,'Reused evaluation interval overlap');
  }
  requireThat(Number.isFinite(initialBalance) && initialBalance>0 && Number.isFinite(feeBps) && feeBps>=0 && feeBps<10000 && Number.isFinite(slippageBps) && slippageBps>=0 && slippageBps<10000 && Number.isFinite(notionalFraction) && notionalFraction>0 && notionalFraction<=1,'Invalid evaluation rules');
  const pre=copy(preCheckpoint), post=copy(postCheckpoint), bars=copy(candles);
  const rules={initialBalance,feeBps,slippageBps,notionalFraction};
  const results={cash:rollout(() => 'HOLD',bars,rules),buy_hold:rollout((_f,_m,i) => i===0 ? 'BUY' : 'HOLD',bars,rules),pre:rollout((f,m) => predict(pre,f,m).action,bars,rules),post:rollout((f,m) => predict(post,f,m).action,bars,rules)};
  return {backend:BACKEND,mode:'PAPER_ONLY',frozen:true,online_learning:false,user_intervention:false,interval,rules,data_hash:await hash(bars),pre_hash:await hashCheckpoint(pre),post_hash:await hashCheckpoint(post),results,comparison:{net_pnl_delta:results.post.net_pnl-results.pre.net_pnl,max_drawdown_delta:results.post.max_drawdown-results.pre.max_drawdown},status:'NO VERIFIED IMPROVEMENT',reason:'One held-out interval is descriptive evidence only; no statistical verification or profit guarantee.'};
}
