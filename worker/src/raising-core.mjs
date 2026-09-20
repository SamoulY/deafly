export const WARMUP=30, STEPS=12;
export const mask=a=>a.side==='FLAT'?['BUY','SELL','HOLD']:['HOLD','CLOSE'];
export async function hash(value) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export function initialState(time) {
  return {account:{cash:10000,side:'FLAT',quantity:0,entry_price:0,equity:10000,max_drawdown:0},peak:10000,equity_curve:[{time,equity:10000}]};
}
export function observation(bars,a) {
  const close=bars.at(-1).close,returns=bars.slice(-6).slice(1).map((b,i)=>b.close/bars.at(-6+i).close-1);
  return {version:'raising-v1',time:bars.at(-1).time,features:{return_1:close/bars.at(-2).close-1,return_5:close/bars.at(-6).close-1,volatility_5:Math.sqrt(returns.reduce((s,r)=>s+r*r,0)/5)},position:{side:a.side,quantity:a.quantity,entry_price:a.entry_price},cash:a.cash,equity:a.equity,action_mask:mask(a)};
}
function mark(state,bar) {
  const a=state.account;
  a.equity=a.cash+(a.side==='FLAT'?0:a.quantity*a.entry_price+(a.side==='LONG'?1:-1)*a.quantity*(bar.close-a.entry_price));
  state.peak=Math.max(state.peak,a.equity); a.max_drawdown=Math.max(a.max_drawdown,(state.peak-a.equity)/state.peak);
  state.equity_curve.push({time:bar.time,equity:a.equity});
}
function execute(a,action,price,time) {
  if(action==='HOLD') return {fill:null,fees:0};
  const buying=action==='BUY'||(action==='CLOSE'&&a.side==='SHORT'),fillPrice=price*(buying?1.0005:.9995);
  const quantity=action==='CLOSE'?a.quantity:Math.min(1000,Math.max(0,a.cash)/1.001)/fillPrice,fees=quantity*fillPrice*.001;
  const fill={time,price:fillPrice,quantity,side:buying?'BUY':'SELL'};
  if(action==='CLOSE') {a.cash+=quantity*a.entry_price+(a.side==='LONG'?1:-1)*quantity*(fillPrice-a.entry_price)-fees;a.side='FLAT';a.quantity=0;a.entry_price=0;}
  else {a.cash-=quantity*fillPrice+fees;a.side=action==='BUY'?'LONG':'SHORT';a.quantity=quantity;a.entry_price=fillPrice;}
  return {fill,fees};
}
export async function advance(row,action) {
  const data=JSON.parse(row.data_json),state=JSON.parse(row.state_json),visible=data.bars.slice(0,WARMUP+row.step*5),o=observation(visible,state.account),before=state.account.equity;
  const next=data.bars.slice(visible.length,visible.length+5),trade=execute(state.account,action,next[0].open,next[0].time);
  for(const bar of next) mark(state,bar);
  const record={session_id:row.id,step:row.step,observation:o,observation_hash:await hash(o),market_snapshot_hash:await hash(visible),visible_bars:visible,action_mask:o.action_mask,human_action:action,proposal:null,executed_action:action,source:'HUMAN',...trade,equity_before:before,equity_after:state.account.equity,reward:state.account.equity-before,eligible:data.provenance.synthetic===false&&data.provenance.data_complete===true,features:o.features,label:action,created_at:Date.now()};
  let system=null;
  if(row.step+1===STEPS&&state.account.side!=='FLAT') {
    const equity_before=state.account.equity,last=next.at(-1),settlement=execute(state.account,'CLOSE',last.close,last.time);
    mark(state,last);system={session_id:row.id,step:STEPS,source:'SYSTEM',executed_action:'CLOSE',reason:'FINAL_SETTLEMENT',eligible:false,...settlement,equity_before,equity_after:state.account.equity,created_at:Date.now()};
  }
  return {state,record,system};
}
export async function sessionView(row) {
  const data=JSON.parse(row.data_json),state=JSON.parse(row.state_json),bars=data.bars.slice(0,WARMUP+row.step*5),o=observation(bars,state.account);
  return {id:row.id,status:row.status,symbol:row.symbol,scenario_family:row.scenario_family,step:row.step,total_steps:STEPS,decision_interval_minutes:5,bars,observation:o,observation_hash:await hash(o),account:state.account,reward_points:row.reward_points,reward_eligible:!!row.reward_eligible,provenance:data.provenance,created_at:row.created_at,completed_at:row.completed_at};
}