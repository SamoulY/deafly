import {locale,translate as t} from './i18n.js?v=5';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=v=>Number.isFinite(v)?new Intl.NumberFormat(locale(),{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:'exceptZero'}).format(v):'—';
const date=v=>new Date(v*1000).toLocaleString(locale(),{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const states={QUEUED:'Registered',EVALUATING:'Evaluating',RANKED:'Complete',INCOMPLETE:'Incomplete data',PENDING:'Upcoming',RUNNING:'In progress',COMPLETE:'Complete'};
export async function mountUniverseUI(root,client,{beforeStart=async()=>{},onRunning=()=>{}}={}){
 let disposed=false,running=false,busy=false,timer=null,refreshTimer=null,generation=0,selected='',data=null;
 root.innerHTML=`<div class="universe-intro"><p>Your fly stays yours. Shared experience trains the official fly.</p><label>Evaluation period <select id="universePeriod" aria-label="Evaluation period"></select></label></div>
 <p id="universeService" class="small muted" role="status"></p>
 <div class="universe-layout"><section class="universe-official"><div class="section-row"><h2>Official fly</h2><span id="universeLearning" class="universe-pill"></span></div><div class="universe-symbol" aria-hidden="true"><svg viewBox="0 0 160 90" width="160" height="90"><g fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="62" cy="35" rx="21" ry="12" transform="rotate(35 62 35)"/><ellipse cx="98" cy="35" rx="21" ry="12" transform="rotate(-35 98 35)"/><path d="M70 49 46 56 40 69M90 49 114 56 120 69M70 57 56 67 55 77M90 57 104 67 105 77M73 30 65 19M87 30 95 19"/></g><ellipse cx="80" cy="53" rx="12" ry="22" fill="currentColor"/><circle cx="80" cy="31" r="14" fill="currentColor"/><circle cx="73" cy="28" r="5" fill="var(--bg)"/><circle cx="87" cy="28" r="5" fill="var(--bg)"/></svg></div><p id="universeModel"></p><div id="universeBenchmarks"></div><p id="universeTraining" class="small muted"></p><details><summary>What it learns</summary><p>The server learns from shared decisions and the real prices that followed. Examples that beat waiting after costs teach that action; the others teach waiting. Training uses finished periods only. A new model enters a later period.</p><p>This is a separate server decision model. It never sends learned weights back to your fly.</p><div id="universeDecisions"></div></details></section>
 <section class="universe-board"><div class="section-row"><h2>Fly leaderboard</h2><span id="universeRoundState" class="universe-pill"></span></div><p id="universeDates" class="small muted"></p><div id="universeMine"></div><div id="universeLeaderboard"></div><p class="small muted">Only complete periods receive a rank. During a period, returns are a progress reference.</p></section></div>
 <section class="universe-participate"><h2>Bring your fly</h2><p>Registration freezes a copy of your current brain and teaching for the next period. You can keep teaching your personal fly.</p><label class="universe-consent"><input id="universeConsent" type="checkbox"><span>I agree to publish my fly name, identity, decisions and evaluation results, and let the server learn from them. My private key and full brain stay in this browser.</span></label><div class="universe-actions"><button id="universeEnroll" class="primary">Join next period</button><button id="universeRun">Run this period</button><button id="universePause" disabled>Pause evaluation</button></div><p id="universeStatus" role="status"></p><p class="small muted">Keep this page visible for evaluation. It temporarily pauses personal automatic trading. Missing decisions stay missing; reopening cannot fill them in.</p></section>
 <details class="universe-rules"><summary>How comparison works</summary><p>Each daily period starts at 00:00 UTC with the same USD 10,000 worth of Bitcoin. Evaluation accounts are separate from your money and shop items.</p><p>Every five minutes, each fly sees the same market. Orders use a later market price, with a 0.10% fee and 0.05% slippage. Buy holds Bitcoin, sell holds cash. No borrowing or short selling.</p><p>Net return includes open holdings and costs. Largest drop measures the fall from the highest account value, sampled each minute. Hold Bitcoin is the buy-and-hold reference.</p><p>Signed browser decisions prove who submitted them, not that their brain execution was independently verified. This leaderboard is a learning reference, with no prizes.</p></details>`;
 const $=s=>root.querySelector(s),status=text=>{$('#universeStatus').textContent=text;};
 function controls(){
  if(disposed)return;
  $('#universeEnroll').disabled=busy||!data||!!data.enrolled_next;
  $('#universeRun').disabled=running||busy||!data?.mine||data.round.id!==data.current_round_id||data.round.status!=='RUNNING';
  $('#universePause').disabled=!running;
  $('#universeEnroll').textContent=data?.enrolled_next?'Registered for next period':'Join next period';
 }
 function render(){
  if(!data)return;const r=data.round;
  $('#universePeriod').innerHTML=data.rounds.map(p=>`<option value="${esc(p.id)}" ${p.id===r.id?'selected':''}>${esc(date(p.starts_at))} · ${esc(t(states[p.status]||p.status))}</option>`).join('');
  $('#universeDates').textContent=`${date(r.starts_at)} → ${date(r.ends_at)}`;
  $('#universeRoundState').textContent=states[r.status]||r.status;
  $('#universeLearning').textContent={COLLECTING:'Collecting experience',TRAINING:'Learning from a finished period',TRAINED:'Model trained'}[data.learning.state];
  $('#universeModel').textContent=r.model_version===null?'Waiting for this period to begin':`Evaluation model · v${r.model_version}`;
  $('#universeTraining').textContent=data.learning.model?`Learned from ${data.learning.model.samples} examples by ${data.learning.model.contributors} flies. Candidate v${data.learning.model.version} enters a future period.`:'No trained model yet. The official fly is holding Bitcoin while experience accumulates.';
  $('#universeBenchmarks').innerHTML=data.benchmarks.map(b=>`<div class="universe-benchmark"><span>${esc(t(b.kind==='OFFICIAL'?'Official fly':'Hold Bitcoin'))}</span><strong class="${b.net_return>=0?'positive':'negative'}">${esc(pct(b.net_return))}</strong></div>`).join('')||`<p>${esc(t('Benchmarks start with the period.'))}</p>`;
  $('#universeMine').innerHTML=data.mine?`<div class="universe-mine"><span>${esc(t('Your fly'))}</span><b>${esc(pct(data.mine.net_return))}</b><span>${esc(t(states[data.mine.status]))}${data.mine.rank?' · #'+data.mine.rank:''}</span><small>${esc(t('Decisions received'))}: ${data.mine.received} / ${r.settled_tasks}${data.mine.percentile===null||data.mine.percentile===undefined?'':` · ${esc(t(`Ahead of ${data.mine.percentile}% of ranked flies`))}`}</small></div>`:'';
  $('#universeLeaderboard').innerHTML=data.leaderboard.length?`<table class="universe-table"><thead><tr><th scope="col">#</th><th scope="col">Fly</th><th scope="col">Net return</th><th scope="col">Largest drop</th></tr></thead><tbody>${data.leaderboard.map(e=>`<tr class="${e.mine?'is-mine':''}"><td>${e.rank||'—'}</td><th scope="row"><span data-no-localize>${esc(e.name)}</span><small>${esc(t(states[e.status]))} · ${e.received}/${r.settled_tasks}</small></th><td class="${e.net_return>=0?'positive':'negative'}">${esc(pct(e.net_return))}</td><td>${esc(pct(e.max_drawdown===null?null:-e.max_drawdown))}</td></tr>`).join('')}</tbody></table>`:`<div class="universe-empty"><strong>No flies in this period yet.</strong><p>Join the next period to compare your fly on equal terms.</p></div>`;
  $('#universeDecisions').innerHTML=data.official_decisions.length?`<h3>Recent official decisions</h3><ul>${data.official_decisions.map(d=>`<li>${esc(date(d.created_at))} · ${esc(t({BUY:'Bought Bitcoin',SELL:'Sold Bitcoin',HOLD:'Waiting'}[d.action]))}</li>`).join('')}</ul>`:'';
  $('#universeService').textContent=!data.clock.last_tick||Date.now()/1000-data.clock.last_tick>180?'Evaluation is waiting for fresh server data.':`Updated ${date(data.clock.last_tick)}`;
  controls();
 }
 async function refresh(){try{data=await client.overview(selected);if(!disposed)render();}catch{if(!disposed)$('#universeService').textContent='Universe is temporarily unavailable. Try again shortly.';}}
 function pause(message='Evaluation paused'){running=false;generation++;clearTimeout(timer);timer=null;onRunning(false);status(message);controls();}
 async function tick(){
  if(disposed||!running)return;if(busy){clearTimeout(timer);timer=setTimeout(tick,15000);return;}if(document.hidden){status('Waiting for this page to be visible');return;}
  const epoch=generation;busy=true;controls();
  try{const result=await client.contribute({isActive:()=>running&&!disposed&&epoch===generation&&!document.hidden});if(epoch===generation)status(result.waiting?'Waiting for the next market snapshot':'Decision received. The server will evaluate the outcome.');await refresh();}
  catch(error){if(epoch===generation){if(/CHECKPOINT/.test(error.message))pause('This period needs its frozen brain in the browser where you registered.');else status('Could not submit this decision. Retrying while the window remains open.');}}
  finally{busy=false;controls();if(running&&!disposed)timer=setTimeout(tick,15000);}
 }
 $('#universePeriod').onchange=async e=>{selected=e.target.value;await refresh();};
 $('#universeEnroll').onclick=async()=>{
  if(!$('#universeConsent').checked){status('Please read and accept sharing before registering.');return;}
  busy=true;controls();status('Saving a separate evaluation copy…');
  try{await client.enroll(data.next_round.id,{consent:true});status(`Registered. Evaluation starts ${date(data.next_round.starts_at)}.`);await refresh();}
  catch(error){status(error.message?.includes('ROUND_CAPACITY_REACHED')?'This period is full. Please try the next period.':'Registration could not finish. Your personal fly is safe; try again.');}
  finally{busy=false;controls();}
 };
 $('#universeRun').onclick=async()=>{if(busy||running||disposed)return;busy=true;controls();try{await beforeStart();if(disposed)return;running=true;generation++;onRunning(true);status('Evaluation running');}catch{if(!disposed)status('The brain is busy. Try again shortly.');}finally{busy=false;controls();}if(running)await tick();};
 $('#universePause').onclick=()=>pause();
 const visible=()=>{if(!document.hidden){if(running){clearTimeout(timer);tick();}refresh();}};
 document.addEventListener('visibilitychange',visible);document.addEventListener('defly-language-change',render);
 refreshTimer=setInterval(()=>{if(!document.hidden&&!root.closest('[hidden]'))refresh();},60000);
 await refresh();return {pause,dispose(){disposed=true;pause();clearInterval(refreshTimer);document.removeEventListener('visibilitychange',visible);document.removeEventListener('defly-language-change',render);}};
}
