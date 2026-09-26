// Exact fixed-point paper broker. Monetary and quantity units are 10^-8.
export const SCALE = 100000000n;
export const RULES = Object.freeze({version:'flydesk-spot-v1',execution_mode:'PAPER_ONLY',initial_equity:'10000.00000000',buy_max_debit:'1000.00000000',sell_reference_notional:'1000.00000000',fee_rate:'0.001',slippage_rate:'0.0005',decisions:12,interval_seconds:300});
export function units(value) {
  const s=String(value);
  if(!/^-?\d+(\.\d{1,8})?$/.test(s)) throw Error('INVALID_DECIMAL');
  const negative=s[0]==='-', [whole,fraction='']=s.replace('-','').split('.');
  return (negative?-1n:1n)*(BigInt(whole)*SCALE+BigInt(fraction.padEnd(8,'0')));
}
export const decimal = n => `${n<0n?'-':''}${(n<0n?-n:n)/SCALE}.${String((n<0n?-n:n)%SCALE).padStart(8,'0')}`;
const ceilDiv=(a,b)=>(a+b-1n)/b;
const min=(a,b)=>a<b?a:b;
// Market API numbers are normalized once at the adapter boundary.
export const marketDecimal = v => {if(!Number.isFinite(Number(v))||Number(v)<=0)throw Error('INVALID_PRICE');return Number(v).toFixed(8);};
export function portfolio() {return {cash:RULES.initial_equity,quantity:'0.00000000',cost_basis:'0.00000000',realized_pnl:'0.00000000',fees_paid:'0.00000000',revision:0};}
export function valueAccount(p,mark) {
  const price=units(mark),q=units(p.quantity),cost=units(p.cost_basis),market=q*price/SCALE;
  return {...p,side:q?'LONG':'FLAT',entry_price:decimal(q?cost*SCALE/q:0n),equity:decimal(units(p.cash)+market),unrealized_pnl:decimal(market-cost)};
}
export function actionMask(p,mark) {
  const available=[];
  if(units(p.cash)>=1000000n)available.push('BUY');
  if(units(p.quantity)*units(mark)/SCALE>=1000000n)available.push('SELL');
  return [...available,'HOLD'];
}
export function lockIntent(p,action,mark,{liquidate=false,budget=RULES.buy_max_debit}={}) {
  if(!['BUY','SELL','HOLD','SKIP','TIMEOUT'].includes(action))throw Error('INVALID_ACTION');
  if(['BUY','SELL'].includes(action)&&!liquidate&&!actionMask(p,mark).includes(action))throw Error('ACTION_UNAVAILABLE');
  const quantity=action==='SELL'?(liquidate?units(p.quantity):min(units(p.quantity),units(RULES.sell_reference_notional)*SCALE/units(mark))):0n;
  return {action,revision:p.revision,max_debit:decimal(min(units(budget),units(p.cash))),quantity:decimal(quantity),mark,liquidate};
}
export function fill(p,intent,quote,{feeRate=RULES.fee_rate,slippage=RULES.slippage_rate}={}) {
  if(p.revision!==intent.revision)throw Error('STALE_PORTFOLIO');
  if(!['BUY','SELL'].includes(intent.action))return {account:{...p,revision:p.revision+1},fill:null,fees:'0.00000000',execution_status:'NO_ORDER'};
  const buy=intent.action==='BUY',ref=units(buy?quote.ask:quote.bid),rate=units(feeRate),slip=units(slippage);
  if(ref<=0n||rate<0n||rate>=SCALE||slip<0n||slip>=SCALE)throw Error('INVALID_QUOTE');
  // Preserve 16-decimal execution price internally, rather than rounding to cents.
  const price=ref*(buy?SCALE+slip:SCALE-slip), priceScale=SCALE*SCALE;
  let q,notional,fee,cash=units(p.cash),quantity=units(p.quantity),cost=units(p.cost_basis),realized=units(p.realized_pnl);
  if(buy) {
    const budget=min(units(intent.max_debit),cash);
    q=budget*priceScale*SCALE/(price*(SCALE+rate));
    const amounts=()=>{notional=ceilDiv(q*price,priceScale);fee=ceilDiv(notional*rate,SCALE);};
    amounts(); while(q>0n&&notional+fee>budget){q--;amounts();}
    if(q<=0n||notional<1000000n)return {account:{...p,revision:p.revision+1},fill:null,fees:'0.00000000',execution_status:'REJECTED_MINIMUM'};
    cash-=notional+fee;quantity+=q;cost+=notional+fee;
  } else {
    q=units(intent.quantity);if(q<=0n||q>quantity)throw Error('INVALID_QUANTITY');
    notional=q*price/priceScale;fee=ceilDiv(notional*rate,SCALE);
    const removed=q===quantity?cost:cost*q/quantity;
    cash+=notional-fee;quantity-=q;cost-=removed;realized+=notional-fee-removed;
  }
  if(cash<0n||quantity<0n)throw Error('BROKER_INVARIANT');
  const account={cash:decimal(cash),quantity:decimal(quantity),cost_basis:decimal(cost),realized_pnl:decimal(realized),fees_paid:decimal(units(p.fees_paid)+fee),revision:p.revision+1};
  return {account,fill:{side:intent.action,quantity:decimal(q),price:`${price/priceScale}.${String(price%priceScale).padStart(16,'0')}`,notional:decimal(notional),fee:decimal(fee),time:quote.time,policy:quote.policy},fees:decimal(fee),execution_status:'FILLED'};
}
