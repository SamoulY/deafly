import {marketChart} from './companion-market.js?v=4';
import {locale} from './i18n.js?v=4';
const money=v=>'USD '+new Intl.NumberFormat(locale(),{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
export function mountTraining(root,{api,onSaved,ownerKey}){
  root.innerHTML=`<p class="training-intro muted">Practice teaching with real historical prices. Only the 40 candles before the cutoff are shown. Your example trains the same fly; no trade is placed.</p><div class="training-layout"><section><div class="section-row"><h2>Bitcoin · 1 minute</h2><span class="small muted">40 candles</span></div><div id="trainingChart" class="line-chart"></div><p id="trainingCutoff" class="small muted"></p><dl id="trainingIndicators" class="training-indicators"></dl></section><section class="training-choice"><h2>What would you do now?</h2><p class="small muted">These are practice holdings for this scene, separate from your fly's account.</p><dl id="trainingHoldings"></dl><div class="teaching-choices">${['BUY','SELL','HOLD'].map((a,i)=>`<button data-training-action="${a}" aria-pressed="false" disabled>${['Buy','Sell','Wait'][i]}</button>`).join('')}</div><button id="saveTraining" class="primary full-width" disabled>Save example</button><p id="trainingStatus" class="small" role="status"></p><button id="nextTraining" class="full-width">New scenario</button><button class="menu-row" data-go="records">See what it learned <span>›</span></button></section></div>`;
  const $=s=>root.querySelector(s);let context=null,action=null,busy=false,submitted=false,key=null,readyOwner=null;
  const storageKey=()=>`defly.historical-pending:${ownerKey()}`;
  function persist(){sessionStorage.setItem(storageKey(),JSON.stringify({context,action,key,submitted}));}
  function render(){
    const bars=context?.market.candles||[],last=bars.at(-1),bounds=$('#trainingChart').getBoundingClientRect();
    $('#trainingChart').innerHTML=marketChart(bars,{style:'candles',timeframe:60,volume:true,average:true,markers:false},{width:Math.max(260,bounds.width),height:300,selectedTime:last?.time});
    $('#trainingCutoff').textContent=last?`${context.market.source} · ${new Date((last.time+60)*1000).toLocaleString(locale())}`:'Load a historical scene to begin.';
    const change=last?((last.close/bars[0].open-1)*100):0,volume=bars.reduce((n,b)=>n+b.volume,0),average=bars.slice(-20).reduce((n,b)=>n+b.close,0)/20;
    // Wilder's smoothing after the first 14 price changes.
    let gain=0,loss=0;
    for(let i=1;i<bars.length;i++){const delta=bars[i].close-bars[i-1].close;if(i<=14){gain+=Math.max(0,delta)/14;loss+=Math.max(0,-delta)/14;}else{gain=(gain*13+Math.max(0,delta))/14;loss=(loss*13+Math.max(0,-delta))/14;}}
    const rsi=gain+loss?100*gain/(gain+loss):50;
    $('#trainingIndicators').innerHTML=last?[['Last price',money(last.close)],['Change in this window',`${change>=0?'+':''}${change.toFixed(2)}%`],['Volume',`${volume.toFixed(2)} BTC`],['Moving average (20)',money(average)],['RSI (14)',rsi.toFixed(1)]].map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join(''):'';
    const p=context?.portfolio;$('#trainingHoldings').innerHTML=p?[['Available cash',money(p.cash)],['Bitcoin',`${p.position_qty.toFixed(6)} BTC`],['Entry price',p.entry_price?money(p.entry_price):'—']].map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join(''):'';
    root.querySelectorAll('[data-training-action]').forEach(b=>{b.disabled=!context||busy||submitted;b.setAttribute('aria-pressed',String(b.dataset.trainingAction===action));});
    $('#saveTraining').disabled=!context||!action||busy;$('#saveTraining').textContent=submitted?'Retry saving':'Save example';$('#nextTraining').disabled=busy||submitted;
  }
  async function next(){if(busy||submitted)return;busy=true;context=null;action=null;render();$('#trainingStatus').textContent='Loading historical prices…';try{context=await api('/api/companion/training',{method:'POST',body:{}});key=crypto.randomUUID();$('#trainingStatus').textContent=context.market.gaps?'Some minutes had no trades; the chart shows 40 actual candles.':'';persist();}catch{$('#trainingStatus').textContent='Historical prices unavailable. Try another scene shortly.';}finally{busy=false;render();}}
  root.querySelectorAll('[data-training-action]').forEach(b=>b.onclick=()=>{action=b.dataset.trainingAction;persist();render();});
  $('#saveTraining').onclick=async()=>{if(busy||!action||!context)return;busy=true;submitted=true;persist();render();try{const result=await api('/api/companion/lessons',{method:'POST',body:{action,context_id:context.id,idempotency_key:key}});sessionStorage.removeItem(storageKey());submitted=false;context=null;action=null;$('#trainingStatus').textContent=result.training_applied?'Example learned. Your fly will consider it in future decisions.':'Example saved. Learning is pending and will retry automatically.';await onSaved();}catch(e){if(['CONTEXT_EXPIRED','CONTEXT_NOT_FOUND','CONTEXT_ALREADY_TAUGHT','IDEMPOTENCY_CONFLICT'].includes(e.code)){submitted=false;context=null;action=null;sessionStorage.removeItem(storageKey());$('#trainingStatus').textContent='This example expired. Load a new scene.';}else $('#trainingStatus').textContent='Save not confirmed. Retry the same example; it will only be recorded once.';}finally{busy=false;render();}};
  $('#nextTraining').onclick=next;
  new ResizeObserver(render).observe($('#trainingChart'));document.addEventListener('defly-language-change',render);
  return {async open(){if(readyOwner!==ownerKey()){readyOwner=ownerKey();context=null;action=null;submitted=false;try{const saved=JSON.parse(sessionStorage.getItem(storageKey())||'null');if(saved){({context,action,key,submitted}=saved);}}catch{/* Optional recovery. */}}if(!context)await next();else render();}};
}
