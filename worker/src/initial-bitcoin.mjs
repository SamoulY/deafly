import {FEE_RATE,SLIPPAGE_RATE} from './core.mjs';

// A one-time paper opening balance, created atomically with the new identity.
export function initialBitcoin(market, now=Math.floor(Date.now()/1000)) {
  const bar=market?.candles?.at(-1),budget=10000;
  if(market?.symbol!=='BTCUSD'||!Number.isFinite(bar?.close)||!(bar.close>0)||!Number.isSafeInteger(bar.time)||bar.time+60>now||now-(bar.time+60)>90)throw Error('MARKET_STALE');
  const fillPrice=bar.close*(1+SLIPPAGE_RATE);
  const quantity=Math.floor(budget/(fillPrice*(1+FEE_RATE))*1e8)/1e8;
  if(!(quantity>0))throw Error('MARKET_INVALID');
  const fee=quantity*fillPrice*FEE_RATE,cash=Math.max(0,budget-quantity*fillPrice-fee);
  return {cash,quantity,avg_cost:fillPrice,revision:1,position_side:'LONG',position_qty:quantity,entry_price:fillPrice,take_profit:0,stop_loss:0,
    source:'INITIAL_ALLOCATION',initial_budget:budget,fee,fill_price:fillPrice,mark:bar.close,
    provenance:{source:market.source,snapshot_hash:market.snapshot_hash,candle_time:bar.time}};
}
