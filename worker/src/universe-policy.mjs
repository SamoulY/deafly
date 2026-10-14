// A small server-owned policy, not a replacement for any personal WASM brain.
import {teachingFeatures} from './companion-learning.mjs';
export const RULES = Object.freeze({version:'universe-spot-v1',initial_usd:10000,initial_holding:'BTC',fee:0.001,slippage:0.0005,interval:300,duration:86400,submission_seconds:120,minimum_coverage:1,symbol:'BTCUSD',execution:'next-minute-open-after-deadline',positions:'spot-only-all-in-or-cash'});
export const ACTIONS=['BUY','SELL','HOLD'];
const clip=(n,l=2)=>Math.max(-l,Math.min(l,n));
export const equity=(s,p)=>s.cash+s.quantity*p;
export function mark(s,price){const value=equity(s,price),peak=Math.max(s.peak,value);return {...s,equity:value,peak,drawdown:Math.max(s.drawdown,peak>0?(peak-value)/peak:0)};}
export function initialAccount(price,rules=RULES){return {cash:0,quantity:rules.initial_usd/price,entry_price:price,equity:rules.initial_usd,peak:rules.initial_usd,drawdown:0,fees:0};}
export function trade(s,direction,price,rules=RULES){
 if(!ACTIONS.includes(direction)||!Number.isFinite(price)||price<=0)throw Error('UNIVERSE_INVALID_TRADE');
 let next={...s},fee=0,fill=price,action='HOLD';
 if(direction==='BUY'&&s.cash>0.01){fill=price*(1+rules.slippage);const q=s.cash/(fill*(1+rules.fee));fee=q*fill*rules.fee;next={...s,cash:0,quantity:s.quantity+q,entry_price:fill};action='BUY';}
 if(direction==='SELL'&&s.quantity>0){fill=price*(1-rules.slippage);fee=s.quantity*fill*rules.fee;next={...s,cash:s.cash+s.quantity*fill-fee,quantity:0,entry_price:0};action='SELL';}
 next.fees+=fee;return {next:mark(next,price),fee,fill,action};
}
export function inputs(snapshot,s){return teachingFeatures({candles:snapshot.bars},{cash:s.cash,position_side:s.quantity>0?'LONG':'FLAT',position_qty:s.quantity,entry_price:s.entry_price});}
export const initialServerModel=()=>({backend:'universe-distillation-v1',version:0,weights:ACTIONS.map(()=>Array(7).fill(0)),bias:[0,0,0],samples:0});
function probabilities(model,x){const logits=model.weights.map((w,a)=>w.reduce((sum,v,i)=>sum+v*x[i],model.bias[a])),m=Math.max(...logits),exp=logits.map(v=>Math.exp(v-m)),total=exp.reduce((a,b)=>a+b,0);return exp.map(v=>v/total);}
export function serverDecision(model,x){if(!model.samples)return 'HOLD';const p=probabilities(model,x),best=Math.max(...p);return p[2]===best||Math.abs(p[0]-p[1])<1e-9?'HOLD':p[0]>p[1]?'BUY':'SELL';}
// Distil only consented decisions whose next unseen mark beats doing nothing,
// after actual execution costs. Losing demonstrations teach waiting instead.
// Each task / identical checkpoint+teaching-head cluster has bounded weight.
export function learnCompletedRound(base,examples){
 const model=structuredClone(base),groups=new Map();let loss=0;
 for(const e of examples){const key=e.task_id+'|'+e.policy_hash;groups.set(key,(groups.get(key)||0)+1);}
 const clusters=new Map();for(const key of groups.keys()){const task=key.split('|')[0];clusters.set(task,(clusters.get(task)||0)+1);}
 for(const e of examples){
  if(!Number.isFinite(e.future_price)||!(e.future_price>0)||!e.features?.every(Number.isFinite)||e.features.length!==7)throw Error('UNIVERSE_TRAINING_SAMPLE_INVALID');
  const advantage=(equity(e.after,e.future_price)-equity(e.before,e.future_price))/RULES.initial_usd;
  const label=ACTIONS.indexOf(advantage>0?e.action:'HOLD');if(label<0)throw Error('UNIVERSE_TRAINING_ACTION_INVALID');
  const p=probabilities(model,e.features),weight=1/(groups.get(e.task_id+'|'+e.policy_hash)*clusters.get(e.task_id));
  const rate=0.08*weight;
  for(let a=0;a<3;a++){const error=(a===label?1:0)-p[a];model.weights[a]=model.weights[a].map((w,i)=>clip(w*(1-0.0001*weight)+rate*error*e.features[i]));model.bias[a]=clip(model.bias[a]+rate*error);}
  loss-=Math.log(Math.max(1e-9,p[label]));model.samples++;
 }
 if(examples.length)model.version++;
 return {model,loss:examples.length?loss/examples.length:0};
}
export function validDecoder(d){return !!d&&['left_hz','right_hz','difference_hz'].every(k=>Number.isFinite(d[k])&&Math.abs(d[k])<1e7)&&d.left_hz>=0&&d.right_hz>=0&&Number.isSafeInteger(d.gate_spikes)&&d.gate_spikes>=0&&Math.abs(d.difference_hz-(d.right_hz-d.left_hz))<1e-6&&d.proposed_action===(!d.gate_spikes||Math.abs(d.difference_hz)<5?'HOLD':d.difference_hz>0?'BUY':'SELL');}
