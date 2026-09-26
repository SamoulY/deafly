import {handleRaising} from './raising.mjs';
import {marketHistory,canonicalSymbol,marketSource} from './market.mjs';
import {RULES,lockIntent,marketDecimal,units} from './flydesk-broker.mjs';
import {initialState,sessionView,advance,hash,WARMUP,STEPS} from './flydesk-core.mjs';
import {validateAnalysis,chartViews} from './flydesk-indicators.mjs';
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(error,s=422)=>json({error,message:error},s);
const admin=(env,user)=>String(env.ADMIN_USER_IDS||'').split(',').includes(user.id);
export async function handleFlydesk(request,env,user) {
  const url=new URL(request.url),path=url.pathname.replace('/api/flydesk/',''),db=env.DB;
  if(!user?.id)return fail('UNAUTHORIZED',401);
  try {
    let body={};if(['POST','PUT'].includes(request.method)){try{body=await request.json();}catch{return fail('INVALID_JSON',400);}if(!body||typeof body!=='object'||Array.isArray(body))return fail('INVALID_BODY',400);}
    if(['profile','catalog','purchase','equip'].includes(path)) {
      const target=new URL(request.url);target.pathname='/api/raising/'+path;
      const response=await handleRaising(new Request(target,{method:request.method,headers:request.headers,...(request.method==='POST'?{body:JSON.stringify(body)}:{})}),env,user);
      if(!response?.ok||path==='catalog')return response;
      const data=await response.json();data.active_session_id=(await db.prepare("SELECT id FROM flydesk_sessions WHERE user_id=? AND status='ACTIVE'").bind(user.id).first())?.id??null;return json(data);
    }
    if(path==='admin'&&request.method==='GET') {
      if(!admin(env,user))return fail('FORBIDDEN',403);
      return json({datasets:(await db.prepare('SELECT id,symbol,provider,manifest_json,created_at FROM flydesk_datasets ORDER BY created_at DESC').all()).results,jobs:(await db.prepare('SELECT id,status,error,created_at FROM flydesk_training_jobs ORDER BY created_at DESC LIMIT 50').all()).results,execution_mode:'PAPER_ONLY',native_g1:'NOT_VERIFIED'});
    }
    if(path==='datasets'&&request.method==='GET')return json({datasets:(await db.prepare('SELECT id,symbol,provider,manifest_json FROM flydesk_datasets').all()).results.map(d=>({...d,manifest:JSON.parse(d.manifest_json),manifest_json:undefined}))});
    if(path==='datasets'&&request.method==='POST') {
      if(!admin(env,user))return fail('FORBIDDEN',403);
      const bars=validateHistory(body.bars),symbol=canonicalSymbol(body.symbol),id=await hash({bars,symbol});
      const split={train_end:bars[Math.floor(bars.length*.7)-1].time,validation_end:bars[Math.floor(bars.length*.85)-1].time};
      const trustedSource=body.provider==='coinbase_exchange_public'&&body.source_kind==='REAL_HISTORICAL';
      const manifest={id,symbol,start:bars[0].time,end:bars.at(-1).time,count:bars.length,availability_basis:'BAR_CLOSE_ASSUMPTION',splits:split,source_kind:trustedSource?'ADMIN_DECLARED_REAL':'ADMIN_IMPORTED',training_verified:trustedSource,imported_by:user.id,source_url:trustedSource?'https://api.exchange.coinbase.com/products/'+symbol.replace('USD','-USD')+'/candles':null,ingested_at:Date.now()};
      const writes=[db.prepare('INSERT OR IGNORE INTO flydesk_datasets VALUES (?,?,?,?,?,?)').bind(id,symbol,trustedSource?'coinbase_exchange_public':'admin-import','[]',JSON.stringify(manifest),Date.now())];
      for(let offset=0;offset<bars.length;offset+=1000)writes.push(db.prepare('INSERT OR IGNORE INTO flydesk_dataset_chunks VALUES (?,?,?)').bind(id,offset/1000,JSON.stringify(bars.slice(offset,offset+1000))));
      await db.batch(writes);return json({manifest},201);
    }
    const match=path.match(/^sessions(?:\/([^/]+)(?:\/(actions|review|analysis|export|abort))?)?$/);
    if(!match)return fail('NOT_FOUND',404);
    const [,id,sub]=match;
    if(!id) {
      if(request.method==='GET')return json({sessions:(await db.prepare('SELECT id,status,step,symbol,created_at,reward_points FROM flydesk_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(user.id).all()).results});
      if(request.method!=='POST')return fail('METHOD_NOT_ALLOWED',405);
      const active=await db.prepare("SELECT * FROM flydesk_sessions WHERE user_id=? AND status='ACTIVE'").bind(user.id).first();if(active)return json(await view(db,active));
      const symbol=canonicalSymbol(body.symbol||'BTCUSD');if(!['BTCUSD','ETHUSD'].includes(symbol))return fail('INVALID_SYMBOL');
      let bars,provenance,warmup=WARMUP;
      if(body.dataset_id) {
        const dataset=await db.prepare('SELECT * FROM flydesk_datasets WHERE id=? AND symbol=?').bind(body.dataset_id,symbol).first();if(!dataset)return fail('DATASET_NOT_FOUND',404);
        const chunks=(await db.prepare('SELECT bars_json FROM flydesk_dataset_chunks WHERE dataset_id=? ORDER BY chunk_index').bind(dataset.id).all()).results;
        const all=chunks.length?chunks.flatMap(c=>JSON.parse(c.bars_json)):JSON.parse(dataset.bars_json),manifest=JSON.parse(dataset.manifest_json),asOf=Number(body.as_of),index=all.findIndex(b=>b.time+60===asOf);
        if(index<WARMUP-1||index+STEPS*5>=all.length)return fail('INVALID_AS_OF');
        const start=Math.max(0,index-3599);bars=all.slice(start,index+1+STEPS*5);warmup=index+1-start;
        if(bars.at(-1).time>manifest.splits.train_end)return fail('RESERVED_HOLDOUT');
        provenance={provider:dataset.provider,synthetic:false,data_complete:true,dataset_version:dataset.id,availability_basis:'BAR_CLOSE_ASSUMPTION',training_verified:manifest.training_verified,source_kind:manifest.source_kind};
      } else if(env.FLYDESK_TEST_MODE==='local-only'&&env.FLYDESK_TEST_HISTORY) {
        bars=env.FLYDESK_TEST_HISTORY;provenance={provider:'fixture',synthetic:true,data_complete:true};
      } else {const source=await marketHistory(symbol,env,{minBars:120,limit:720});bars=source.bars;provenance={...marketSource(source),availability_basis:'BAR_CLOSE_ASSUMPTION',training_verified:true};}
      bars=validateHistory(bars);if(!body.dataset_id){bars=bars.slice(-Math.min(720,bars.length));warmup=bars.length-STEPS*5;}
      if(warmup<WARMUP)return fail('HISTORY_INCOMPLETE');
      const version=await db.prepare('SELECT version_id FROM flydesk_active_versions WHERE user_id=?').bind(user.id).first();
      const sessionId=crypto.randomUUID(),family=`${symbol}:${bars[warmup-1].time}:${RULES.version}`,data={bars,warmup,provenance,rules:RULES,model_version_id:version?.version_id??'market_only_spot_v2:default'},now=Date.now();
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO flydesk_sessions(id,user_id,status,created_at,symbol,scenario_family,data_json,state_json) VALUES (?,?,'ACTIVE',?,?,?,?,?)").bind(sessionId,user.id,now,symbol,family,JSON.stringify(data),JSON.stringify(initialState(bars[warmup-1].time))),
        db.prepare('INSERT OR IGNORE INTO flydesk_reservations SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM flydesk_sessions WHERE id=?)').bind(user.id,family,sessionId,sessionId),
        db.prepare('UPDATE flydesk_sessions SET reward_eligible=? WHERE id=? AND EXISTS(SELECT 1 FROM flydesk_reservations WHERE session_id=?)').bind(provenance.synthetic||provenance.training_verified===false?0:1,sessionId,sessionId)
      ]);
      return json(await view(db,await db.prepare("SELECT * FROM flydesk_sessions WHERE user_id=? AND status='ACTIVE'").bind(user.id).first()),201);
    }
    const get=()=>db.prepare('SELECT * FROM flydesk_sessions WHERE id=? AND user_id=?').bind(id,user.id).first();let row=await get();if(!row)return fail('NOT_FOUND',404);
    if(!sub&&request.method==='GET'){await resolvePending(db,row);return json(await view(db,await get()));}
    if(sub==='abort'&&request.method==='POST'){await resolvePending(db,row);await db.prepare("UPDATE flydesk_sessions SET status='ABORTED',completed_at=? WHERE id=? AND status='ACTIVE'").bind(Date.now(),id).run();return json(await view(db,await get()));}
    if(sub==='analysis'&&request.method==='POST') {
      if(row.status!=='ACTIVE')return fail('SESSION_CLOSED',409);const analysis=validateAnalysis(body);
      await db.prepare('INSERT INTO flydesk_analysis VALUES (?,1,?) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1,analysis_json=excluded.analysis_json').bind(id,JSON.stringify(analysis)).run();return json(await analysisView(db,id));
    }
    if(['review','export'].includes(sub)&&request.method==='GET') {
      if(row.status==='ACTIVE')return fail('SESSION_ACTIVE',409);
      const records=async table=>(await db.prepare(`SELECT record_json FROM ${table} WHERE session_id=? ORDER BY step`).bind(id).all()).results.map(r=>JSON.parse(r.record_json));
      const result={session:await view(db,row),demonstrations:await records('flydesk_demonstrations'),system_actions:await records('flydesk_system_actions'),equity_curve:JSON.parse(row.state_json).equity_curve};
      if(sub==='export')return new Response([JSON.stringify({type:'manifest',schema_version:2,rules:RULES,session:result.session}),...result.demonstrations.map(d=>JSON.stringify({type:'decision',...d})),...result.system_actions.map(d=>JSON.stringify({type:'system',...d}))].join('\n')+'\n',{headers:{'content-type':'application/x-ndjson','content-disposition':`attachment; filename="flydesk-${id}.jsonl"`,'cache-control':'no-store'}});
      result.demonstrations=result.demonstrations.map(d=>({...d,views:chartViews(d.visible_bars,d.observation.as_of)}));return json(result);
    }
    if(sub!=='actions'||request.method!=='POST')return fail('METHOD_NOT_ALLOWED',405);
    if(!Number.isInteger(body.step)||!['BUY','SELL','HOLD','SKIP'].includes(body.action)||typeof body.idempotency_key!=='string'||!body.idempotency_key.length||body.idempotency_key.length>100)return fail('INVALID_ACTION');
    const canonical=JSON.stringify({step:body.step,action:body.action}),prior=await db.prepare('SELECT * FROM flydesk_intents WHERE session_id=? AND idempotency_key=?').bind(id,body.idempotency_key).first();
    if(prior){if(prior.body_json!==canonical)return fail('IDEMPOTENCY_CONFLICT',409);await resolvePending(db,row);return json(await view(db,await get()));}
    if(row.status!=='ACTIVE'||row.step!==body.step)return fail('STALE_STEP',409);
    const data=JSON.parse(row.data_json),state=JSON.parse(row.state_json),visible=data.bars.slice(0,data.warmup+row.step*5),analysis=await analysisView(db,id),intent={...lockIntent(state.account,body.action,marketDecimal(visible.at(-1).close)),analysis:analysis.analysis,analysis_revision_id:`${id}:${analysis.revision}`};
    // Commit only the user's intent and their current analysis before reading the next open.
    const inserted=await db.prepare("INSERT OR IGNORE INTO flydesk_intents(session_id,step,idempotency_key,body_json,intent_json,accepted_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM flydesk_sessions WHERE id=? AND step=? AND status='ACTIVE')").bind(id,body.step,body.idempotency_key,canonical,JSON.stringify(intent),Date.now(),id,body.step).run();
    if(!inserted.meta.changes)return fail('STALE_STEP',409);
    await resolvePending(db,row);return json(await view(db,await get()));
  } catch(error) {const code=String(error.message);if(code.includes('INTERVAL_ALREADY_EXPOSED'))return fail('RESERVED_HOLDOUT',409);return fail(code,code.includes('UNAVAILABLE')?503:422);}
}
function validateHistory(bars) {
  if(!Array.isArray(bars)||bars.length<120||bars.length>100000)throw Error('HISTORY_INCOMPLETE');
  if(bars.some((b,i)=>!['time','open','high','low','close','volume'].every(k=>Number.isFinite(b[k]))||!Number.isInteger(b.time)||b.time%60||b.time+60>Date.now()/1000||b.low<=0||b.volume<0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close,b.low)||(i&&b.time-bars[i-1].time!==60)))throw Error('DATA_INVALID');
  return bars.map(({time,open,high,low,close,volume})=>({time,open,high,low,close,volume}));
}
async function analysisView(db,id){const r=await db.prepare('SELECT * FROM flydesk_analysis WHERE session_id=?').bind(id).first();return {revision:r?.revision||0,analysis:r?JSON.parse(r.analysis_json):validateAnalysis()};}
async function view(db,row){return sessionView(row,(await analysisView(db,row.id)).analysis);}
export async function resolvePending(db,row) {
  if(row.status!=='ACTIVE')return;
  const pending=await db.prepare("SELECT * FROM flydesk_intents WHERE session_id=? AND step=? AND status='PENDING'").bind(row.id,row.step).first();if(!pending)return;
  const {state,record,system}=await advance(row,pending),complete=row.step+1===STEPS,token=crypto.randomUUID(),now=Date.now();
  const statements=[
    db.prepare("UPDATE flydesk_sessions SET state_json=?,step=step+1,status=?,completed_at=?,action_token=? WHERE id=? AND step=? AND status='ACTIVE'").bind(JSON.stringify(state),complete?'COMPLETED':'ACTIVE',complete?now:null,token,row.id,row.step),
    db.prepare('INSERT INTO flydesk_demonstrations SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM flydesk_sessions WHERE id=? AND action_token=?)').bind(row.id,row.step,pending.idempotency_key,pending.body_json,JSON.stringify(record),row.id,token),
    db.prepare("UPDATE flydesk_intents SET status='RESOLVED' WHERE session_id=? AND step=? AND EXISTS(SELECT 1 FROM flydesk_sessions WHERE id=? AND action_token=?)").bind(row.id,row.step,row.id,token)
  ];
  if(system)statements.push(db.prepare('INSERT INTO flydesk_system_actions SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM flydesk_sessions WHERE id=? AND action_token=?)').bind(row.id,STEPS,JSON.stringify(system),row.id,token));
  if(complete&&row.reward_eligible&&units(state.account.cash)>units(RULES.initial_equity)&&state.max_drawdown<=.2) {
    const profit=units(state.account.cash)-units(RULES.initial_equity),denominator=units(RULES.initial_equity),points=Math.min(50,Number((1000n*profit+denominator-1n)/denominator)),day=Math.floor(now/86400000)*86400000;
    statements.push(db.prepare("INSERT OR IGNORE INTO raising_points SELECT ?,?,MIN(?,MAX(0,100-COALESCE((SELECT SUM(amount) FROM raising_points WHERE user_id=? AND kind='REWARD' AND created_at>=? AND created_at<?),0))),'REWARD',? WHERE EXISTS(SELECT 1 FROM flydesk_sessions WHERE id=? AND action_token=?) AND (SELECT COUNT(*) FROM flydesk_demonstrations WHERE session_id=? AND json_extract(record_json,'$.source')='HUMAN')>=8").bind(`flydesk:${row.id}`,row.user_id,points,row.user_id,day,day+86400000,now,row.id,token,row.id));
    statements.push(db.prepare('UPDATE flydesk_sessions SET reward_points=COALESCE((SELECT amount FROM raising_points WHERE id=?),0) WHERE id=? AND action_token=?').bind(`flydesk:${row.id}`,row.id,token));
  }
  await db.batch(statements);
}
