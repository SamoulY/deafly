const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value) : '—';
const date = seconds => new Date(seconds*1000).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const labels = {BUY:'Buy',SELL:'Sell',HOLD:'Wait'};
export function accountValue(portfolio, mark) {
  if (!portfolio) return null;
  const cash = Number(portfolio.cash), qty = Number(portfolio.position_qty ?? portfolio.quantity ?? 0);
  const side = portfolio.position_side || (qty ? 'LONG' : 'FLAT');
  if (!qty || side === 'FLAT') return cash;
  if (!(mark > 0)) return null;
  return side === 'SHORT' ? cash + qty*(2*Number(portfolio.entry_price)-mark) : cash + qty*mark;
}
export function decisionLabel(decision) {
  if (!decision) return 'No decisions yet';
  return decision.action === 'HOLD' ? 'Waiting' : decision.action === 'CLOSE' ? 'Closed its position' : decision.action === 'SELL' ? 'Opened a short' : 'Bought Bitcoin';
}
function lineChart(points, label) {
  if (points.length < 2) return '<div class="chart-empty">The chart begins with two recorded points.</div>';
  const values = points.map(p=>p.value), low = Math.min(...values), high = Math.max(...values), span = high-low || Math.max(1,high*.01);
  const start=points[0].time, duration=points.at(-1).time-start;
  const coordinates = points.map((p,i)=>`${(10+(duration ? (p.time-start)/duration : i/(points.length-1))*340).toFixed(2)},${(105-(p.value-low)/span*85).toFixed(2)}`).join(' ');
  return `<svg viewBox="0 0 360 125" preserveAspectRatio="none" role="img" aria-label="${escape(label)}"><path d="M10 110H350" class="chart-baseline"/><polyline points="${coordinates}"/><circle cx="${coordinates.split(' ').at(-1).split(',')[0]}" cy="${coordinates.split(' ').at(-1).split(',')[1]}" r="3"/></svg>`;
}
const pageHead = (title,back='more') => `<div class="page-heading"><button data-go="${back}" aria-label="Back">‹</button><h1 tabindex="-1">${title}</h1></div>`;
export function mountCompanion({api,origin,onPage,onRun,onGreet,onRename,onView,getName}) {
  const legacy = document.querySelector('main');
  legacy.id = 'legacyWorkspace';
  const root = document.createElement('main');
  root.id = 'companion';
  root.innerHTML = `
    <header class="companion-header"><a href="#home" aria-label="DeFly home">DEFLY</a><span class="paper-badge">Paper</span></header>
    <section data-page="home">
      <div id="recoverySlot"></div>
      <div class="overview"><span class="muted">Total value</span><div id="homeEquity" class="big-number">—</div><div id="equityChange" class="small muted"></div><div id="equityLine" class="line-chart"></div><div class="range-bar" aria-label="Portfolio period"><button data-range="1" aria-pressed="true">1D</button><button data-range="7" aria-pressed="false">1W</button><button data-range="0" aria-pressed="false">All</button><span class="small muted">At fly decisions</span></div></div>
      <div class="fly-card"><div class="fly-heading"><b id="companionName">Fly</b><span id="flyDecision">No decisions yet</span></div><div id="homeScene"></div><div id="greeting" role="status" hidden></div></div>
      <div class="fly-actions"><button id="greetFly">Say hello <span aria-hidden="true">↗</span></button><button id="flyToolsToggle" aria-label="Fly settings" aria-expanded="false" aria-controls="flyTools">•••</button></div>
      <div id="flyTools" hidden><form id="companionRename"><input name="flyName" aria-label="Fly name" maxlength="40" required><button>Save name</button></form><div class="tool-row"><button id="runFly" disabled>Start fly</button><button id="pauseMotion">Pause motion</button><button data-go="vision">Fly vision</button><button data-go="practice" data-wardrobe>Appearance</button></div><p class="small muted">The fly makes its own paper trades while this tab is active.</p><p id="flyRunMessage" class="small" role="status"></p></div>
      <div class="home-body"><section class="holdings"><h2>Fly holdings</h2><button id="holdingLink" class="asset-row" data-go="holding"><span class="coin" aria-hidden="true">₿</span><span class="asset-title">Bitcoin<small id="homeQuantity">No position</small></span><b id="homeHolding">—</b><span aria-hidden="true">›</span></button><div class="cash-row"><details><summary>Available cash</summary><p>Money the fly has not committed to a position.</p></details><span id="homeCash">—</span></div></section>
      <section class="teaching"><h2>Teach your fly</h2><div class="teaching-choices"><button data-demonstrate="BUY" disabled aria-pressed="false" aria-expanded="false" aria-controls="lessonPanel">Show buy</button><button data-demonstrate="SELL" disabled aria-pressed="false" aria-expanded="false" aria-controls="lessonPanel">Show sell</button><button data-demonstrate="HOLD" disabled aria-pressed="false" aria-expanded="false" aria-controls="lessonPanel">Show wait</button></div><p class="small muted">You give examples. Your fly decides when to trade.</p><div id="lessonPanel" hidden><div class="section-row"><h3 id="lessonTitle">Your example</h3><button data-cancel-lesson aria-label="Cancel example">×</button></div><div class="section-row small"><span>Bitcoin · USD</span><b id="lessonPrice">—</b></div><div id="lessonLine" class="line-chart"></div><p id="lessonContext" class="small muted"></p><div class="lesson-actions"><button data-cancel-lesson>Cancel</button><button id="saveLesson" class="primary" disabled>Save example</button></div></div><p id="lessonResult" class="small" role="status"></p></section>
      <section class="recent"><div class="section-row"><h2>Latest moment</h2><button data-go="records">View all ›</button></div><div id="recentMoment"></div></section></div>
    </section>
    <section data-page="holding" hidden>${pageHead('Bitcoin','home')}<span class="muted">Price · USD</span><div id="holdingPrice" class="big-number">—</div><div id="priceLine" class="line-chart"></div><p id="priceTime" class="small muted"></p><h2>Fly position</h2><dl id="holdingDetails"></dl><details><summary>How this position works</summary><p id="positionExplanation"></p></details><button class="primary full-width" data-go="home" data-focus-teach>Teach your fly</button><button class="menu-row" data-go="analysis">Advanced charts <span>›</span></button></section>
    <section data-page="records" hidden>${pageHead('Records','home')}<div class="filter-bar" aria-label="Record type"><button data-filter="all" aria-pressed="true">All</button><button data-filter="decision" aria-pressed="false">Fly decisions</button><button data-filter="teaching" aria-pressed="false">Your teaching</button></div><div id="recordList"></div><p class="small muted">Latest 100 decisions and 100 examples. Greetings stay on this device.</p></section>
    <section data-page="more" hidden>${pageHead('More','home')}<button class="menu-row" data-go="analysis">Advanced charts <span>›</span></button><button class="menu-row" data-go="practice">Historical practice <span>›</span></button><button class="menu-row" data-go="vision">Fly vision <span>›</span></button><button class="menu-row" data-go="colony">Colony <span>›</span></button><button class="menu-row" data-go="account">Account & saves <span>›</span></button><details><summary>Advanced tools</summary><button class="menu-row" data-go="technical">Brain & model details <span>›</span></button><button class="menu-row" data-go="experiments">Experiments & routers <span>›</span></button></details></section>
    <section data-page="analysis" hidden>${pageHead('Advanced charts')}<div id="analysisSlot"></div><button class="menu-row" data-go="practice">Historical charts & indicators <span>›</span></button></section>
    <section data-page="practice" hidden>${pageHead('Historical practice')}<p class="small muted">A separate practice account. Examples here advance historical prices and can train the decision head.</p><div id="practiceSlot"></div></section>
    <section data-page="vision" hidden>${pageHead('Fly vision')}<div id="visionSlot"></div><button class="menu-row" data-go="technical">Brain activity <span>›</span></button></section>
    <section data-page="colony" hidden>${pageHead('Colony')}<div id="colonySlot"></div></section>
    <section data-page="account" hidden>${pageHead('Account & saves')}<div id="accountSlot"></div></section>
    <section data-page="technical" hidden>${pageHead('Brain & model details')}<div id="technicalSlot"></div></section>
    <section data-page="experiments" hidden>${pageHead('Experiments & routers')}<div id="experimentsSlot"></div></section>
    <p id="companionStatus" class="small" role="status"></p>
    <nav class="bottom-nav" aria-label="Main navigation"><button data-go="home" aria-current="page"><span aria-hidden="true">⌂</span>Home</button><button data-go="records"><span aria-hidden="true">≡</span>Records</button><button data-go="more"><span aria-hidden="true">⋯</span>More</button></nav>`;
  legacy.before(root);
  document.body.classList.add('observer-app');
  const $ = selector => root.querySelector(selector);
  const move = (selector,slot) => { const el=document.querySelector(selector); if(el) $(slot).append(el); };
  move('.scene-wrap','#homeScene');
  move('#sessionRecovery','#recoverySlot');
  move('.account-login','#accountSlot');
  move('.fly-identity-panel','#accountSlot');
  move('.brain-runtime','#accountSlot');
  move('#colonyRoot','#colonySlot');
  move('.theater','#technicalSlot');
  move('.router-panel[aria-label="Federated routers"]','#experimentsSlot');
  for (const el of [...legacy.querySelectorAll('.prediction-mini,.poly-view,.desk-admin')]) $('#experimentsSlot').append(el);
  move('.account','#practiceSlot');
  move('#experimentalLab','#analysisSlot');
  move('#labControls','#technicalSlot');
  legacy.hidden=true;
  // The original controls remain wired, but do not duplicate the home state.
  document.querySelector('.workspace-modes').hidden=true;
  document.querySelector('.account-title h1').textContent='Practice account';
  document.querySelector('.view-tabs').hidden=true;
  document.querySelector('.stage-top').hidden=true;
  document.querySelector('.brain-detail').open=false;
  const scene=document.querySelector('.scene-wrap');
  let page='home',owner=null,data={portfolio:null,decisions:[],lessons:[]},market=null,range=1,filter='all',greetings=[],pending=null,busy=false,ready=false,epoch=0,refreshing=null,navigation=Promise.resolve();
  const storageKey = kind => `defly.companion:${origin}:${owner}:${kind}`;
  const say = message => { $('#companionStatus').textContent=message; };
  const mark = () => market?.candles?.at(-1)?.close || null;
  function records() {
    return [...data.decisions.map(d=>({...d,kind:'decision',title:decisionLabel(d),detail:`Bitcoin · ${money(d.server_price)} · Fee ${money(d.fee)} · ${d.portfolio.position_side.toLowerCase()}`})),...data.lessons.map(d=>({...d,kind:'teaching',title:`You showed: ${labels[d.action].toLowerCase()}`,detail:`Bitcoin · ${money(d.context.market.candles.at(-1).close)} · ${date(d.context.created_at)} snapshot. Saved for review; no model training applied.`})),...greetings].sort((a,b)=>b.created_at-a.created_at);
  }
  function renderRecords() {
    const rows=records();
    const moment=rows.find(row=>row.kind!=='decision');
    $('#recentMoment').innerHTML=moment ? `<button class="recent-link" data-go="records"><span>${escape(moment.title)}</span><time>${escape(date(moment.created_at))}</time></button>` : '<p class="small muted">Your first shared moment will appear here.</p>';
    const selected=rows.filter(r=>filter==='all'||r.kind===filter);
    $('#recordList').innerHTML=selected.length ? selected.map(r=>`<details class="record"><summary><span><small>${r.kind==='decision'?'Fly decision':r.kind==='teaching'?'Your teaching':'Together'}</small>${escape(r.title)}</span><time>${escape(date(r.created_at))}</time></summary><p>${escape(r.detail)}</p></details>`).join('') : '<p class="empty-message">No records yet.</p>';
  }
  function render() {
    const p=data.portfolio,price=mark(),value=accountValue(p,price),qty=Number(p?.position_qty ?? p?.quantity ?? 0),side=p?.position_side || 'FLAT';
    $('#homeEquity').textContent=money(value);
    $('#homeCash').textContent=p?money(Number(p.cash)):'—';
    $('#homeQuantity').textContent=!qty?'No position':`${qty.toFixed(6)} BTC${side==='SHORT'?' · Short':''}`;
    $('#homeHolding').textContent=!p?'—':qty ? money(value===null?null:value-Number(p.cash)) : money(0);
    $('#flyDecision').textContent=decisionLabel(data.decisions[0]);
    const cutoff=range ? Date.now()/1000-range*86400 : 0;
    const points=data.decisions.filter(d=>d.created_at>=cutoff).slice().reverse().map(d=>({time:d.created_at,value:accountValue(d.portfolio,d.server_price)})).filter(p=>Number.isFinite(p.value));
    if(points.length && value!==null && price) points.push({time:Date.now()/1000,value});
    $('#equityLine').innerHTML=points.length ? lineChart(points,'Account value at recorded fly decisions, then current value') : '<div class="chart-empty">Your fly’s first decision starts the chart.</div>';
    const delta=points.length>1?points.at(-1).value-points[0].value:null;
    $('#equityChange').textContent=delta===null?'':`${delta>=0?'+':'−'}${money(Math.abs(delta))} from first shown decision`;
    $('#equityChange').classList.toggle('positive',delta>0);
    $('#equityChange').classList.toggle('negative',delta<0);
    $('#holdingPrice').textContent=money(price);
    $('#priceLine').innerHTML=lineChart((market?.candles||[]).map(c=>({time:c.time,value:c.close})),'Bitcoin closing prices in USD');
    $('#priceTime').textContent=market?`${market.source} · Closed 1-minute prices · ${date(market.candles.at(-1).time)}`:'Current price unavailable';
    const entry=Number(p?.entry_price||p?.avg_cost||0),pnl=qty&&price?qty*(side==='SHORT'?entry-price:price-entry):qty?null:0;
    $('#holdingDetails').innerHTML=[['Position',qty?(side==='SHORT'?'Short':'Holding'):'None'],['Quantity',`${qty.toFixed(6)} BTC`],['Position value',money(value===null||!p?null:value-Number(p.cash))],['Unrealized gain / loss',money(pnl)],['Entry price',qty?money(entry):'—']].map(([a,b])=>`<div><dt>${a}</dt><dd>${escape(b)}</dd></div>`).join('');
    $('#positionExplanation').textContent=side==='SHORT'?'A short benefits when the price falls. Position value includes the reserved amount and current gain or loss. The fly decides when to close it.':'The fly chooses when to buy, wait, or close its position. Unrealized gain or loss is the change since entry, before closing fees.';
    $('#companionName').textContent=getName()||'Fly';
    if(document.activeElement!==$('#companionRename input')) $('#companionRename input').value=getName()||'Fly';
    renderRecords();
  }
  async function refresh(force=false) {
    if(!owner || document.hidden) return;
    if(refreshing) return force ? refreshing.then(()=>refresh()) : refreshing;
    const generation=epoch;
    refreshing=(async()=>{
      const [account,quote]=await Promise.allSettled([api('/api/companion'),api('/api/observation')]);
      if(generation!==epoch) return;
      if(account.status==='fulfilled') data=account.value;
      if(quote.status==='fulfilled') market=quote.value; else market=null;
      say(account.status==='rejected'?'Account refresh failed. Displaying the last loaded account.':quote.status==='rejected'?'Live price unavailable. Try again shortly.':'');
      render();
    })().finally(()=>{if(generation===epoch) refreshing=null;});
    return refreshing;
  }
  function navigate(next,options={}) {
    // Mode changes can await market data. Preserve the order of quick navigation taps.
    navigation=navigation.then(()=>showPage(next,options)).catch(error=>say(error.message));
    return navigation;
  }
  async function showPage(next,{focus=true}={}) {
    if(![...root.querySelectorAll('[data-page]')].some(el=>el.dataset.page===next)) next='home';
    const previous=page;
    root.setAttribute('aria-busy','true');
    try { await onPage(next,previous); } catch(error) { say(error.message); return; }
    finally { root.setAttribute('aria-busy','false'); }
    page=next;
    root.dataset.activePage=page;
    root.querySelectorAll('[data-page]').forEach(el=>el.hidden=el.dataset.page!==page);
    root.querySelectorAll('.bottom-nav button').forEach(b=>{if(b.dataset.go===(['home','records'].includes(page)?page:'more'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    if(['home','vision','technical'].includes(page)) {
      (page==='home'?$('#homeScene'):page==='vision'?$('#visionSlot'):$('#technicalSlot')).prepend(scene);
      onView(page==='vision'?'vision':page==='technical'?'brain':'fly');
    }
    if(page==='analysis') $('#experimentalLab').hidden=false;
    if(page==='home' || page==='records') await refresh();
    if(location.hash!==`#${page}`) history.pushState(null,'',`#${page}`);
    if(focus) { window.scrollTo(0,0); $(`[data-page="${page}"] h1`)?.focus({preventScroll:true}); }
  }
  function lessonControls() {
    root.querySelectorAll('[data-demonstrate]').forEach(b=>{b.disabled=!ready||busy||Boolean(pending?.submitted);b.setAttribute('aria-pressed',String(b.dataset.demonstrate===pending?.action));b.setAttribute('aria-expanded',String(b.dataset.demonstrate===pending?.action));});
    root.querySelectorAll('[data-cancel-lesson]').forEach(b=>b.disabled=busy||Boolean(pending?.submitted));
    $('#saveLesson').disabled=busy||!pending?.context;
    $('#saveLesson').textContent=busy?'Saving…':pending?.submitted?'Retry saving':'Save example';
  }
  function renderLesson() {
    $('#lessonPanel').hidden=!pending;
    if(pending){
      $('#lessonTitle').textContent=`Your example: ${labels[pending.action].toLowerCase()}`;
      const context=pending.context;
      $('#lessonPrice').textContent=money(context?.market.candles.at(-1).close);
      $('#lessonLine').innerHTML=lineChart((context?.market.candles||[]).map(c=>({time:c.time,value:c.close})),'Price context for this teaching example');
      $('#lessonContext').textContent=context?`Snapshot: ${date(context.created_at)}. Saves an example for review; does not place an order or train the model.`:'Loading a current market snapshot…';
    }
    lessonControls();
  }
  async function choose(action) {
    if(busy||pending?.submitted||!ready)return;
    const generation=epoch;
    busy=true; pending={action,idempotency_key:crypto.randomUUID()}; renderLesson();
    $('#lessonResult').textContent='';
    try { const context=await api('/api/companion/contexts',{method:'POST',body:{}}); if(generation===epoch)pending.context=context; }
    catch(error){ if(generation===epoch){pending=null;$('#lessonResult').textContent=`Could not load an example: ${error.message}`;} }
    finally {if(generation===epoch){busy=false;renderLesson();}}
  }
  async function saveLesson() {
    if(busy||!pending?.context)return;
    const generation=epoch;
    busy=true; pending.submitted=true;
    sessionStorage.setItem(storageKey('pending'),JSON.stringify(pending));
    lessonControls();
    try {
      await api('/api/companion/lessons',{method:'POST',body:{action:pending.action,context_id:pending.context.id,idempotency_key:pending.idempotency_key}});
      if(generation!==epoch)return;
      pending=null;sessionStorage.removeItem(storageKey('pending'));
      $('#lessonResult').textContent='Example saved for review. Your fly’s holdings are unchanged.';
      await refresh(true);
    } catch(error) {
      if(generation!==epoch)return;
      if(['CONTEXT_EXPIRED','CONTEXT_NOT_FOUND','CONTEXT_ALREADY_TAUGHT','INVALID_DEMONSTRATION','IDEMPOTENCY_CONFLICT'].includes(error.code)){pending=null;sessionStorage.removeItem(storageKey('pending'));$('#lessonResult').textContent='This example is no longer available. Choose again for a fresh snapshot.';}
      else $('#lessonResult').textContent='Save not confirmed. Retry the same example; it will only be recorded once.';
    } finally {if(generation===epoch){busy=false;renderLesson();}}
  }
  root.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.go){await navigate(button.dataset.go);if(button.hasAttribute('data-focus-teach'))$('[data-demonstrate]').focus();if(button.hasAttribute('data-wardrobe'))document.querySelector('#wardrobeToggle')?.click();}
    if(button.dataset.range!==undefined){range=Number(button.dataset.range);root.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}
    if(button.dataset.filter){filter=button.dataset.filter;root.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderRecords();}
    if(button.dataset.demonstrate)choose(button.dataset.demonstrate);
    if(button.hasAttribute('data-cancel-lesson')&&!busy&&!pending?.submitted){pending=null;renderLesson();$('[data-demonstrate]').focus();}
  });
  $('#saveLesson').onclick=saveLesson;
  $('#flyToolsToggle').onclick=()=>{const open=$('#flyTools').hidden;$('#flyTools').hidden=!open;$('#flyToolsToggle').setAttribute('aria-expanded',String(open));};
  $('#greetFly').onclick=()=>{
    onGreet();$('#greeting').hidden=false;$('#greeting').textContent='A little company at the desk.';
    setTimeout(()=>$('#greeting').hidden=true,3500);
    if(owner){greetings=[{kind:'greeting',title:'You said hello',detail:'A shared moment at the desk. Saved on this device.',created_at:Math.floor(Date.now()/1000)},...greetings].slice(0,20);localStorage.setItem(storageKey('greetings'),JSON.stringify(greetings));renderRecords();}
  };
  $('#pauseMotion').onclick=()=>{document.querySelector('#motion').click();$('#pauseMotion').textContent=document.querySelector('#motion').textContent.startsWith('RESUME')?'Resume motion':'Pause motion';};
  $('#companionRename').onsubmit=async e=>{e.preventDefault();try{await onRename($('#companionRename input').value.trim());render();}catch(error){say(error.message);}};
  $('#runFly').onclick=async()=>{const b=$('#runFly');b.disabled=true;$('#flyRunMessage').textContent='Preparing…';try{await onRun();$('#flyRunMessage').textContent='';}catch(error){$('#flyRunMessage').textContent=error.message;}finally{b.disabled=false;updateRun();await refresh();}};
  function updateRun(){const status=document.querySelector('#autoStatus'),running=status.classList.contains('running')&&status.textContent.startsWith('RUNNING');$('#runFly').textContent=running?'Pause fly':'Start fly';}
  new MutationObserver(updateRun).observe(document.querySelector('#autoStatus'),{attributes:true,childList:true});
  window.addEventListener('popstate',()=>navigate(location.hash.slice(1)||'home'));
  root.querySelector('.companion-header a').onclick=e=>{e.preventDefault();navigate('home');};
  setInterval(()=>{if(['home','holding','records'].includes(page))refresh();},30000);
  render();
  return {
    async ready(userId){
      epoch++;refreshing=null;owner=userId;ready=false;busy=false;data={portfolio:null,decisions:[],lessons:[]};market=null;pending=null;greetings=[];
      try {greetings=JSON.parse(localStorage.getItem(storageKey('greetings'))||'[]');pending=JSON.parse(sessionStorage.getItem(storageKey('pending'))||'null');}catch{/* Ignore damaged optional local history. */}
      renderLesson();render();
      await navigate(location.hash.slice(1)||'home',{focus:false});
      ready=true;$('#runFly').disabled=false;lessonControls();
    },
    refresh,
    error:message=>say(message),
  };
}
