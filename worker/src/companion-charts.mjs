import {hash} from './raising-core.mjs';

export const CHART_INTERVALS = new Map([[60,'1m'],[300,'5m'],[900,'15m'],[1800,'30m'],[3600,'1h'],[14400,'4h'],[86400,'1D'],[604800,'1W'],[2592000,'1M']]);
const cache = new Map();
const pending = new Map();
export function closeTime(time, interval) {
  if (interval !== 2592000) return time + interval;
  const d = new Date(time * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
}
export function chartBars(rows, interval, cutoff = Date.now()/1000) {
  if (!Array.isArray(rows) || rows.some(b => !b || ![b.time,b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite) || !Number.isSafeInteger(b.time) || b.time <= 0 || b.low <= 0 || b.high < Math.max(b.open,b.close,b.low) || b.low > Math.min(b.open,b.close) || b.volume < 0)) throw Error('CHART_DATA_INVALID');
  const sorted = rows.filter(b => closeTime(b.time,interval) <= cutoff).sort((a,b)=>a.time-b.time);
  if (sorted.some((b,i)=>i && b.time <= sorted[i-1].time)) throw Error('CHART_DATA_INVALID');
  if (sorted.length < 40) throw Error('CHART_HISTORY_INCOMPLETE');
  return sorted.slice(-40).map(b => ({...b,interval}));
}
async function requestBars(url, provider, interval, cutoff, fetchImpl) {
  const response = await fetchImpl(url,{signal:AbortSignal.timeout(8000),headers:{accept:'application/json'}});
  if (!response.ok) throw Error('CHART_PROVIDER_UNAVAILABLE');
  const data = await response.json();
  if (provider === 'kraken' && (!Array.isArray(data.error) || data.error.length)) throw Error('CHART_PROVIDER_UNAVAILABLE');
  const raw = provider === 'kraken' ? Object.entries(data.result || {}).find(([k,v])=>k!=='last'&&Array.isArray(v))?.[1] : data;
  if (!Array.isArray(raw)) throw Error('CHART_DATA_INVALID');
  const rows = raw.map(x => provider === 'kraken' ? {time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[6]} : {time:x[0]/1000,open:x[1],close:x[2],high:x[3],low:x[4],volume:x[5]});
  const candles = chartBars(rows,interval,cutoff),snapshot_hash=await hash(candles);
  return {symbol:'BTCUSD',source:provider+'-public',synthetic:false,interval,candles,snapshot_hash,observed_at:Math.floor(cutoff),gaps:candles.some((b,i)=>i && b.time>closeTime(candles[i-1].time,interval))};
}
export async function chartMarket(interval, {fetchImpl=fetch,now=Date.now()}={}) {
  if (!CHART_INTERVALS.has(interval)) throw Error('INVALID_CHART_INTERVAL');
  const key=String(interval),hit=cache.get(key);
  if (hit && now-hit.at<30000) return hit.value;
  if (pending.has(key)) return pending.get(key);
  const work=(async()=>{
    const provider=interval===2592000?'bitfinex':'kraken';
    const url=provider==='kraken'?`https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=${interval/60}`:'https://api-pub.bitfinex.com/v2/candles/trade:1M:tBTCUSD/hist?limit=42&sort=-1';
    const value=await requestBars(url,provider,interval,now/1000,fetchImpl);
    if (interval!==2592000 && now/1000-closeTime(value.candles.at(-1).time,interval)>Math.max(90,interval)) throw Error('CHART_DATA_STALE');
    cache.set(key,{at:now,value});return value;
  })();
  pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}
export async function historicalMarket({fetchImpl=fetch,now=Date.now(),random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296}={}) {
  // The server selects the cutoff. No future prices are requested or returned.
  const cutoff=Math.floor((now/1000-(7+Math.floor(random()*358))*86400-Math.floor(random()*1440)*60)/60)*60;
  return requestBars(`https://api-pub.bitfinex.com/v2/candles/trade:1m:tBTCUSD/hist?limit=45&sort=-1&end=${(cutoff-60)*1000}`,'bitfinex',60,cutoff,fetchImpl);
}
