// A private, market-conditioned decision head learned from server-frozen examples.
// The original WASM brain still supplies the neural signal and activity gate.
export const TEACHING_BACKEND = 'companion-softmax-v1';
export const DIRECTIONS = ['BUY', 'SELL', 'HOLD'];
const clip = (x, limit = 1) => Math.max(-limit, Math.min(limit, x));
const validVector = x => Array.isArray(x) && x.length === 7 && x.every(Number.isFinite);
export function teachingFeatures(market, portfolio) {
  const bars = market?.candles;
  if (!Array.isArray(bars) || bars.length < 2 || bars.some((b, i) => !Number.isFinite(b.close) || b.close <= 0 || !Number.isFinite(b.time) || (i && b.time <= bars[i - 1].time))) throw Error('TEACHING_CONTEXT_INVALID');
  const last = bars.at(-1).close, previous = bars.at(-2).close;
  const window = bars.slice(-20).map(b => b.close);
  const side = portfolio?.position_side || 'FLAT';
  const cash = Number(portfolio?.cash), quantity = Number(portfolio?.position_qty ?? portfolio?.quantity ?? 0), entry = Number(portfolio?.entry_price || portfolio?.avg_cost || 0);
  if (!['FLAT', 'LONG', 'SHORT'].includes(side) || !Number.isFinite(cash) || !Number.isFinite(quantity) || quantity < 0 || (side !== 'FLAT' && !(entry > 0))) throw Error('TEACHING_CONTEXT_INVALID');
  return [clip((last / previous - 1) * 100), clip((last / window[0] - 1) * 25), clip((Math.max(...window) / Math.min(...window) - 1) * 25), clip(cash / 10000), side === 'LONG' ? 1 : side === 'SHORT' ? -1 : 0, clip(quantity * last / 10000), side === 'FLAT' ? 0 : clip((last / entry - 1) * (side === 'LONG' ? 1 : -1) * 20)];
}
export function initialTeachingModel() {
  return {backend:TEACHING_BACKEND, version:0, weights:DIRECTIONS.map(() => Array(7).fill(0)), bias:[0, 0, 0]};
}
function validate(model, features) {
  if (model?.backend !== TEACHING_BACKEND || !Number.isSafeInteger(model.version) || model.version < 0 || !Array.isArray(model.weights) || model.weights.length !== 3 || !model.weights.every(validVector) || model.bias?.length !== 3 || !model.bias.every(Number.isFinite) || !validVector(features)) throw Error('TEACHING_MODEL_INVALID');
}
export function teachingLogits(model, features) {
  validate(model, features);
  return model.weights.map((row, a) => row.reduce((sum, w, i) => sum + w * features[i], model.bias[a]));
}
const softmax = logits => { const max = Math.max(...logits), exp = logits.map(x => Math.exp(x - max)), total = exp.reduce((a, b) => a + b, 0); return exp.map(x => x / total); };
export function trainTeachingExample(model, features, action) {
  validate(model, features);
  const label = DIRECTIONS.indexOf(action);
  if (label < 0) throw Error('TEACHING_LABEL_INVALID');
  const next = structuredClone(model);
  const before = softmax(teachingLogits(model, features))[label];
  // Four bounded SGD steps make a single demonstration useful without copying its action.
  for (let step = 0; step < 4; step++) {
    const probabilities = softmax(teachingLogits(next, features));
    for (let a = 0; a < 3; a++) {
      const error = (a === label ? 1 : 0) - probabilities[a];
      next.weights[a] = next.weights[a].map((w, i) => clip(w * 0.999 + 0.2 * error * features[i], 2));
      next.bias[a] = clip(next.bias[a] * 0.999 + 0.2 * error, 2);
    }
  }
  next.version++;
  return {model:next, probability_before:before, probability_after:softmax(teachingLogits(next, features))[label]};
}
export async function teachingHash(model) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(model)))), b => b.toString(16).padStart(2, '0')).join('');
}
export function taughtDecision(model, features, decoder, portfolio) {
  const learned = teachingLogits(model, features).map(x => clip(x, 2));
  let direction = decoder.proposed_action;
  const neural = clip(decoder.difference_hz / 5, 2);
  const logits = [neural + learned[0], -neural + learned[1], 1 + learned[2]];
  // No lessons preserves the exact original decoder. A silent brain never trades.
  if (model.version && decoder.gate_spikes > 0) {
    const best = Math.max(...logits);
    direction = logits[2] === best || (logits[0] === best && logits[1] === best) ? 'HOLD' : logits[0] === best ? 'BUY' : 'SELL';
  }
  const side = portfolio.position_side || 'FLAT';
  let action = direction === 'HOLD' ? 'HOLD' : side === 'FLAT' ? direction : (side === 'LONG' && direction === 'SELL') || (side === 'SHORT' && direction === 'BUY') ? 'CLOSE' : 'HOLD';
  if (side === 'FLAT' && Number(portfolio.cash) < 0.01) action = 'HOLD';
  return {action, direction, neural_direction:decoder.proposed_action, model_version:model.version, logits};
}

// Idempotent catch-up also activates examples saved before training was introduced.
// Ledger inserts and model updates run in one D1 transaction, guarded by version.
export async function syncTeaching(db, userId) {
  const initial = initialTeachingModel();
  await db.prepare('INSERT OR IGNORE INTO companion_models VALUES (?,?,?,?,?)').bind(userId, 0, JSON.stringify(initial), await teachingHash(initial), Math.floor(Date.now() / 1000)).run();
  for (let attempt = 0; attempt < 4; attempt++) {
    const [models, examples] = await db.batch([
      db.prepare('SELECT * FROM companion_models WHERE user_id=?').bind(userId),
      db.prepare('SELECT l.id,l.action,c.snapshot_json FROM companion_lessons l JOIN companion_contexts c ON c.id=l.context_id AND c.user_id=l.user_id LEFT JOIN companion_training t ON t.lesson_id=l.id WHERE l.user_id=? AND t.lesson_id IS NULL ORDER BY l.created_at,l.rowid LIMIT 25').bind(userId),
    ]);
    let row = models.results[0], model = JSON.parse(row.checkpoint_json);
    if (!examples.results.length) return {model, hash:row.model_hash, pending:false};
    const statements = [];
    for (const example of examples.results) {
      const context = JSON.parse(example.snapshot_json), features = teachingFeatures(context.market, context.portfolio);
      const trained = trainTeachingExample(model, features, example.action), hash = await teachingHash(trained.model);
      statements.push(db.prepare('INSERT INTO companion_training VALUES (?,?,?,?,?,?,?,?,?,?)').bind(example.id, userId, model.version, trained.model.version, JSON.stringify(trained.model), hash, trained.probability_before, trained.probability_after, JSON.stringify(features), Math.floor(Date.now() / 1000)));
      model = trained.model; row = {model_hash:hash};
    }
    try {
      await db.batch(statements);
      const remaining = await db.prepare('SELECT 1 AS pending FROM companion_lessons l LEFT JOIN companion_training t ON t.lesson_id=l.id WHERE l.user_id=? AND t.lesson_id IS NULL LIMIT 1').bind(userId).first();
      return {model, hash:row.model_hash, pending:Boolean(remaining)};
    } catch (error) {
      if (!/TEACHING_VERSION_CONFLICT|UNIQUE constraint/.test(error.message)) throw error;
    }
  }
  throw Error('TEACHING_BUSY');
}
