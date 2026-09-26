import {RULES,portfolio,valueAccount,lockIntent,fill,actionMask,marketDecimal,units,decimal} from './flydesk-broker.mjs';
import {chartViews} from './flydesk-indicators.mjs';
import {hash} from './raising-core.mjs';
export {hash};
export const WARMUP=60,STEPS=12;
export function initialState(time) {return {account:portfolio(),peak:RULES.initial_equity,max_drawdown:0,equity_curve:[{time,equity:RULES.initial_equity}]};}
export function mark(state,bar) {
  const a=valueAccount(state.account,marketDecimal(bar.close)),equity=units(a.equity),peak=units(state.peak);
  if(equity>peak)state.peak=a.equity;
  state.max_drawdown=Math.max(state.max_drawdown,Number(units(state.peak)-equity)/Number(units(state.peak)));
  state.equity_curve.push({time:bar.time,equity:a.equity});return a;
}
export function observation(bars,p) {
  const account=valueAccount(p,marketDecimal(bars.at(-1).close));
  return {version:RULES.version,time:bars.at(-1).time,as_of:bars.at(-1).time+60,cash:account.cash,equity:account.equity,position:{side:account.side,quantity:account.quantity,entry_price:account.entry_price},action_mask:actionMask(p,marketDecimal(bars.at(-1).close))};
}
export async function advance(row,pending) {
  const data=JSON.parse(row.data_json),state=JSON.parse(row.state_json),end=data.warmup+row.step*5,visible=data.bars.slice(0,end),next=data.bars.slice(end,end+5),o=observation(visible,state.account);
  if(next.length!==5)throw Error('HISTORY_INCOMPLETE');
  const locked=JSON.parse(pending.intent_json),action=locked.action,quote={ask:marketDecimal(next[0].open),bid:marketDecimal(next[0].open),time:next[0].time,policy:'NEXT_BAR_OPEN'},trade=fill(state.account,locked,quote);
  state.account=trade.account;for(const b of next)mark(state,b);
  const record={schema_version:2,session_id:row.id,step:row.step,rules_version:RULES.version,observation:o,observation_hash:await hash(o),market_snapshot_hash:await hash(visible),visible_bars:visible,action_mask:o.action_mask,human_action:['BUY','SELL','HOLD'].includes(action)?action:null,proposal:null,executed_action:trade.fill?action:'NO_ORDER',source:action==='SKIP'?'SKIP':action==='TIMEOUT'?'TIMEOUT':'HUMAN',...trade,account:undefined,equity_before:o.equity,equity_after:valueAccount(state.account,marketDecimal(next.at(-1).close)).equity,eligible:!data.provenance.synthetic&&trade.execution_status!=='REJECTED_MINIMUM'&&['BUY','SELL','HOLD'].includes(action),label:['BUY','SELL','HOLD'].includes(action)?action:null,analysis_revision_id:locked.analysis_revision_id,analysis:locked.analysis,accepted_at:pending.accepted_at,created_at:Date.now(),model_version_id:data.model_version_id??null,consent_scope:'PERSONAL_ONLY'};
  record.reward=decimal(units(record.equity_after)-units(record.equity_before));
  let system=null;
  if(row.step+1===STEPS&&units(state.account.quantity)>0n) {
    const last=next.at(-1),intent=lockIntent(state.account,'SELL',marketDecimal(last.close),{liquidate:true}),settlement=fill(state.account,intent,{ask:marketDecimal(last.close),bid:marketDecimal(last.close),time:last.time,policy:'FINAL_LIQUIDATION'});
    state.account=settlement.account;mark(state,last);system={session_id:row.id,step:STEPS,source:'SYSTEM',executed_action:'SYSTEM_LIQUIDATION',eligible:false,...settlement,account:undefined,created_at:Date.now()};
  }
  return {state,record,system};
}
export async function sessionView(row,analysis={timeframe:60,drawings:[]}) {
  const data=JSON.parse(row.data_json),state=JSON.parse(row.state_json),bars=data.bars.slice(0,data.warmup+row.step*5),o=observation(bars,state.account);
  return {id:row.id,status:row.status,symbol:row.symbol,rules_version:RULES.version,rules:RULES,market_mode:'HISTORICAL',scenario_family:row.scenario_family,step:row.step,total_steps:STEPS,decision_interval_minutes:5,as_of:o.as_of,bars,views:chartViews(bars,o.as_of),analysis,observation:o,observation_hash:await hash(o),account:{...valueAccount(state.account,marketDecimal(bars.at(-1).close)),max_drawdown:state.max_drawdown},reward_points:row.reward_points,reward_eligible:!!row.reward_eligible,provenance:data.provenance,created_at:row.created_at,completed_at:row.completed_at};
}
