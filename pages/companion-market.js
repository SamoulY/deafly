import {locale,translate} from './i18n.js?v=3';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const defaultChartSettings=()=>({style:'line',timeframe:60,average:false,volume:false,markers:true});
export function normalizeChartSettings(value={}){
  const defaults=defaultChartSettings();
  return {...defaults,style:['line','candles'].includes(value?.style)?value.style:defaults.style,timeframe:[60,300,900,1800,3600,14400,86400,604800,2592000].includes(value?.timeframe)?value.timeframe:60,...Object.fromEntries(['average','volume','markers'].map(key=>[key,typeof value?.[key]==='boolean'?value[key]:defaults[key]]))};
}
// Each displayed group retains its final *source* minute. Teaching always sends
// that timestamp to the server, never a bucket start or a fabricated five-minute bar.
export function groupCandles(bars,timeframe=60){
  const groups=[];
  bars.forEach((bar,index)=>{
    if(bar.interval===timeframe){groups.push({...bar,bucket:bar.time,sourceIndex:index,count:timeframe/60,startTime:bar.time});return;}
    const bucket=Math.floor(bar.time/timeframe)*timeframe,last=groups.at(-1);
    if(last?.bucket===bucket){last.high=Math.max(last.high,bar.high);last.low=Math.min(last.low,bar.low);last.close=bar.close;last.volume+=bar.volume||0;last.time=bar.time;last.sourceIndex=index;last.count++;}
    else groups.push({...bar,bucket,volume:bar.volume||0,sourceIndex:index,count:1,startTime:bar.time});
  });
  return groups;
}
export function movingAverage(bars,period=20){return bars.map((_,i)=>i+1<period?null:bars.slice(i+1-period,i+1).reduce((sum,b)=>sum+b.close,0)/period);}
export function chartSelection(clientX,bounds,bars,timeframe){
  const groups=groupCandles(bars,timeframe),right=bounds.width-(bounds.width>=500?70:8),left=10;
  const index=Math.max(0,Math.min(groups.length-1,Math.round((clientX-bounds.left-left)/(right-left)*Math.max(1,groups.length-1))));
  return Math.max(1,groups[index]?.sourceIndex??1);
}
export function marketChart(bars,settings,{width=360,height=160,selectedTime=null,lessons=[]}={}){
  if(bars.length<2)return '<div class="chart-empty">Chart data unavailable</div>';
  const groups=groupCandles(bars,settings.timeframe),desktop=width>=500,left=10,right=width-(desktop?70:8),top=18,bottom=height-(settings.volume?72:30);
  const prices=settings.style==='candles'?groups.flatMap(bar=>[bar.low,bar.high]):groups.map(bar=>bar.close);
  const min=Math.min(...prices),max=Math.max(...prices),pad=(max-min||Math.max(1,max*.01))*.12,low=min-pad,high=max+pad;
  const x=i=>left+i/Math.max(1,groups.length-1)*(right-left),y=value=>bottom-(value-low)/(high-low)*(bottom-top);
  const number=value=>new Intl.NumberFormat(locale(),{maximumFractionDigits:2}).format(value);
  const time=value=>settings.timeframe>=86400?new Date(value*1000).toLocaleDateString(locale(),{year:'2-digit',month:'short',day:'numeric',timeZone:'UTC'}):new Date(value*1000).toLocaleString(locale(),{...(settings.timeframe>=3600?{month:'short',day:'numeric'}:{}),hour:'2-digit',minute:'2-digit',hour12:false});
  const candleWidth=Math.max(2,Math.min(18,(right-left)/groups.length*.55));
  const chart=[];
  for(let tick=0;tick<4;tick++){const price=high-(high-low)*tick/3,at=y(price);chart.push(`<path class="chart-grid" d="M${left} ${at}H${right}"/>`);if(desktop)chart.push(`<text class="chart-axis" x="${right+10}" y="${at+4}">${escape(number(price))}</text>`);}
  if(settings.style==='line')chart.push(`<polyline class="price-line" points="${groups.map((bar,i)=>`${x(i)},${y(bar.close)}`).join(' ')}"/>`);
  else for(const [i,bar] of groups.entries()){
    const rising=bar.close>=bar.open,partial=bar.count<settings.timeframe/60;
    chart.push(`<g class="market-candle ${rising?'rising':'falling'} ${partial?'partial':''}" data-candle-time="${bar.time}"><title>${escape(time(bar.time))} · ${translate('Open')} ${number(bar.open)} · ${translate('High')} ${number(bar.high)} · ${translate('Low')} ${number(bar.low)} · ${translate('Close')} ${number(bar.close)}${partial?' · '+translate('Partial group')+' '+bar.count+'/5':''}</title><path d="M${x(i)} ${y(bar.high)}V${y(bar.low)}"/><rect x="${x(i)-candleWidth/2}" y="${Math.min(y(bar.open),y(bar.close))}" width="${candleWidth}" height="${Math.max(1,Math.abs(y(bar.open)-y(bar.close)))}"/></g>`);
  }
  if(settings.average){const average=movingAverage(groups);chart.push(`<polyline class="moving-average" points="${average.flatMap((value,i)=>value===null?[]:[`${x(i)},${y(value)}`]).join(' ')}"/>`);}
  if(settings.volume){const largest=Math.max(1,...groups.map(bar=>bar.volume));groups.forEach((bar,i)=>chart.push(`<rect class="volume-bar ${bar.close>=bar.open?'rising':'falling'}" x="${x(i)-candleWidth/2}" y="${height-26-bar.volume/largest*34}" width="${candleWidth}" height="${bar.volume/largest*34}"/>`));}
  chart.push(`<text class="chart-axis" x="${left}" y="${height-7}">${escape(time(groups[0].startTime))}</text><text class="chart-axis" x="${right}" y="${height-7}" text-anchor="end">${escape(time(groups.at(-1).time))}</text>`);
  if(settings.markers)for(const lesson of lessons){const at=lesson.context?.market?.candles?.at(-1)?.time,index=groups.findIndex(bar=>bar.startTime<=at&&bar.time>=at);if(index<0)continue;chart.push(`<circle class="lesson-marker marker-${escape(lesson.action)}" cx="${x(index)}" cy="${y(groups[index].close)}" r="4"><title>${escape(translate(({BUY:'Buy',SELL:'Sell',HOLD:'Wait'})[lesson.action]||'Wait'))} · ${escape(time(at))}</title></circle>`);}
  const selected=groups.findIndex(bar=>bar.startTime<=selectedTime&&bar.time>=selectedTime);
  if(selected>=0)chart.push(`<path class="chart-cursor" d="M${x(selected)} ${top}V${bottom}"/><circle class="selected-point" cx="${x(selected)}" cy="${y(groups[selected].close)}" r="5"/>`);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bitcoin closed prices. Teaching uses the latest point.">${chart.join('')}</svg>`;
}
