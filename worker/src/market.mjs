// Exact instruments only: USD is never silently relabelled USDT.
const instrument={BTCUSD:{kraken:'XBTUSD'},ETHUSD:{kraken:'ETHUSD'},BTCUSDT:{kraken:'XBTUSDT',okx:'BTC-USDT'},ETHUSDT:{kraken:'ETHUSDT',okx:'ETH-USDT'},AVAXUSDT:{kraken:'AVAXUSDT',okx:'AVAX-USDT'}};
export function canonicalSymbol(symbol='BTCUSD'){const s=String(symbol).toUpperCase();if(!Object.hasOwn(instrument,s))throw Error('INVALID_SYMBOL');return s;}
const parsers={
 kraken:d=>{if(Object.values(d?.result||{}).some(v=>Array.isArray(v)&&v.some(x=>!Array.isArray(x)||x.length<7)))throw Error('MARKET_INVALID');if(!Array.isArray(d?.error)||d.error.length)throw Error('PROVIDER_ERROR');return Object.entries(d.result||{}).find(([k,v])=>k!=='last'&&Array.isArray(v))?.[1]?.map(x=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[6]}));},
 okx:d=>d?.code==='0'&&Array.isArray(d.data)?d.data.filter(x=>x[8]==='1').map(x=>({time:+x[0]/1000,open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]})):null,
 binance:d=>Array.isArray(d)?d.map(x=>({time:+x[0]/1000,open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]})):null
};
export function validateBars(rows,{now=Date.now(),minBars=32,limit=720}={}){
 if(!Array.isArray(rows))throw Error('MARKET_INVALID');
 if(rows.some(x=>!x||![x.time,x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)||!Number.isInteger(x.time)||x.time<=0||x.time%60!==0||x.open<=0||x.close<=0||x.low<=0||x.high<Math.max(x.open,x.close,x.low)||x.low>Math.min(x.open,x.close)||x.volume<0))throw Error('MARKET_INVALID');
 const bars=rows.filter(x=>x.time+60<=now/1000).sort((a,b)=>a.time-b.time).slice(-limit);
 if(bars.length<minBars)throw Error('HISTORY_INCOMPLETE');
 if(bars.some((x,i)=>i>0&&x.time-bars[i-1].time!==60))throw Error('MARKET_GAP_OR_DUPLICATE');
 if(now/1000-(bars.at(-1).time+60)>90)throw Error('MARKET_STALE');
 return bars;
}
export async function fetchMarket(symbol='BTCUSD',env={},options={}){
 const wanted=canonicalSymbol(symbol),pair=instrument[wanted];
 const urls={kraken:`https://api.kraken.com/0/public/OHLC?pair=${pair.kraken}&interval=1`};
 if(pair.okx){urls.okx=`https://www.okx.com/api/v5/market/candles?instId=${pair.okx}&bar=1m&limit=300`;urls.binance=`https://api.binance.com/api/v3/klines?symbol=${wanted}&interval=1m&limit=720`;}
 const preferred=String(env.MARKET_PROVIDER||'kraken').toLowerCase();
 const order=[...new Set([preferred,...Object.keys(urls)])].filter(p=>urls[p]);
 const failures=[];
 for(const provider of order){try{
  const r=await (options.fetchImpl||fetch)(urls[provider],{signal:AbortSignal.timeout(6000),headers:{accept:'application/json'}});
  if(!r.ok)throw Error(`HTTP_${r.status}`);
  const bars=validateBars(parsers[provider](await r.json()),options);
  return {bars,provider,source:provider==='kraken'?'kraken-public':`${provider}-public`,symbol:wanted,synthetic:false,data_complete:true,attempted:failures};
 }catch(e){failures.push(`${provider}:${e.message}`);}}
 const e=Error('MARKET_UNAVAILABLE');e.causes=failures;throw e;
}
export async function marketHistory(symbol,env={},options={}){return fetchMarket(symbol,env,{...options,minBars:90});}
export function marketSource(x){return {provider:x.provider,source:x.source,symbol:x.symbol,synthetic:false,data_complete:x.data_complete,failover_attempts:x.attempted||[]};}
