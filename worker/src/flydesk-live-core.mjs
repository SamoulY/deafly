import {portfolio,valueAccount,marketDecimal,lockIntent,fill,units,actionMask} from './flydesk-broker.mjs';
import {observation,hash} from './flydesk-core.mjs';
export function createLive(id,userId,now){return {id,user_id:userId,status:'WAITING',step:0,starts_at:Math.ceil(now/300000)*300000,account:portfolio(),records:[],system_actions:[],quote:null,heartbeat:0,peak:10000,max_drawdown:0,equity_curve:[],pending:null,snapshot:null,created_at:now,last_mark_minute:null};}
export function healthy(s,now){return s.quote&&now-s.quote.received_at<=3000&&now-s.heartbeat<=10000;}
export function receiveLive(s,message,now){
 if(message.product_id!=='BTC-USD')return;
 if(message.type==='heartbeat'){s.heartbeat=now;return;}
 if(message.type!=='ticker')return;
 const eventTime=Date.parse(message.time),ask=Number(message.best_ask),bid=Number(message.best_bid);
 if(!Number.isSafeInteger(message.sequence)||message.sequence<=(s.quote?.sequence??-1)||!Number.isFinite(eventTime)||Math.abs(now-eventTime)>3000||!Number.isFinite(ask)||!Number.isFinite(bid)||bid<=0||ask<bid)return;
 s.quote={ask:marketDecimal(ask),bid:marketDecimal(bid),time:eventTime,received_at:now,sequence:message.sequence};
 if(s.status==='ACTIVE'&&s.pending&&now>=s.pending.accepted_at+250&&now<=s.pending.accepted_at+5000&&message.sequence>s.pending.accepted_sequence&&healthy(s,now)){
   const result=fill(s.account,s.pending.intent,{...s.quote,policy:'POST_SUBMIT_QUOTE'});s.account=result.account;finishIntent(s,result,now);
 }
}
function finishIntent(s,result,now){const p=s.pending;s.records.push({...p,step:s.step,source:p.action==='TIMEOUT'?'TIMEOUT':p.action==='SKIP'?'SKIP':'HUMAN',human_action:['BUY','SELL','HOLD'].includes(p.action)?p.action:null,executed_action:result.fill?p.action:'NO_ORDER',fill:result.fill,fees:result.fees,execution_status:result.execution_status,executed_at:now,eligible:['BUY','SELL','HOLD'].includes(p.action)&&['FILLED','NO_ORDER'].includes(result.execution_status),account_after:{...s.account},equity_before:s.snapshot.observation.equity,equity_after:valueAccount(s.account,marketDecimal((Number(s.quote.ask)+Number(s.quote.bid))/2)).equity});s.pending=null;}
export function acceptLive(s,body,now){
 const canonical=JSON.stringify({step:body.step,action:body.action,analysis:body.analysis??null}),prior=[...s.records,...(s.pending?[s.pending]:[])].find(r=>r.idempotency_key===body.idempotency_key);
 if(prior){if(prior.body_json!==canonical)throw Error('IDEMPOTENCY_CONFLICT');return;}
 if(s.status!=='ACTIVE'||body.step!==s.step||now>=s.step_started_at+30000)throw Error('STEP_CLOSED');
 if(s.pending||s.records.some(r=>r.step===s.step))throw Error('ALREADY_COMMITTED');
 if(!healthy(s,now))throw Error('MARKET_STALE');
 if(!['BUY','SELL','HOLD','SKIP'].includes(body.action)||typeof body.idempotency_key!=='string'||!body.idempotency_key.length||body.idempotency_key.length>100)throw Error('INVALID_ACTION');
 const mark=s.snapshot.mark,intent=lockIntent(s.account,body.action,mark);
 s.pending={action:body.action,intent,idempotency_key:body.idempotency_key,body_json:canonical,accepted_at:now,accepted_sequence:s.quote.sequence,analysis:body.analysis??null,observation:s.snapshot.observation,observation_hash:s.snapshot.observation_hash,visible_bars:s.snapshot.bars};
 if(['HOLD','SKIP'].includes(body.action)){const r=fill(s.account,intent,{});s.account=r.account;finishIntent(s,r,now);}
}
export async function tickLive(s,now,bars){
 if(!['WAITING','ACTIVE'].includes(s.status))return;
 if(s.status==='WAITING'&&now<s.starts_at)return;
 if(!healthy(s,now)){if(s.status==='ACTIVE'){s.status='DATA_INVALID';s.error='MARKET_STALE_OR_DISCONNECTED';}return;}
 if(s.pending&&now>s.pending.accepted_at+5000)finishIntent(s,{fill:null,fees:'0.00000000',execution_status:'EXPIRED_NO_QUOTE'},now);
 if(s.status==='ACTIVE'){
   const minute=Math.floor(now/60000);
   if(s.last_mark_minute!==null&&minute>s.last_mark_minute+1){s.status='DATA_INVALID';s.error='MISSING_VALUATION_MINUTE';return;}
   if(minute!==s.last_mark_minute){const equity=Number(valueAccount(s.account,marketDecimal((Number(s.quote.ask)+Number(s.quote.bid))/2)).equity);s.peak=Math.max(s.peak,equity);s.max_drawdown=Math.max(s.max_drawdown,(s.peak-equity)/s.peak);s.equity_curve.push({time:now,equity});s.last_mark_minute=minute;}
   if(now>=s.step_started_at+30000&&!s.pending&&!s.records.some(r=>r.step===s.step)){s.pending={action:'TIMEOUT',intent:lockIntent(s.account,'TIMEOUT',marketDecimal(s.snapshot.bars.at(-1).close)),accepted_at:now,idempotency_key:`timeout:${s.step}`,observation:s.snapshot.observation,observation_hash:s.snapshot.observation_hash,visible_bars:s.snapshot.bars};const r=fill(s.account,s.pending.intent,{});s.account=r.account;finishIntent(s,r,now);}
   if(now<s.step_started_at+300000)return;
   if(now>=s.step_started_at+301000){s.status='DATA_INVALID';s.error='MISSED_DECISION_BOUNDARY';return;}
   s.step++;
   if(s.step===12){if(units(s.account.quantity)>0n){const r=fill(s.account,lockIntent(s.account,'SELL',s.quote.bid,{liquidate:true}),{...s.quote,policy:'FINAL_LIQUIDATION'});s.account=r.account;s.system_actions.push({source:'SYSTEM',executed_action:'SYSTEM_LIQUIDATION',...r,account:undefined});}s.status='COMPLETED';s.completed_at=now;return;}
 }
 if(!bars?.length||bars.at(-1).time+60>now/1000||now/1000-(bars.at(-1).time+60)>90){if(s.status==='ACTIVE'){s.status='DATA_INVALID';s.error='SNAPSHOT_UNAVAILABLE';}return;}
 const mark=marketDecimal((Number(s.quote.ask)+Number(s.quote.bid))/2),o={...observation(bars,s.account),equity:valueAccount(s.account,mark).equity,action_mask:actionMask(s.account,mark),valuation_policy:'SNAPSHOT_MID',mark};s.snapshot={bars,mark,observation:o,observation_hash:await hash(o)};s.step_started_at=Math.floor(now/300000)*300000;
 if(now>=s.step_started_at+5000){s.status='DATA_INVALID';s.error='MISSED_DECISION_BOUNDARY';return;}
 s.status='ACTIVE';s.last_mark_minute=Math.floor(now/60000);
}
