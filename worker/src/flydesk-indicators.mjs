export const INDICATOR_VERSION='sma-seeded-ema-wilder-v1';
export function sma(values,n) {let sum=0;return values.map((v,i)=>{sum+=v;if(i>=n)sum-=values[i-n];return i>=n-1?sum/n:null;});}
export function ema(values,n) {let seed=[],last=null;return values.map(v=>{if(v===null)return null;if(last===null){seed.push(v);if(seed.length<n)return null;last=seed.reduce((a,b)=>a+b,0)/n;}else last+=2/(n+1)*(v-last);return last;});}
export function rsi(values,n=14) {let gain=0,loss=0;return values.map((v,i)=>{if(!i)return null;const d=v-values[i-1],g=Math.max(0,d),l=Math.max(0,-d);if(i<=n){gain+=g/n;loss+=l/n;}else{gain=(gain*(n-1)+g)/n;loss=(loss*(n-1)+l)/n;}return i<n?null:!gain&&!loss?50:!loss?100:100-100/(1+gain/loss);});}
export function aggregate(bars,seconds,asOf) {
  if(![60,300,3600].includes(seconds))throw Error('INVALID_TIMEFRAME');
  const grouped=new Map();
  for(const b of bars){if(b.time+60>asOf)continue;const time=Math.floor(b.time/seconds)*seconds;let a=grouped.get(time);if(!a){a={time,open:b.open,high:b.high,low:b.low,close:b.close,volume:0,count:0};grouped.set(time,a);}a.high=Math.max(a.high,b.high);a.low=Math.min(a.low,b.low);a.close=b.close;a.volume+=b.volume;a.count++;}
  return [...grouped.values()].map(({count,...b})=>({...b,is_partial:b.time+seconds>asOf||count<seconds/60}));
}
export function indicators(bars) {
  const c=bars.map(b=>b.close),v=bars.map(b=>b.volume),fast=ema(c,12),slow=ema(c,26),macd=c.map((_,i)=>fast[i]===null||slow[i]===null?null:fast[i]-slow[i]),signal=ema(macd,9);
  return {version:INDICATOR_VERSION,sma20:sma(c,20),sma50:sma(c,50),rsi14:rsi(c),macd,signal,histogram:macd.map((v,i)=>v===null||signal[i]===null?null:v-signal[i]),volume_sma20:sma(v,20)};
}
export function chartViews(bars,asOf) {return Object.fromEntries([60,300,3600].map(s=>{const view=aggregate(bars,s,asOf);return [s,{bars:view,indicators:indicators(view)}];}));}
export function validateAnalysis(input={}) {
  const timeframe=input.timeframe??60;
  if(![60,300,3600].includes(timeframe)||!Array.isArray(input.drawings??[])||(input.drawings??[]).length>100)throw Error('INVALID_ANALYSIS');
  const drawings=(input.drawings??[]).map(d=>{
    if(!['horizontal_line','trend_line','rectangle'].includes(d.tool)||typeof d.id!=='string'||d.id.length>100||!Array.isArray(d.anchors)||d.anchors.length!==(d.tool==='horizontal_line'?1:2))throw Error('INVALID_DRAWING');
    return {id:d.id,tool:d.tool,anchors:d.anchors.map(a=>{if(!Number.isFinite(a.time)||!Number.isFinite(a.price)||a.price<=0)throw Error('INVALID_ANCHOR');return {time:a.time,price:a.price,projection:!!a.projection};})};
  });
  return {timeframe,drawings,indicator_version:INDICATOR_VERSION,indicators:['sma20','sma50','rsi14','macd']};
}
