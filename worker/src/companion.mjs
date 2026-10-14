import {syncTeaching, TEACHING_BACKEND} from './companion-learning.mjs';
import {recordedTeachingEvidence} from './companion-evidence.mjs';
import {handleRoom} from './companion-room.mjs';
import {chartMarket,historicalMarket,CHART_INTERVALS} from './companion-charts.mjs';
// Saving trains a private decision head; only autonomous steps can execute it.
const reply = (body, status = 200) => Response.json(body, {status, headers:{'cache-control':'no-store'}});
const seconds = () => Math.floor(Date.now() / 1000);
async function learn(db, userId) {
  try {
    const result = await syncTeaching(db, userId);
    return {backend:TEACHING_BACKEND,version:result.model.version,model_hash:result.hash,pending:result.pending};
  } catch (error) {
    console.error('COMPANION_TRAINING', error.message);
    return {backend:TEACHING_BACKEND,pending:true,error:'TRAINING_RETRY_PENDING'};
  }
}
export async function handleCompanion(request, env, user, {observation,history=historicalMarket,charts=chartMarket}) {
  const path = new URL(request.url).pathname;
  const db = env.DB;
  if(path==='/api/companion/room'||path.startsWith('/api/companion/room/'))return handleRoom(request,env,user);
  if(request.method==='GET' && path==='/api/companion/chart') {
    const interval=Number(new URL(request.url).searchParams.get('interval')||60);
    if(!CHART_INTERVALS.has(interval))return reply({error:'INVALID_CHART_INTERVAL'},422);
    try{return reply(await charts(interval));}catch{return reply({error:'CHART_UNAVAILABLE'},503);}
  }
  if(request.method==='POST' && path==='/api/companion/training') {
    const recent=await db.prepare("SELECT COUNT(*) n FROM companion_contexts WHERE user_id=? AND created_at>?").bind(user.id,seconds()-60).first();
    if(recent.n>=12)return reply({error:'RATE_LIMITED'},429);
    let market;try{market=await history();}catch{return reply({error:'HISTORICAL_DATA_UNAVAILABLE'},503);}
    const price=market.candles.at(-1).close,holding=crypto.getRandomValues(new Uint8Array(1))[0]%2===0;
    const portfolio={cash:holding?5000:10000,position_side:holding?'LONG':'FLAT',position_qty:holding?5000/price:0,entry_price:holding?market.candles[0].close:0};
    const context={id:crypto.randomUUID(),kind:'historical',symbol:'BTCUSD',market,portfolio,created_at:seconds(),expires_at:seconds()+600};
    await db.prepare('INSERT INTO companion_contexts VALUES (?,?,?,?,?)').bind(context.id,user.id,JSON.stringify(context),context.created_at,context.expires_at).run();
    return reply(context,201);
  }
  if (request.method === 'GET' && path === '/api/companion') {
    const learning = await learn(db, user.id);
    // Read one consistent account/decision view even while the fly commits a step.
    const [portfolios, decisions, lessons, opening] = await db.batch([
      db.prepare('SELECT * FROM portfolios WHERE user_id=?').bind(user.id),
      db.prepare("SELECT d.id,d.action,d.server_price,d.fee,d.state_json,d.created_at,i.checkpoint_json,i.features_json,i.model_hash FROM decisions d LEFT JOIN companion_inference i ON i.challenge_id=json_extract(d.state_json,'$.provenance.challenge_id') AND i.user_id=d.user_id WHERE d.user_id=? AND d.symbol='BTCUSD' AND json_extract(d.state_json,'$.source')='BROWSER_NEURAL' ORDER BY d.created_at DESC,d.rowid DESC LIMIT 100").bind(user.id),
      db.prepare('SELECT l.id, l.action, l.created_at, c.snapshot_json, t.version_after AS model_version, t.model_hash, t.trained_at, t.probability_before, t.probability_after FROM companion_lessons l JOIN companion_contexts c ON c.id=l.context_id LEFT JOIN companion_training t ON t.lesson_id=l.id AND t.user_id=l.user_id WHERE l.user_id=? ORDER BY l.created_at DESC, l.rowid DESC LIMIT 100').bind(user.id),
      db.prepare("SELECT id,server_price,fee,state_json,created_at FROM decisions WHERE user_id=? AND idempotency_key='initial-bitcoin' AND json_extract(state_json,'$.source')='INITIAL_ALLOCATION' LIMIT 1").bind(user.id),
    ]);
    return reply({portfolio:portfolios.results[0]||null, decisions:decisions.results.map(({state_json,checkpoint_json,features_json,model_hash,...row})=>{
      const decision={...row,portfolio:JSON.parse(state_json)};
      return {...decision,teaching_evidence:recordedTeachingEvidence(decision,{checkpoint_json,features_json,model_hash})};
    }), lessons:lessons.results.map(({snapshot_json,...row})=>({...row,context:JSON.parse(snapshot_json),training_applied:row.model_version!==null})),opening:opening.results[0]?{...opening.results[0],portfolio:JSON.parse(opening.results[0].state_json),state_json:undefined}:null,learning});
  }
  if (request.method === 'POST' && path === '/api/companion/contexts') {
    // Freeze the actual view before the user chooses to save it. Clients cannot supply a price.
    if(Number(request.headers.get('content-length'))>1024)return reply({error:'REQUEST_TOO_LARGE'},413);
    const text=await request.text();
    if(text.length>1024)return reply({error:'REQUEST_TOO_LARGE'},413);
    let body;try{body=JSON.parse(text||'{}');}catch{return reply({error:'INVALID_CHART_POINT'},422);}
    if(!body||typeof body!=='object'||Array.isArray(body)||(body.candle_time!==undefined&&!Number.isSafeInteger(body.candle_time)))return reply({error:'INVALID_CHART_POINT'},422);
    const market = await observation(env);
    if(body.candle_time!==undefined){
      if(body.candle_time!==market.candles.at(-1)?.time)return reply({error:'LATEST_POINT_ONLY'},409);
    }
    const portfolio = await db.prepare('SELECT * FROM portfolios WHERE user_id=?').bind(user.id).first();
    const context = {id:crypto.randomUUID(),kind:'live',symbol:'BTCUSD',market,portfolio,created_at:seconds(),expires_at:seconds()+120};
    await db.prepare('INSERT INTO companion_contexts VALUES (?,?,?,?,?)').bind(context.id,user.id,JSON.stringify(context),context.created_at,context.expires_at).run();
    return reply(context,201);
  }
  if (request.method === 'POST' && path === '/api/companion/lessons') {
    if (Number(request.headers.get('content-length')) > 2048) return reply({error:'REQUEST_TOO_LARGE'},413);
    const text = await request.text();
    if (text.length > 2048) return reply({error:'REQUEST_TOO_LARGE'},413);
    let body;
    try { body = JSON.parse(text); } catch { return reply({error:'INVALID_DEMONSTRATION'},422); }
    if (!body || !['BUY','SELL','HOLD'].includes(body.action) || typeof body.context_id !== 'string' || body.context_id.length>64 || typeof body.idempotency_key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.idempotency_key)) return reply({error:'INVALID_DEMONSTRATION'},422);
    const previous = () => db.prepare('SELECT * FROM companion_lessons WHERE user_id=? AND idempotency_key=?').bind(user.id,body.idempotency_key).first();
    const receipt = async row => {
      if (row.action !== body.action || row.context_id !== body.context_id) return reply({error:'IDEMPOTENCY_CONFLICT'},409);
      const learning = await learn(db,user.id);
      const training = await db.prepare('SELECT version_after AS model_version,model_hash,probability_before,probability_after,trained_at FROM companion_training WHERE lesson_id=? AND user_id=?').bind(row.id,user.id).first();
      return reply({lesson:row,training_applied:Boolean(training),training,learning});
    };
    const saved = await previous();
    if (saved) return receipt(saved);
    const context = await db.prepare('SELECT * FROM companion_contexts WHERE id=? AND user_id=?').bind(body.context_id,user.id).first();
    if (!context) return reply({error:'CONTEXT_NOT_FOUND'},404);
    if (context.expires_at < seconds()) return reply({error:'CONTEXT_EXPIRED'},409);
    await db.prepare('INSERT OR IGNORE INTO companion_lessons VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,context.id,body.action,body.idempotency_key,seconds()).run();
    const result = await previous();
    return result ? receipt(result) : reply({error:'CONTEXT_ALREADY_TAUGHT'},409);
  }
  return reply({error:'NOT_FOUND'},404);
}
