import {initialState,sessionView,advance,mask} from './raising-core.mjs';
import {marketHistory, canonicalSymbol, marketSource} from './market.mjs';
const CORS={"access-control-allow-origin":"*","access-control-allow-headers":"content-type,x-session-token,idempotency-key","access-control-allow-methods":"GET,POST,OPTIONS"};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...CORS}});
const defaults={head:'head-cap',face:'face-glasses',body:'body-tie',background:'background-mint'};
async function ensureProfile(db,id) {
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO raising_profiles VALUES (?,?,?,?,?)').bind(id,crypto.randomUUID(),'Fly',Date.now(),JSON.stringify(defaults)),
    ...Object.values(defaults).map(item=>db.prepare('INSERT OR IGNORE INTO raising_ownership VALUES (?,?,?)').bind(id,item,Date.now()))
  ]);
}
async function profile(db,id) {
  const row=await db.prepare('SELECT * FROM raising_profiles WHERE user_id=?').bind(id).first();
  const {loadout_json,...p}=row;
  return {profile:{...p,loadout:JSON.parse(loadout_json)},points:(await db.prepare('SELECT COALESCE(SUM(amount),0) n FROM raising_points WHERE user_id=?').bind(id).first()).n,owned:(await db.prepare('SELECT item_id FROM raising_ownership WHERE user_id=? ORDER BY item_id').bind(id).all()).results.map(r=>r.item_id),active_session_id:(await db.prepare("SELECT id FROM raising_sessions WHERE user_id=? AND status='ACTIVE'").bind(id).first())?.id??null};
}
export async function handleRaising(request,env,user) {
  const path=new URL(request.url).pathname;
  if(!/^\/api\/raising\/(profile|catalog|purchase|equip|sessions(?:\/[^/]+(?:\/(?:actions|review))?)?)$/.test(path)) return null;
  if(!user?.id) return json({error:'UNAUTHORIZED',message:'Authentication required'},401);
  if(path.startsWith('/api/raising/sessions')) return sessions(request,env,user,path);
  const route=path.split('/').at(-1),db=env.DB;
  if(!['GET','POST'].includes(request.method) || (route==='catalog'&&request.method!=='GET') || (['equip','purchase'].includes(route)&&request.method!=='POST')) return json({error:'METHOD_NOT_ALLOWED',message:'Method not allowed'},405);
  try {
    let body={};
    if(request.method==='POST') {try {body=await request.json();} catch {return json({error:'INVALID_BODY',message:'JSON required'},400);} if(!body || typeof body!=='object') return json({error:'INVALID_BODY',message:'Object required'},400);}
    if(route==='catalog') return json({items:(await db.prepare('SELECT * FROM raising_catalog ORDER BY slot,cost,id').all()).results,cosmetic_only:true});
    if(route==='profile'&&request.method==='POST'&&(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>40)) return json({error:'INVALID_NAME',message:'Name must contain 1 to 40 characters'},422);
    await ensureProfile(db,user.id);
    if(route==='profile'&&request.method==='POST') await db.prepare('UPDATE raising_profiles SET name=? WHERE user_id=?').bind(body.name.trim(),user.id).run();
    if(route==='purchase'||route==='equip') {
      const item=await db.prepare('SELECT * FROM raising_catalog WHERE id=?').bind(typeof body.item_id==='string'?body.item_id:'').first();
      if(!item) return json({error:'INVALID_ITEM',message:'Unknown catalog item'},422);
      if(route==='purchase') await db.prepare('INSERT OR IGNORE INTO raising_ownership VALUES (?,?,?)').bind(user.id,item.id,Date.now()).run();
      else {
        if(!await db.prepare('SELECT 1 FROM raising_ownership WHERE user_id=? AND item_id=?').bind(user.id,item.id).first()) return json({error:'NOT_OWNED',message:'Item is not owned'},409);
        await db.prepare('UPDATE raising_profiles SET loadout_json=json_set(loadout_json,?,?) WHERE user_id=?').bind(`$.${item.slot}`,item.id,user.id).run();
      }
    }
    return json(await profile(db,user.id));
  } catch(error) { if(String(error).includes('INSUFFICIENT_POINTS')) return json({error:'INSUFFICIENT_POINTS',message:'Insufficient points'},409); throw error; }
}
const error=(code,status,message=code)=>json({error:code,message},status);
async function sessions(request,env,user,path) {
  const db=env.DB,parts=path.split('/'),id=parts[4],sub=parts[5];
  if((sub==='actions'&&request.method!=='POST')||(sub==='review'&&request.method!=='GET')||(id&&!sub&&request.method!=='GET')||!['GET','POST'].includes(request.method)) return error('METHOD_NOT_ALLOWED',405);
  let body={};
  if(request.method==='POST') {try {body=await request.json();} catch {return error('INVALID_BODY',400);} if(!body||typeof body!=='object') return error('INVALID_BODY',400);}
  if(!id) {
    if(request.method==='GET') {
      const rows=(await db.prepare('SELECT id,status,created_at,completed_at,step,symbol,scenario_family,reward_points FROM raising_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 50').bind(user.id).all()).results;
      return json({sessions:rows,active_session_id:rows.find(r=>r.status==='ACTIVE')?.id??null});
    }
    const active=await db.prepare("SELECT * FROM raising_sessions WHERE user_id=? AND status='ACTIVE'").bind(user.id).first();
    if(active) return json(await sessionView(active));
    const symbol=canonicalSymbol(body.symbol??'BTCUSD');if(!['BTCUSD','ETHUSD'].includes(symbol)) return error('INVALID_SYMBOL',422);
    let data;
    try { data=await history(env,symbol); } catch(e) {return error(e.message,e.message==='HISTORY_INCOMPLETE'?422:503);}
    const bars=data.bars,now=Date.now(),sessionId=crypto.randomUUID(),family=`${symbol}:${new Date(bars.at(-1).time*1000).toISOString().slice(0,10)}:raising-v1`;
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO raising_sessions(id,user_id,status,created_at,symbol,scenario_family,data_json,state_json) VALUES (?,?,'ACTIVE',?,?,?,?,?)").bind(sessionId,user.id,now,symbol,family,JSON.stringify(data),JSON.stringify(initialState(bars[29].time))),
      db.prepare('INSERT OR IGNORE INTO raising_reservations SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM raising_sessions WHERE id=?)').bind(user.id,family,sessionId,new Date(now).toISOString().slice(0,10),sessionId),
      db.prepare('UPDATE raising_sessions SET reward_eligible=? WHERE id=? AND EXISTS(SELECT 1 FROM raising_reservations WHERE session_id=?)').bind(data.provenance.synthetic?0:1,sessionId,sessionId)
    ]);
    const row=await db.prepare("SELECT * FROM raising_sessions WHERE user_id=? AND status='ACTIVE'").bind(user.id).first();
    return json(await sessionView(row),row.id===sessionId?201:200);
  }
  const get=()=>db.prepare('SELECT * FROM raising_sessions WHERE id=? AND user_id=?').bind(id,user.id).first();
  const row=await get();if(!row) return error('NOT_FOUND',404);
  if(sub==='review') {
    if(row.status!=='COMPLETED') return error('SESSION_ACTIVE',409);
    const records=async table=>(await db.prepare(`SELECT record_json FROM ${table} WHERE session_id=? ORDER BY step`).bind(id).all()).results.map(r=>JSON.parse(r.record_json));
    return json({session:await sessionView(row),demonstrations:await records('raising_demonstrations'),system_actions:await records('raising_system_actions'),equity_curve:JSON.parse(row.state_json).equity_curve});
  }
  if(!sub) return json(await sessionView(row));
  if(!Number.isInteger(body.step)||typeof body.idempotency_key!=='string'||body.idempotency_key.length<1||body.idempotency_key.length>100||!['BUY','SELL','HOLD','CLOSE'].includes(body.action)) return error('INVALID_ACTION',422);
  const canonical=JSON.stringify({action:body.action,step:body.step});
  const prior=()=>db.prepare('SELECT body_json FROM raising_demonstrations WHERE session_id=? AND idempotency_key=?').bind(id,body.idempotency_key).first();
  const existing=await prior();if(existing) return existing.body_json===canonical?json(await sessionView(await get())):error('IDEMPOTENCY_CONFLICT',409);
  if(row.status!=='ACTIVE'||row.step!==body.step) return error('STALE_STEP',409);
  if(!mask(JSON.parse(row.state_json).account).includes(body.action)) return error('INVALID_ACTION',422);
  const {state,record,system}=await advance(row,body.action),token=crypto.randomUUID(),complete=row.step===11;
  const statements=[
    db.prepare("UPDATE raising_sessions SET state_json=?,step=step+1,status=?,completed_at=?,action_token=? WHERE id=? AND user_id=? AND step=? AND status='ACTIVE'").bind(JSON.stringify(state),complete?'COMPLETED':'ACTIVE',complete?Date.now():null,token,id,user.id,row.step),
    db.prepare('INSERT INTO raising_demonstrations SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM raising_sessions WHERE id=? AND action_token=?)').bind(id,row.step,body.idempotency_key,canonical,JSON.stringify(record),id,token)
  ];
  if(system) statements.push(db.prepare('INSERT INTO raising_system_actions SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM raising_sessions WHERE id=? AND action_token=?)').bind(id,12,JSON.stringify(system),id,token));
  if(complete&&row.reward_eligible&&state.account.equity>10000&&state.account.max_drawdown<=.2) {
    const points=Math.min(50,Math.ceil(1000*(state.account.equity/10000-1))),now=Date.now(),dayStart=Math.floor(now/86400000)*86400000;
    statements.push(db.prepare("INSERT OR IGNORE INTO raising_points SELECT ?,?,MIN(?,MAX(0,100-COALESCE((SELECT SUM(amount) FROM raising_points WHERE user_id=? AND kind='REWARD' AND created_at>=? AND created_at<?),0))),'REWARD',? WHERE EXISTS(SELECT 1 FROM raising_sessions WHERE id=? AND action_token=? AND reward_eligible=1) AND (SELECT COUNT(*) FROM raising_demonstrations WHERE session_id=?)>=8").bind(`reward:${id}`,user.id,points,user.id,dayStart,dayStart+86400000,now,id,token,id));
    statements.push(db.prepare('UPDATE raising_sessions SET reward_points=COALESCE((SELECT amount FROM raising_points WHERE id=?),0) WHERE id=? AND action_token=?').bind(`reward:${id}`,id,token));
  }
  await db.batch(statements);
  const saved=await prior(); if(!saved||saved.body_json!==canonical) return error('STALE_STEP',409);
  return json(await sessionView(await get()));
}
async function history(env,symbol) {
  const synthetic=env.RAISING_TEST_MODE==='local-only'&&!!env.RAISING_TEST_HISTORY;
  let bars, source;
  if(synthetic) {
    if(env.RAISING_TEST_HISTORY.symbol!==symbol) throw Error('HISTORY_INCOMPLETE');
    bars=env.RAISING_TEST_HISTORY.bars;
  } else {
    try { const live=await marketHistory(symbol,env); bars=live.bars; source=live; }
    catch(error) {const msg=String(error.message||'')+' '+(error.causes||[]).join(' ');throw Error(msg.includes('MARKET_GAP_OR_DUPLICATE')||msg.includes('MARKET_INVALID')||msg.includes('HISTORY_INCOMPLETE')||msg.includes('MARKET_STALE')?'HISTORY_INCOMPLETE':'HISTORY_UNAVAILABLE');}
  }
  if(!Array.isArray(bars)) throw Error('HISTORY_INCOMPLETE');
  bars=bars.filter(b=>b.time+60<=Date.now()/1000).slice(-90);
  if(bars.length!==90||bars.some((b,i)=>![b.time,b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||!Number.isInteger(b.time)||b.time%60!==0||b.open<=0||b.close<=0||b.low<=0||b.volume<0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close)||i>0&&b.time-bars[i-1].time!==60)) throw Error('HISTORY_INCOMPLETE');
  return {bars:bars.map(({time,open,high,low,close,volume})=>({time,open,high,low,close,volume})),provenance:synthetic?{provider:'test',synthetic:true,data_complete:true}:marketSource(source)};
}