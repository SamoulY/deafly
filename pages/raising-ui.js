const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => Number.isFinite(Number(value)) ? '$' + Number(value).toFixed(2) : '--';
const percent = value => value != null && Number.isFinite(Number(value)) ? (Number(value)*100).toFixed(1)+'%' : '--';
export function renderEvaluation(e) {
  const result=e.result;
  const rows=[['cash','CASH BASELINE'],['buy_hold','BUY & HOLD'],['pre','PRE-TRAINING'],['post','POST-TRAINING']];
  return `<article class="training-card"><strong>${escapeHtml(result?.status || e.status)}</strong><p>${escapeHtml(e.error || 'Frozen held-out evaluation · no updates or intervention')}</p>${result ? `<p>REFERENCE ENGINE · NEXT MINUTE · NOT CORE FIVE-MINUTE</p><div class="review-scroll"><table><thead><tr><th>MODEL</th><th>NET PNL</th><th>MAX DRAWDOWN</th><th>DIRECTION ACCURACY</th><th>FORCED RATE</th><th>VOLUNTARY RATE</th></tr></thead><tbody>${rows.map(([key,label])=>{ const m=result.results?.[key]; return m ? `<tr><th>${escapeHtml(label)}</th><td>${money(m.net_pnl)}</td><td>${percent(m.max_drawdown)}</td><td>${percent(m.direction_accuracy)}</td><td>${percent(m.forced_trade_rate)}</td><td>${percent(m.voluntary_trade_rate)}</td></tr>` : ''; }).join('')}</tbody></table></div><p>${escapeHtml(result.reason || '')}</p>` : ''}</article>`;
}
export async function init(options) {
  const root = options.root || document.querySelector('#raisingRoot');
  const ui = createRaisingController(options);
  const api = options.api;
  let busy = false, trainingData = null;
  const terminal = document.querySelector('.terminal');
  root.innerHTML = `
    <header class="fly-profile"><div class="profile-eye" aria-hidden="true">◉</div><form id="flyNameForm"><label for="flyName">YOUR FLY</label><div><input id="flyName" maxlength="40" required aria-label="Fly name"><button title="Save name" aria-label="Save name">✓</button></div></form><div class="points"><span>POINTS</span><strong id="flyPoints">--</strong></div><button id="wardrobeToggle" title="Wardrobe" aria-label="Wardrobe" aria-expanded="false">♧</button></header>
    <nav class="raising-tabs" aria-label="Raising views"><button data-raising-tab="teach" aria-pressed="true">TEACH</button><button data-raising-tab="training" aria-pressed="false">TRAIN</button><button data-raising-tab="history" aria-pressed="false">HISTORY</button></nav>
    <section id="raisingTeach"><div class="round-toolbar"><label>MARKET <select id="teachingSymbol"><option>BTCUSD</option><option>ETHUSD</option></select></label><button id="startRound">+ NEW ROUND</button></div><div class="round-heading"><strong id="roundTitle">NO ACTIVE ROUND</strong><span id="roundProgress">0 / 12</span></div><progress id="roundMeter" max="12" value="0"></progress><div id="roundFacts" class="round-facts">HISTORICAL PAPER SESSION</div><div class="teach-actions"><button data-teach="BUY" disabled>↑ LONG</button><button data-teach="SELL" disabled>↓ SHORT</button><button data-teach="HOLD" disabled>Ⅱ HOLD</button><button data-teach="CLOSE" disabled>× CLOSE</button></div><p id="teachAvailability" role="status"></p><div id="roundOutcome"></div><button id="reviewRound" hidden>VIEW REVIEW →</button><div id="roundReview" hidden></div></section>
    <section id="raisingTraining" hidden><div class="round-toolbar"><strong>DECISION HEAD</strong><button id="refreshTraining">REFRESH</button><button id="trainFly">+ TRAIN</button></div><p class="muted">MARKET-ONLY READOUT · NOT STONKFLY</p><div id="trainingResults"></div></section>
    <section id="raisingHistory" hidden><div class="round-toolbar"><strong>TEACHING HISTORY</strong><button id="refreshHistory" title="Refresh history" aria-label="Refresh history">↻</button></div><div id="historyResults"></div></section>
    <p id="raisingStatus" role="status" aria-live="polite">RESTORING FLY...</p>
    <section id="wardrobe" hidden aria-label="Wardrobe"><header><h2>WARDROBE</h2><button id="wardrobeClose" title="Close wardrobe" aria-label="Close wardrobe">×</button></header><p class="muted">COSMETIC ONLY</p><p id="previewStatus" hidden></p><button id="cancelPreview" hidden>Cancel preview</button><div id="wardrobeItems"></div></section>`;
  const $ = selector => root.querySelector(selector);
  // Keep the actual market canvas next to the actions at every viewport size.
  if (terminal) $('#raisingTeach').insertBefore(terminal, $('.teach-actions'));
  function render() {
    const p = ui.state.profile;
    if (p) { $('#flyName').value = p.profile.name; $('#flyPoints').textContent = p.points; }
    const s = ui.state.session;
    $('#trainFly').disabled = busy || !trainingData || (!ui.state.trainingKey && (trainingData.eligibility.capacity_exceeded || trainingData.eligibility.eligible_count < trainingData.eligibility.min_train + trainingData.eligibility.min_validation));
    $('#trainFly').textContent = ui.state.trainingKey ? 'RETRY TRAINING' : '+ TRAIN';
    root.querySelectorAll('[data-evaluate], [data-activate]').forEach(button => { button.disabled = busy || button.dataset.active === 'true'; });
    $('#refreshTraining').disabled = busy;
    $('#flyNameForm button').disabled = busy;
    $('#refreshHistory').disabled = busy;
    $('#reviewRound').disabled = busy;
    $('#previewStatus').hidden = !ui.state.preview;
    $('#cancelPreview').hidden = !ui.state.preview;
    $('#previewStatus').textContent = ui.state.preview ? 'PREVIEW ONLY · ' + ui.state.preview.name : '';
    $('#startRound').disabled = busy || s?.status === 'ACTIVE';
    $('#teachingSymbol').disabled = busy || s?.status === 'ACTIVE';
    const reason = busy ? 'SAVING / PREPARING ROUND' : !s ? 'ROUND UNAVAILABLE · RETRY NEW ROUND' : s.status !== 'ACTIVE' ? 'ROUND COMPLETE · START A NEW ROUND' : ui.state.pending ? 'REQUEST UNCONFIRMED · RETRY THE SAME ACTION' : '';
    const unavailable = [];
    root.querySelectorAll('[data-teach]').forEach(button => {
      const blocked = !s?.observation?.action_mask?.includes(button.dataset.teach);
      const pendingOther = ui.state.pending && ui.state.pending.action !== button.dataset.teach;
      button.disabled = busy || s?.status !== 'ACTIVE' || blocked || Boolean(pendingOther);
      button.title = button.disabled ? reason || (button.dataset.teach === 'CLOSE' ? 'No open position to close' : 'Close the current position before opening another') : '';
      button.setAttribute('aria-describedby', 'teachAvailability');
      if (blocked) unavailable.push(button.dataset.teach);
    });
    $('#teachAvailability').textContent = reason || (unavailable.includes('CLOSE') ? 'CLOSE unavailable: no open position.' : unavailable.length ? 'LONG / SHORT unavailable: close the current position first.' : '');
    $('#startRound').title = busy ? 'Preparing round' : s?.status === 'ACTIVE' ? 'Finish the active round first' : 'Prepare historical bars';
    if (s) {
      $('#roundTitle').textContent = `${s.symbol || ''} · ${s.status === 'ACTIVE' ? 'TEACHING' : 'COMPLETED'}`;
      $('#roundProgress').textContent = `${s.step} / ${s.total_steps || 12}`;
      $('#roundMeter').value = s.step;
      $('#roundMeter').max = s.total_steps || 12;
      $('#roundFacts').textContent = `${s.provenance?.provider || 'HISTORICAL'} · ${s.provenance?.synthetic ? 'SYNTHETIC TEST' : 'CLOSED BARS'} · ${s.account?.side || 'FLAT'} · ${money(s.account?.equity)}`;
      $('#roundOutcome').textContent = s.status === 'COMPLETED' ? `ROUND COMPLETE · ${s.reward_points || 0} POINTS EARNED` : 'HUMAN DECISIONS · HOLD HAS NO INACTIVITY PENALTY';
      $('#reviewRound').hidden = s.status !== 'COMPLETED';
    }
    if (p) $('#wardrobeItems').innerHTML = ['head','face','body','background'].map(slot => `<section class="wardrobe-slot"><h3>${slot.toUpperCase()}</h3>${ui.state.catalog.filter(item=>item.slot===slot).map(item=>{
      const owned=p.owned.includes(item.id), equipped=p.profile.loadout[slot]===item.id;
      return `<div class="wardrobe-item"><span class="outfit-swatch ${escapeHtml(item.id)}" aria-hidden="true">${slot==='head'?'♜':slot==='face'?'◎':slot==='body'?'⋈':'■'}</span><span>${escapeHtml(item.name)}<small>${owned?'OWNED':item.cost+' POINTS'}</small></span><button data-preview="${escapeHtml(item.id)}" ${busy?'disabled':''}>TRY</button><button ${equipped || busy || (!owned && p.points<item.cost)?'disabled':''} data-${owned?'equip':'purchase'}="${escapeHtml(item.id)}">${equipped?'EQUIPPED':owned?'EQUIP':'BUY'}</button></div>`;
    }).join('')}</section>`).join('');
  }
  async function run(task, message = 'SAVED') {
    if (busy) return;
    busy = true; render(); $('#raisingStatus').textContent = 'WORKING...';
    try { await task(); $('#raisingStatus').textContent = message; }
    catch(error) { $('#raisingStatus').textContent = `FAILED · ${error.message}`; }
    finally { busy = false; render(); }
  }
  function drawer(open) { if (!open) { ui.cancelPreview(); render(); } $('#wardrobe').hidden = !open; $('#wardrobeToggle').setAttribute('aria-expanded', String(open)); if(open) $('#wardrobeClose').focus(); else $('#wardrobeToggle').focus(); }
  $('#wardrobeToggle').onclick = () => drawer($('#wardrobe').hidden);
  $('#wardrobeClose').onclick = () => drawer(false);
  $('#cancelPreview').onclick = () => { ui.cancelPreview(); render(); };
  root.addEventListener('keydown', e => { if(e.key==='Escape' && !$('#wardrobe').hidden) drawer(false); });
  $('#flyNameForm').onsubmit = e => { e.preventDefault(); const name=$('#flyName').value.trim(); if(name) run(()=>ui.rename(name)); };
  $('#startRound').onclick = () => run(async()=>{ await ui.start($('#teachingSymbol').value); $('#roundReview').hidden=true; }, 'ROUND READY');
  root.addEventListener('click', e => {
    const button=e.target.closest('button'); if(!button || button.disabled) return;
    if(button.dataset.evaluate) run(async()=>{ await api('/api/raising/evaluations',{method:'POST',body:{training_id:button.dataset.evaluate}}); await training(); },'EVALUATION SAVED');
    if(button.dataset.activate) run(async()=>{ await api('/api/raising/versions/'+encodeURIComponent(button.dataset.activate)+'/activate',{method:'POST',body:{}}); await training(); },'CHECKPOINT ACTIVATED');
    if(button.dataset.preview) { ui.preview(button.dataset.preview); render(); }
    if(button.dataset.teach) run(()=>ui.act(button.dataset.teach), 'DECISION RECORDED');
    if(button.dataset.purchase) run(()=>ui.purchase(button.dataset.purchase), 'PURCHASED');
    if(button.dataset.equip) run(()=>ui.equip(button.dataset.equip), 'EQUIPPED');
    if(button.dataset.openRound) run(async()=>{ await ui.open(button.dataset.openRound); selectTab('teach'); }, 'ROUND RESTORED');
  });
  async function history() {
    const data=await api('/api/raising/sessions');
    $('#historyResults').innerHTML = (data.sessions || []).map(s=>`<div class="history-row"><span>${escapeHtml(s.symbol)}<small>${new Date(s.created_at).toLocaleDateString()} · ${escapeHtml(s.status)}</small></span><span>${s.step}/12</span><button data-open-round="${escapeHtml(s.id)}" title="Open round" aria-label="Open round">→</button></div>`).join('') || '<p class="empty-state">NO COMPLETED ROUNDS YET</p>';
  }
  async function training() {
    const data=await api('/api/raising/training');
    trainingData = data;
    const evaluations = await api('/api/raising/evaluations');
    $('#trainingResults').innerHTML = `<div class="training-card"><strong>${data.eligibility.eligible_count} ELIGIBLE DECISIONS</strong><p>Minimum ${data.eligibility.min_train} training + ${data.eligibility.min_validation} validation decisions. Separate periods and varied actions required.</p><p>Active checkpoint: ${escapeHtml(data.active_version?.checkpoint_hash?.slice(0,12) || 'DEFAULT')}</p>${data.eligibility.capacity_exceeded?'<p>DATASET CAPACITY EXCEEDED · TRAINING UNAVAILABLE</p>':''}<button data-activate="0" data-active="${!data.active_version || String(data.active_version.id)==='0'}">RESTORE DEFAULT</button></div>` + (data.jobs || []).map(job=>`<article class="training-card"><strong>${escapeHtml(job.status)}</strong><p>${escapeHtml(job.error || job.id)}</p>${job.status==='COMPLETED'?`<button data-evaluate="${escapeHtml(job.id)}">EVALUATE FROZEN</button>`:''}</article>`).join('') + (data.versions || []).map(v=>`<article class="training-card"><p>CHECKPOINT ${escapeHtml(v.checkpoint_hash.slice(0,12))}</p><button data-activate="${escapeHtml(v.id)}" data-active="${v.id===data.active_version?.id}">${v.id===data.active_version?.id?'ACTIVE':'ACTIVATE'}</button></article>`).join('') + (evaluations.evaluations || []).map(renderEvaluation).join('');
  }
  function selectTab(tab) {
    for(const name of ['teach','training','history']) $('#raising'+name[0].toUpperCase()+name.slice(1)).hidden=name!==tab;
    root.querySelectorAll('[data-raising-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.raisingTab===tab)));
  }
  root.querySelectorAll('[data-raising-tab]').forEach(button=>button.onclick=()=>{const tab=button.dataset.raisingTab;selectTab(tab);if(tab==='history')run(history,'HISTORY LOADED');if(tab==='training')run(training,'TRAINING LOADED');});
  $('#refreshHistory').onclick=()=>run(history,'HISTORY LOADED');
  $('#refreshTraining').onclick=()=>run(training,'TRAINING REFRESHED');
  $('#trainFly').onclick=()=>run(async()=>{ await ui.train(); await training(); },'TRAINING REQUEST ACCEPTED');
  $('#reviewRound').onclick=()=>run(async()=>{
    const data=await api(`/api/raising/sessions/${encodeURIComponent(ui.state.session.id)}/review`);
    $('#roundReview').hidden=false;
    $('#roundReview').innerHTML=`<h3>DECISION REVIEW</h3><div class="review-scroll"><table><thead><tr><th>STEP</th><th>HUMAN</th><th>EQUITY</th><th>FEES</th></tr></thead><tbody>${(data.demonstrations || []).map(d=>`<tr><td>${d.step+1}</td><td>${escapeHtml(d.human_action)}</td><td>${money(d.equity_after)}</td><td>${money(d.fees)}</td></tr>`).join('')}</tbody></table></div><p class="muted">${(data.system_actions || []).length} SYSTEM SETTLEMENT ACTIONS</p>`;
  },'REVIEW LOADED');
  await run(()=>ui.load(),'FLY RESTORED');
  return ui;
}

export function createRaisingController({ api, onObservation = () => {}, onOutfit = () => {}, onMode = () => {}, onAction = () => {} }) {
  const state = { profile: null, catalog: [], session: null };
  const prefix = '/api/raising';
  function profile(data) { state.preview = null; state.profile = data; onOutfit(data.profile.loadout); return data; }
  async function session(data) { await onMode('raising'); state.session = data; onObservation(data); return data; }
  return {
    state,
    async train() {
      state.trainingKey ||= crypto.randomUUID();
      const result = await api(prefix + '/training', {method:'POST',body:{idempotency_key:state.trainingKey}});
      state.trainingKey = null;
      return result;
    },
    preview(id) { const item = state.catalog.find(item => item.id === id); if (!item) return; state.preview = item; onOutfit({...state.profile.profile.loadout, [item.slot]: item.id}); },
    cancelPreview() { state.preview = null; if (state.profile) onOutfit(state.profile.profile.loadout); },
    async load() {
      profile(await api(prefix + '/profile'));
      if (state.profile.active_session_id) await session(await api(prefix + '/sessions/' + encodeURIComponent(state.profile.active_session_id)));
      else await session(await api(prefix + '/sessions', {method:'POST',body:{symbol:'BTCUSD'}}));
      state.catalog = (await api(prefix + '/catalog')).items;
    },
    async start(symbol) { return session(await api(prefix + '/sessions', {method:'POST',body:{symbol}})); },
    async rename(name) { return profile(await api(prefix + '/profile', {method:'POST',body:{name}})); },
    async purchase(item_id) { return profile(await api(prefix + '/purchase', {method:'POST',body:{item_id}})); },
    async equip(item_id) { return profile(await api(prefix + '/equip', {method:'POST',body:{item_id}})); },
    async open(id) { return session(await api(prefix + '/sessions/' + encodeURIComponent(id))); },
    async act(action) {
      const s = state.session;
      if (state.pending && state.pending.action !== action) throw Error('Retry the unconfirmed action first');
      if (!state.pending || state.pending.step !== s.step)
        state.pending = {action,step:s.step,idempotency_key:crypto.randomUUID()};
      const result = await api(`${prefix}/sessions/${encodeURIComponent(s.id)}/actions`, {method:'POST',body:state.pending});
      state.pending = null;
      await session(result);
      onAction(action, `teaching:${result.id}:${result.step}`);
      if (result.status === 'COMPLETED') profile(await api(prefix + '/profile'));
      return result;
    },
  };
}
