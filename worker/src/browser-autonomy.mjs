import { accountEquity, FEE_RATE, SLIPPAGE_RATE } from './core.mjs';
import { rewardFromEquity } from './learning.mjs';
export const BROWSER_BACKEND = 'stonkfly-full-browser-wasm-v1';
export const PINNED_MANIFEST = '7f7c3bda9418c04d2e86cc7245b3569c7b63c772459f28b77ee328b192a86340';
const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-session-token,idempotency-key','access-control-allow-methods':'GET,POST,OPTIONS'};
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...CORS,'cache-control':'no-store'}});
const now=()=>Math.floor(Date.now()/1000);
export async function browserRun(e,uid) {
 return e.DB.prepare("SELECT r.*,b.backend,b.manifest_hash FROM autonomous_runs r JOIN browser_autonomy_runs b ON b.run_id=r.id WHERE r.user_id=? AND r.status='RUNNING' ORDER BY r.created_at DESC LIMIT 1").bind(uid).first();
}
export async function prepareBrowser(e,u,observe) {
 const run=await browserRun(e,u.id);
 if(!run)return json({error:'BROWSER_AUTONOMY_NOT_RUNNING'},409);
 const observation=await observe();
 const last=observation.candles.at(-1),t=now();
 if(!last || last.time>t+60 || t-last.time>120 || !(last.close>0))return json({error:'MARKET_STALE'},503);
 const p=await e.DB.prepare('SELECT * FROM portfolios WHERE user_id=?').bind(u.id).first();
 const challenge={id:crypto.randomUUID(),run_id:run.id,snapshot_hash:observation.snapshot_hash,observed_at:observation.observed_at,expires_at:t+120,portfolio_revision:p.revision,symbol:'BTCUSD',source:observation.source,manifest_hash:PINNED_MANIFEST,encoder:'market-close-rgb-v1',decoder_threshold_hz:5};
 await e.DB.prepare('INSERT INTO browser_autonomy_challenges(id,user_id,run_id,snapshot_hash,source,observed_at,expires_at,portfolio_revision) VALUES(?,?,?,?,?,?,?,?)').bind(challenge.id,u.id,run.id,challenge.snapshot_hash,challenge.source,challenge.observed_at,challenge.expires_at,p.revision).run();
 return json({run_id:run.id,backend:BROWSER_BACKEND,observation,challenge,challenge_id:challenge.id,portfolio:p});
}
export function validateBrowserProposal(n,c,p) {
 if(!n || n.backend!==BROWSER_BACKEND || n.manifest_hash!==PINNED_MANIFEST)return 'BROWSER_MODEL_MISMATCH';
 for(const k of ['checkpoint_hash','memory_hash','frame_hash','snapshot_hash'])if(!/^[a-f0-9]{64}$/.test(n[k]||''))return 'INVALID_'+k.toUpperCase();
 if(n.model_hash!==undefined && n.model_hash!==PINNED_MANIFEST)return 'BROWSER_MODEL_MISMATCH';
 if(n.snapshot_hash!==c.snapshot_hash || (n.run_id!==undefined && n.run_id!==c.run_id))return 'BROWSER_SNAPSHOT_MISMATCH';
 if(n.symbol!=='BTCUSD' || !['kraken-public','okx-public','binance-public'].includes(n.source) || n.source!==c.source)return 'BROWSER_MARKET_MISMATCH';
 // Observation timestamps use seconds on the API; browser telemetry may use milliseconds.
 if(n.observed_at!==c.observed_at && n.observed_at!==c.observed_at*1000)return 'BROWSER_OBSERVATION_MISMATCH';
 const d=n.decoder;
 if(!d || !['left_hz','right_hz','difference_hz'].every(k=>Number.isFinite(d[k])) || d.left_hz<0 || d.right_hz<0 || !Number.isSafeInteger(d.gate_spikes) || d.gate_spikes<0 || Math.abs(d.difference_hz-(d.right_hz-d.left_hz))>1e-6 || (d.threshold_hz!==undefined && d.threshold_hz!==5))return 'BROWSER_DECODER_INVALID';
 const directional=!d.gate_spikes || Math.abs(d.difference_hz)<5?'HOLD':d.difference_hz>0?'BUY':'SELL';
 if(d.proposed_action!==directional)return 'BROWSER_DECODER_MISMATCH';
 const side=p.position_side||'FLAT';
 const action=directional==='HOLD'?'HOLD':side==='FLAT'?directional:((side==='LONG' && directional==='SELL')||(side==='SHORT' && directional==='BUY'))?'CLOSE':'HOLD';
 if(n.proposed_action!==action)return 'BROWSER_ACTION_MISMATCH';
 return null;
}
export function browserFill(p,action,mark) {
 if(!(mark>0) || !Number.isFinite(mark))throw Error('MARKET_INVALID');
 const next={...p,revision:p.revision+1}; let fee=0,fillPrice=mark;
 const side=p.position_side||'FLAT';
 if((action==='BUY'||action==='SELL') && side==='FLAT') {
  fillPrice=mark*(1+(action==='BUY'?1:-1)*SLIPPAGE_RATE);
  const q=Math.floor(Math.min(1000,p.cash)/(fillPrice*(1+FEE_RATE))*1e8)/1e8;
  if(!(q>0))throw Error('INSUFFICIENT_PAPER_CASH');
  fee=q*fillPrice*FEE_RATE;
  Object.assign(next,{cash:p.cash-q*fillPrice-fee,quantity:action==='BUY'?q:0,avg_cost:action==='BUY'?fillPrice:0,position_side:action==='BUY'?'LONG':'SHORT',position_qty:q,entry_price:fillPrice,take_profit:0,stop_loss:0});
 } else if(action==='CLOSE' && side!=='FLAT') {
  fillPrice=mark*(1+(side==='LONG'?-1:1)*SLIPPAGE_RATE);
  const q=Number(p.position_qty),entry=Number(p.entry_price);
  fee=q*fillPrice*FEE_RATE;
  const pnl=q*(side==='LONG'?fillPrice-entry:entry-fillPrice);
  if(Number(p.cash)+q*entry+pnl-fee<0)throw Error('PAPER_BANKRUPTCY_SETTLEMENT_REQUIRED');
  Object.assign(next,{cash:Number(p.cash)+q*entry+pnl-fee,quantity:0,avg_cost:0,position_side:'FLAT',position_qty:0,entry_price:0,take_profit:0,stop_loss:0});
 } else if(action!=='HOLD')throw Error('ACTION_NOT_ALLOWED');
 return {next,fee,fillPrice};
}
export async function stepBrowser(e,u,b,observe) {
 const receipt=await e.DB.prepare('SELECT response_json FROM browser_autonomy_receipts WHERE challenge_id=? AND user_id=?').bind(b.challenge_id||'',u.id).first();
 if(receipt)return json({...JSON.parse(receipt.response_json),replayed:true});
 const run=await browserRun(e,u.id);
 if(!run)return json({error:'BROWSER_AUTONOMY_NOT_RUNNING'},409);
 const c=await e.DB.prepare('SELECT * FROM browser_autonomy_challenges WHERE id=? AND user_id=? AND run_id=?').bind(b.challenge_id||'',u.id,run.id).first();
 if(!c || c.consumed || c.expires_at<now())return json({error:'BROWSER_CHALLENGE_INVALID_OR_CONSUMED'},409);
 const p=await e.DB.prepare('SELECT * FROM portfolios WHERE user_id=?').bind(u.id).first();
 if(p.revision!==c.portfolio_revision)return json({error:'BROWSER_PORTFOLIO_CHANGED'},409);
 const error=validateBrowserProposal(b.neural,c,p);
 if(error)return json({error},422);
 const obs=await observe(),last=obs.candles.at(-1);
 if(!last || last.time>now()+60 || now()-last.time>120 || !(last.close>0))return json({error:'MARKET_STALE'},503);
 const price=last.close,n=b.neural,action=n.proposed_action;
 const {next,fee,fillPrice}=browserFill(p,action,price),did=crypto.randomUUID();
 const before=Number(run.last_equity),after=accountEquity(next,price),reward=rewardFromEquity(before,after);
 const provenance={backend:BROWSER_BACKEND,execution_trust:'browser_asserted_untrusted',server_verified_kernel:false,cryptographic_attestation:false,manifest_hash:n.manifest_hash,checkpoint_hash:n.checkpoint_hash,memory_hash:n.memory_hash,snapshot_hash:c.snapshot_hash,frame_hash:n.frame_hash,frame_hash_trust:'browser_asserted',encoder:'market-close-rgb-v1',challenge_id:c.id,decoder:{left_hz:n.decoder.left_hz,right_hz:n.decoder.right_hz,difference_hz:n.decoder.difference_hz,gate_spikes:n.decoder.gate_spikes,threshold_hz:5,proposed_action:n.decoder.proposed_action},proposed_action:action,market_source:c.source,market_symbol:'BTCUSD',execution_snapshot_hash:obs.snapshot_hash};
 const response={run_id:run.id,status:'RUNNING',backend:BROWSER_BACKEND,step:run.step_count+1,proposal:{action},proposed_action:action,executed_action:action,decision_id:did,portfolio:next,market_price:price,fill_price:fillPrice,fee,inactivity_escalation:false,reward:{value:reward,kind:reward>0?'REWARD':reward<0?'PUNISHMENT':null,equity_before:before,equity_after:after,authority:'server_marked_equity',window:'previous_post_execution_equity_to_current_post_execution_including_fees',source_decision_id:run.last_decision_id},learning:{version:null,policy_hash:n.memory_hash,updates:null,reward_total:null,corrections:null,execution_steps:run.step_count+1},provenance,paper_only:true};
 try {
  await e.DB.batch([
   e.DB.prepare('INSERT INTO browser_autonomy_receipts VALUES(?,?,?,?,?,?)').bind(c.id,did,u.id,run.id,now(),JSON.stringify(response)),
   e.DB.prepare('INSERT INTO decisions VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(did,u.id,'TRADE',action,'BTCUSD',null,price,fee,JSON.stringify({...next,source:'BROWSER_NEURAL',provenance}),`browser_${c.id}`,now()),
   e.DB.prepare('UPDATE portfolios SET cash=?,quantity=?,avg_cost=?,revision=revision+1,position_side=?,position_qty=?,entry_price=?,take_profit=?,stop_loss=? WHERE user_id=? AND revision=?').bind(next.cash,next.quantity,next.avg_cost,next.position_side,next.position_qty,next.entry_price,0,0,u.id,p.revision),
   e.DB.prepare('UPDATE autonomous_runs SET step_count=step_count+1,last_equity=?,last_action=?,last_decision_id=?,updated_at=? WHERE id=?').bind(after,action,did,now(),run.id)
  ]);
 } catch(x) {
  if(/BROWSER_CHALLENGE_CONFLICT|UNIQUE constraint/.test(x.message))return json({error:'BROWSER_CHALLENGE_CONFLICT'},409);
  throw x;
 }
 return json(response);
}
