import {renderRecord} from './companion-records.js?v=5';
import {locale,mountLanguage,sourceText} from './i18n.js?v=5';
import {defaultChartSettings,normalizeChartSettings,groupCandles,marketChart} from './companion-market.js?v=4';
import {mountTraining} from './companion-training.js?v=3';
import {mountShop} from './companion-shop.js?v=3';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => Number.isFinite(value) ? 'USD '+new Intl.NumberFormat(locale(),{minimumFractionDigits:2,maximumFractionDigits:2}).format(value) : '—';
const date = seconds => new Date(seconds*1000).toLocaleString(locale(),{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
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
export function mountCompanion({api,origin,onPage,onRun,onGreet,onRename,onView,getName,onAccount=()=>{},onRoom=()=>{},getFlySync=()=>null}) {
  const legacy = document.querySelector('main');
  legacy.id = 'legacyWorkspace';
  const root = document.createElement('main');
  root.id = 'companion';
  root.innerHTML = `
    <header class="companion-header"><a href="#home" aria-label="DeFly home">DEFLY</a><span class="paper-badge">Paper</span><label class="language-control"><span class="language-icon" aria-hidden="true">◎</span><select data-language-choice aria-label="Language"><option value="en" lang="en">English</option><option value="zh-CN" lang="zh-CN">简体中文</option></select></label></header>
    <section data-page="home">
      <div id="recoverySlot"></div>
      <div class="overview"><span class="muted">Total value</span><div id="homeEquity" class="big-number">—</div></div>
      <section class="market-teaching"><div class="section-row"><h2>Bitcoin <span class="muted small">USD</span></h2><b id="marketPrice">—</b></div><div id="teachChart" class="line-chart" aria-label="Bitcoin price chart"></div><input id="chartPoint" type="range" min="1" max="39" value="39" aria-label="Choose a chart point to teach" disabled><div class="chart-caption"><span id="chartTime" class="small muted">Loading prices…</span><span class="small muted">Tap the line to teach</span></div><div id="lessonPanel" hidden><div class="section-row"><h3 id="lessonTitle">What would you do here?</h3><button data-cancel-lesson aria-label="Cancel example">×</button></div><div class="teaching-choices"><button data-demonstrate="BUY" disabled aria-pressed="false">Buy here</button><button data-demonstrate="SELL" disabled aria-pressed="false">Sell here</button><button data-demonstrate="HOLD" disabled aria-pressed="false">Wait here</button></div><p id="lessonContext" class="small muted"></p><div class="lesson-actions"><button data-cancel-lesson>Cancel</button><button id="saveLesson" class="primary" disabled>Save example</button></div></div><p id="lessonResult" class="small" role="status"></p></section>
      <div class="fly-card"><div class="fly-heading"><b id="companionName">Fly</b><span id="flyDecision">No decisions yet</span></div><div id="homeScene"></div><div id="greeting" role="status" hidden></div></div>
      <div class="fly-actions"><button id="greetFly">Say hello <span aria-hidden="true">↗</span></button><button id="flyToolsToggle" aria-label="Fly settings" aria-expanded="false" aria-controls="flyTools">•••</button></div>
      <div id="flyTools" hidden><form id="companionRename"><input name="flyName" aria-label="Fly name" maxlength="40" required><button>Save name</button></form><div class="tool-row"><button id="runFly" disabled>Start fly</button><button id="pauseMotion">Pause motion</button><button data-go="vision">Fly vision</button><button data-go="practice" data-wardrobe>Appearance</button></div><p class="small muted">The fly makes its own paper trades while this tab is active.</p><p id="flyRunMessage" class="small" role="status"></p></div>
      <div class="home-body"><section class="holdings"><h2>Fly holdings</h2><button id="holdingLink" class="asset-row" data-go="holding"><span class="coin" aria-hidden="true">₿</span><span class="asset-title">Bitcoin<small id="homeQuantity">No position</small></span><b id="homeHolding">—</b><span aria-hidden="true">›</span></button><div class="cash-row"><details><summary>Available cash</summary><p>Money the fly has not committed to a position.</p></details><span id="homeCash">—</span></div></section>
      <section class="recent"><div class="section-row"><h2>Latest moment</h2><button data-go="records">View all ›</button></div><div id="recentMoment"></div></section></div>
    </section>
    <section data-page="holding" hidden>${pageHead('Bitcoin','home')}<span class="muted">Price · USD</span><div id="holdingPrice" class="big-number">—</div><div id="priceLine" class="line-chart"></div><p id="priceTime" class="small muted"></p><h2>Fly position</h2><dl id="holdingDetails"></dl><details><summary>How this position works</summary><p id="positionExplanation"></p></details><details><summary>Account value over time</summary><div id="equityChange" class="small muted"></div><div id="equityLine" class="line-chart"></div><div class="range-bar" aria-label="Portfolio period"><button data-range="1" aria-pressed="true">1D</button><button data-range="7" aria-pressed="false">1W</button><button data-range="0" aria-pressed="false">All</button><span class="small muted">At fly decisions</span></div></details><button class="primary full-width" data-go="home" data-focus-teach>Teach on the chart</button><button class="menu-row" data-go="analysis">Advanced charts <span>›</span></button></section>
    <section data-page="records" hidden>${pageHead('Records','home')}<div class="filter-bar" aria-label="Record type"><button data-filter="all" aria-pressed="true">All</button><button data-filter="decision" aria-pressed="false">Fly decisions</button><button data-filter="teaching" aria-pressed="false">Your teaching</button><button data-filter="changed" aria-pressed="false">Changed by teaching</button></div><div id="recordList"></div><p class="small muted">Latest 100 decisions and 100 examples. Greetings stay on this device.</p></section>
    <section data-page="more" hidden>${pageHead('More','home')}<button class="menu-row" data-go="analysis">Advanced charts <span>›</span></button><button class="menu-row" data-go="practice">Historical practice <span>›</span></button><button class="menu-row" data-go="vision">Fly vision <span>›</span></button><button class="menu-row" data-go="colony">Fly universe <span>›</span></button><button class="menu-row" data-go="account">Account & saves <span>›</span></button><details><summary>Advanced tools</summary><button class="menu-row" data-go="technical">Brain & model details <span>›</span></button><button class="menu-row" data-go="experiments">Experiments & routers <span>›</span></button></details></section>
    <section data-page="analysis" hidden>${pageHead('Advanced charts')}<div id="analysisSlot"></div><button class="menu-row" data-go="practice">Historical charts & indicators <span>›</span></button></section>
    <section data-page="practice" hidden>${pageHead('Historical practice')}<p class="small muted">A separate practice account. Examples here advance historical prices and can train the decision head.</p><div id="practiceSlot"></div></section>
    <section data-page="vision" hidden>${pageHead('Fly vision')}<div id="visionSlot"></div><button class="menu-row" data-go="technical">Brain activity <span>›</span></button></section>
    <section data-page="colony" hidden>${pageHead('Fly universe')}<div id="universeRoot"></div><details class="universe-legacy"><summary>Legacy group voting</summary><p>This experiment only combines votes. It does not train the official fly or enter the leaderboard.</p><div id="colonySlot"></div></details></section>
    <section data-page="account" hidden>${pageHead('Account & saves')}<div id="accountSlot"></div></section>
    <section data-page="technical" hidden>${pageHead('Brain & model details')}<div id="technicalSlot"></div></section>
    <section data-page="experiments" hidden>${pageHead('Experiments & routers')}<div id="experimentsSlot"></div></section>
    <p id="companionStatus" class="small" role="status"></p>
    <nav class="bottom-nav" aria-label="Main navigation"><button data-go="home" aria-current="page"><span aria-hidden="true">⌂</span>Home</button><button data-go="records"><span aria-hidden="true">≡</span>Records</button><button data-go="colony"><span aria-hidden="true"><svg width="22" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V10h6m0 11V3h6v18m0-8h6v8M2 21h20"/></svg></span>Leaderboard</button><button data-go="more"><span aria-hidden="true">⋯</span>More</button></nav>`;
  legacy.before(root);
  document.body.classList.add('observer-app');
  const $ = selector => root.querySelector(selector);
  $('.paper-badge').after($('.bottom-nav'));
  $('.companion-header').insertAdjacentHTML('beforeend','<button id="headerAccount" data-go="account" aria-label="Log in"><span aria-hidden="true">◉</span><span>Log in</span></button>');
  $('[data-page="account"]').insertAdjacentHTML('beforebegin',`<section data-page="training" hidden>${pageHead('Reinforcement practice','home')}<div id="trainingSlot"></div></section><section data-page="shop" hidden>${pageHead('Fly shop','home')}<div class="shop-layout"><aside><div class="room-tabs"><button data-go="home">Room</button><button aria-current="page">Shop</button><button data-go="vision" aria-label="Fly vision">◉</button></div><div id="shopScene"></div><p class="small muted">Your room, seen through your fly's eyes too.</p></aside><div id="shopSlot"></div></div></section>`);
  // A single accessible latest-point control replaces the historical scrubber.
  $('#chartPoint').outerHTML='<button id="chartPoint" class="latest-teaching" disabled>Start guiding your fly’s trading</button>';
  $('#teachChart').setAttribute('tabindex','0');$('#teachChart').setAttribute('role','button');$('#teachChart').setAttribute('aria-label','Start guiding your fly’s trading');
  $('.chart-caption').insertAdjacentHTML('afterend','<div class="teaching-entry"><button data-go="training">Reinforcement practice <span aria-hidden="true">↗</span></button></div>');
  $('.market-teaching>.section-row').append(Object.assign(document.createElement('button'),{id:'mobileChartToggle',className:'mobile-chart-toggle',textContent:'⋯'}));
  $('#mobileChartToggle').setAttribute('aria-label','Chart settings');$('#mobileChartToggle').setAttribute('aria-expanded','false');
  $('#mobileChartToggle').onclick=()=>{const open=$('.market-teaching').classList.toggle('show-chart-tools');$('#mobileChartToggle').setAttribute('aria-expanded',String(open));};
  $('#teachChart').before(Object.assign(document.createElement('div'),{className:'market-toolbar',innerHTML:`<div class="chart-style" role="group" aria-label="Chart style"><button data-chart-style="line" aria-pressed="true">Line</button><button data-chart-style="candles" aria-pressed="false">Candles</button></div><select id="marketTimeframe" aria-label="Chart timeframe">${[[60,'1 minute'],[300,'5 minutes'],[900,'15 minutes'],[1800,'30 minutes'],[3600,'1 hour'],[14400,'4 hours'],[86400,'1 day'],[604800,'1 week'],[2592000,'1 month']].map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select><button id="chartSettingsToggle" aria-expanded="false" aria-controls="marketSettings">Chart settings</button>`}));
  $('#teachChart').before(Object.assign(document.createElement('div'),{id:'marketSettings',hidden:true,innerHTML:`<label><input type="checkbox" data-chart-setting="average"> Moving average (20)</label><label><input type="checkbox" data-chart-setting="volume"> Volume</label><label><input type="checkbox" data-chart-setting="markers" checked> Teaching markers</label><button id="resetChart">Reset chart</button>`}));
  $('#teachChart').before(Object.assign(document.createElement('div'),{id:'marketOHLC',className:'market-ohlc'}));
  $('.chart-caption').after(Object.assign(document.createElement('p'),{id:'averageNotice',className:'small muted',hidden:true}));
  $('.market-teaching').append(Object.assign(document.createElement('div'),{className:'market-foot',innerHTML:`<span class="small muted">Recent 40 minutes</span><button data-go="practice">Explore historical charts <span aria-hidden="true">↗</span></button><details><summary>Chart guide</summary><p>Each candle shows the open, high, low and close. Green rises; red falls.</p><p>The average follows the last 20 displayed bars. Volume shows how much Bitcoin traded.</p><p>Choose a point to teach. Chart settings only change the view.</p></details>`}));
  $('.market-foot>span').textContent='40 closed candles';$('.market-foot details p:last-child').textContent='Teach only at the latest point. Historical scenarios are in Reinforcement practice.';
  let chartSettings=defaultChartSettings();
  try{chartSettings=normalizeChartSettings(JSON.parse(localStorage.getItem('defly.chart')||'{}'));}catch{/* Invalid optional preferences fall back to a line. */}
  // Mobile stays a simple line until its user chooses a different view on mobile.
  const compactChart=matchMedia('(max-width:999px)');
  let mobileChartSettings=defaultChartSettings();
  try{mobileChartSettings=normalizeChartSettings(JSON.parse(localStorage.getItem('defly.chart.mobile')||'{}'));}catch{/* Optional preferences. */}
  const currentChartSettings=()=>compactChart.matches?mobileChartSettings:chartSettings;
  function updateChartSettings(update){
    const previousInterval=currentChartSettings().timeframe;
    const next=normalizeChartSettings({...currentChartSettings(),...update});
    if(compactChart.matches)mobileChartSettings=next;else chartSettings=next;
    try{localStorage.setItem(compactChart.matches?'defly.chart.mobile':'defly.chart',JSON.stringify(next));}catch{/* The current view still works without storage. */}
    renderMarket();
    if(owner&&!pending&&(previousInterval!==next.timeframe||!displayMarket))loadChart();
  }
  root.querySelectorAll('[data-chart-style]').forEach(button=>button.onclick=()=>updateChartSettings({style:button.dataset.chartStyle}));
  $('#marketTimeframe').onchange=event=>updateChartSettings({timeframe:Number(event.target.value)});
  root.querySelectorAll('[data-chart-setting]').forEach(input=>input.onchange=()=>updateChartSettings({[input.dataset.chartSetting]:input.checked}));
  $('#resetChart').onclick=()=>updateChartSettings(defaultChartSettings());
  $('#chartSettingsToggle').onclick=()=>{const open=$('#marketSettings').hidden;$('#marketSettings').hidden=!open;$('#chartSettingsToggle').setAttribute('aria-expanded',String(open));};
  const appearance=document.createElement('label');appearance.className='appearance-control';appearance.innerHTML='<span>Appearance</span><select data-theme-choice aria-label="Appearance"><option value="system">Follow system</option><option value="light">Day</option><option value="dark">Night</option></select>';
  $('[data-page="more"] .page-heading').after(appearance);
  appearance.querySelector('select').value=document.documentElement.dataset.themePreference||'system';
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
  const flyCompanion=document.createElement('div');flyCompanion.className='fly-companion';$('.fly-card').before(flyCompanion);
  for(const selector of ['.fly-card','.fly-actions','#flyTools'])flyCompanion.append($(selector));
  flyCompanion.insertAdjacentHTML('afterbegin','<div class="room-tabs"><button aria-current="page">Room</button><button data-go="shop">Shop</button></div>');
  $('#flyTools [data-wardrobe]').dataset.go='shop';$('#flyTools [data-wardrobe]').removeAttribute('data-wardrobe');
  const sidebar=document.createElement('aside');sidebar.className='home-sidebar';flyCompanion.before(sidebar);sidebar.append(flyCompanion,$('.home-body'));
  let page='home',owner=null,data={portfolio:null,decisions:[],lessons:[]},market=null,range=1,filter='all',greetings=[],pending=null,lastLessonId=null,busy=false,ready=false,epoch=0,refreshing=null,navigation=Promise.resolve();
  let displayMarket=null,chartRequest=0,chartLoading=false;
  const training=mountTraining($('#trainingSlot'),{api,onSaved:()=>refresh(true),ownerKey:()=>owner?`${origin}:${owner}`:null});
  const shop=mountShop($('#shopSlot'),{api,onRoom,getFlySync,onCash:()=>{if(owner)refresh(true);},ownerKey:()=>owner?`${origin}:${owner}`:null});
  async function loadChart(){
    const interval=currentChartSettings().timeframe,request=++chartRequest,generation=epoch;
    chartLoading=true;displayMarket=null;renderMarket();
    try{const next=interval===60?market:await api(`/api/companion/chart?interval=${interval}`);if(request===chartRequest&&generation===epoch)displayMarket=next;}
    catch{if(request===chartRequest)$('#lessonResult').textContent='Chart unavailable for this timeframe. Please try again.';}
    finally{if(request===chartRequest&&generation===epoch){chartLoading=false;renderMarket();}}
  }
  const storageKey = kind => `defly.companion:${origin}:${owner}:${kind}`;
  const say = message => { $('#companionStatus').textContent=message; };
  const mark = () => market?.candles?.at(-1)?.close || null;
  function records() {
    return [...(data.opening?[{...data.opening,kind:'beginning',title:'Your fly started with Bitcoin',detail:`Your initial $10,000 paper balance bought ${data.opening.portfolio.quantity.toFixed(8)} BTC at ${money(data.opening.portfolio.fill_price)}. The budget includes a ${money(data.opening.fee)} fee and simulated price slippage. This is the starting allocation; your fly decides all later trades.`}]:[]),...data.decisions.map(d=>({...d,kind:'decision',title:decisionLabel(d),detail:`Bitcoin · ${money(d.server_price)} · Fee ${money(d.fee)}`})),...data.lessons.map(d=>({...d,kind:'teaching',title:`You showed: ${labels[d.action].toLowerCase()}`})),...greetings.map((g,i)=>({...g,id:g.id||`greeting-${g.created_at}-${i}`}))].sort((a,b)=>b.created_at-a.created_at);
  }
  function renderRecords() {
    const rows=records();
    const moment=rows.find(row=>row.kind!=='decision');
    $('#recentMoment').innerHTML=moment ? `<button class="recent-link" data-go="records"><span>${escape(moment.title)}</span><time>${escape(date(moment.created_at))}</time></button>` : '<p class="small muted">Your first shared moment will appear here.</p>';
    const selected=rows.filter(r=>filter==='all'||r.kind===filter||(filter==='changed'&&r.kind==='decision'&&r.teaching_evidence?.effect==='changed'));
    const open=new Set([...$('#recordList').querySelectorAll('details[open]')].map(el=>el.dataset.recordId));
    const focused=document.activeElement?.closest('[data-record-id]')?.dataset.recordId;
    $('#recordList').innerHTML=selected.length ? selected.map(r=>renderRecord(r,rows,open.has(r.id))).join('') : `<p class="empty-message">${filter==='changed'?'No choices changed by teaching in these records yet.':'No records yet.'}</p>`;
    if(focused)[...$('#recordList').children].find(el=>el.dataset.recordId===focused)?.querySelector('summary')?.focus({preventScroll:true});
  }
  function render() {
    const p=data.portfolio,price=mark(),value=accountValue(p,price),qty=Number(p?.position_qty ?? p?.quantity ?? 0),side=p?.position_side || 'FLAT';
    $('#homeEquity').textContent=money(value);
    $('#homeCash').textContent=p?money(Number(p.cash)):'—';
    $('#homeQuantity').textContent=!qty?'No position':`${qty.toFixed(6)} BTC${side==='SHORT'?' · Short':''}`;
    $('#homeHolding').textContent=!p?'—':qty ? money(value===null?null:value-Number(p.cash)) : money(0);
    $('#flyDecision').textContent=decisionLabel(data.decisions[0]);
    const cutoff=range ? Date.now()/1000-range*86400 : 0;
    const points=[...data.decisions,...(data.opening?[data.opening]:[])].filter(d=>d.created_at>=cutoff).sort((a,b)=>a.created_at-b.created_at).map(d=>({time:d.created_at,value:accountValue(d.portfolio,d.server_price)})).filter(p=>Number.isFinite(p.value));
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
    if(lastLessonId && data.lessons.some(l=>l.id===lastLessonId && l.training_applied)) $('#lessonResult').textContent='Example learned. Your fly will consider it in future decisions.';
    if(document.activeElement!==$('#companionRename input')) $('#companionRename input').value=getName()||'Fly';
    renderMarket();
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
      if(!pending)await loadChart();
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
    root.querySelectorAll('.bottom-nav button').forEach(b=>{if(b.dataset.go===(['home','records','colony'].includes(page)?page:'more'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    if(['home','vision','technical','shop'].includes(page)) {
      (page==='home'?$('#homeScene'):page==='shop'?$('#shopScene'):page==='vision'?$('#visionSlot'):$('#technicalSlot')).prepend(scene);
      onView(page==='vision'?'vision':page==='technical'?'brain':'fly');
    }
    if(page==='analysis') $('#experimentalLab').hidden=false;
    if(page==='home' || page==='records') await refresh();
    if(page==='account'){await onAccount();await shop.refresh();}
    if(page==='shop')await shop.refresh();
    if(page==='training'&&owner)await training.open();
    if(location.hash!==`#${page}`) history.pushState(null,'',`#${page}`);
    if(focus) { window.scrollTo(0,0); $(`[data-page="${page}"] h1`)?.focus({preventScroll:true}); }
  }
  function lessonControls() {
    root.querySelectorAll('[data-demonstrate]').forEach(b=>{b.disabled=!ready||busy||!pending?.context||Boolean(pending?.submitted);b.setAttribute('aria-pressed',String(b.dataset.demonstrate===pending?.action));});
    root.querySelectorAll('[data-cancel-lesson]').forEach(b=>b.disabled=busy||Boolean(pending?.submitted));
    $('#saveLesson').disabled=busy||!pending?.context||!pending?.action;
    $('#saveLesson').textContent=busy?'Saving…':pending?.submitted?'Retry saving':'Save example';
    $('#chartPoint').disabled=!ready||busy||Boolean(pending?.submitted)||!market?.candles?.length;
  }
  function renderMarket(){
    const bars=pending?.bars||displayMarket?.candles||[],selected=bars.length-1;
    const settings={...currentChartSettings(),timeframe:pending?.timeframe||currentChartSettings().timeframe},bounds=$('#teachChart').getBoundingClientRect();
    $('#teachChart').innerHTML=marketChart(bars,settings,{width:Math.max(250,bounds.width),height:Math.max(150,bounds.height),selectedTime:bars[selected]?.time,lessons:data.lessons});
    root.querySelectorAll('[data-chart-style]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.chartStyle===settings.style)));
    root.querySelectorAll('[data-chart-setting]').forEach(input=>input.checked=settings[input.dataset.chartSetting]);
    $('#marketTimeframe').value=settings.timeframe;
    $('#marketTimeframe').disabled=Boolean(pending)||busy;
    const groups=groupCandles(bars,settings.timeframe),group=selected>=0?groups.find(bar=>bar.startTime<=bars[selected].time&&bar.time>=bars[selected].time):groups.at(-1);
    $('#marketOHLC').hidden=settings.style!=='candles'||!group;
    $('#marketOHLC').innerHTML=group?['Open','High','Low','Close'].map(key=>`<span>${key} <b>${money(group[key.toLowerCase()])}</b></span>`).join(''):'';
    $('#averageNotice').hidden=!settings.average||groups.length>=20;
    $('#averageNotice').textContent='Not enough bars for MA20 at this timeframe.';
    const chosen=bars[selected>=0?selected:bars.length-1];
    $('#marketPrice').textContent=money(pending?chosen?.close:mark());
    const chartDate=chosen&&(settings.timeframe>=86400?new Date(chosen.time*1000).toLocaleDateString(locale(),{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})+' UTC':date(chosen.time));
    $('#chartTime').textContent=chosen?`${chartDate} · ${pending?'Latest teaching snapshot':displayMarket?.source||market?.source||''}`:chartLoading?'Loading prices…':'Price unavailable';
    $('.chart-caption>span:last-child').textContent='Latest point only';
    lessonControls();
  }
  function renderLesson() {
    $('#lessonPanel').hidden=!pending;
    if(pending){
      $('#lessonTitle').textContent=pending.action?`You would ${labels[pending.action].toLowerCase()} here`:'What would you do here?';
      const context=pending.context;
      $('#lessonContext').textContent=context?'This example uses the latest 40 one-minute prices and your fly’s current holdings. Your fly decides its own trades.':'Loading this chart point…';
    }
    renderMarket();
  }
  async function choosePoint(index) {
    if(busy||pending?.submitted||!ready)return;
    const bars=market?.candles||[];
    index=bars.length-1;if(!bars[index])return;
    const generation=epoch;
    busy=true; pending={candle_time:bars[index].time,bars,timeframe:60,idempotency_key:crypto.randomUUID()}; renderLesson();
    lastLessonId=null;
    $('#lessonResult').textContent='';
    try { const context=await api('/api/companion/contexts',{method:'POST',body:{}}); if(generation===epoch){pending.context=context;pending.bars=context.market.candles;pending.candle_time=context.market.candles.at(-1).time;} }
    catch(error){ if(generation===epoch){pending=null;$('#lessonResult').textContent=error.code==='CHART_POINT_UNAVAILABLE'?'That point has left the chart. Pick a newer point.':'Could not load this point. Please try again.';if(error.code==='CHART_POINT_UNAVAILABLE')await refresh(true);} }
    finally {if(generation===epoch){busy=false;renderLesson();}}
  }
  async function saveLesson() {
    if(busy||!pending?.context||!pending?.action)return;
    const generation=epoch;
    busy=true; pending.submitted=true;
    sessionStorage.setItem(storageKey('pending'),JSON.stringify(pending));
    lessonControls();
    try {
      const receipt=await api('/api/companion/lessons',{method:'POST',body:{action:pending.action,context_id:pending.context.id,idempotency_key:pending.idempotency_key}});
      if(generation!==epoch)return;
      lastLessonId=receipt.lesson.id;
      pending=null;sessionStorage.removeItem(storageKey('pending'));
      $('#lessonResult').textContent=receipt.training_applied?'Example learned. Your fly will consider it in future decisions.':'Example saved. Learning is pending and will retry automatically.';
      await refresh(true);
    } catch(error) {
      if(generation!==epoch)return;
      if(['CONTEXT_EXPIRED','CONTEXT_NOT_FOUND','CONTEXT_ALREADY_TAUGHT','INVALID_DEMONSTRATION','IDEMPOTENCY_CONFLICT'].includes(error.code)){pending=null;sessionStorage.removeItem(storageKey('pending'));$('#lessonResult').textContent='This example is no longer available. Choose again for a fresh snapshot.';}
      else $('#lessonResult').textContent='Save not confirmed. Retry the same example; it will only be recorded once.';
    } finally {if(generation===epoch){busy=false;renderLesson();}}
  }
  root.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.openRecord){filter='all';await navigate('records');root.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));renderRecords();const record=[...$('#recordList').children].find(el=>el.dataset.recordId===button.dataset.openRecord);if(record){record.open=true;record.querySelector('summary').focus({preventScroll:true});record.scrollIntoView({block:'center'});}}
    if(button.dataset.go){await navigate(button.dataset.go);if(button.hasAttribute('data-focus-teach'))$('#chartPoint').focus();if(button.hasAttribute('data-wardrobe'))document.querySelector('#wardrobeToggle')?.click();}
    if(button.dataset.range!==undefined){range=Number(button.dataset.range);root.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}
    if(button.dataset.filter){filter=button.dataset.filter;root.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderRecords();}
    if(button.dataset.demonstrate&&pending&&!pending.submitted){pending.action=button.dataset.demonstrate;renderLesson();}
    if(button.hasAttribute('data-cancel-lesson')&&!busy&&!pending?.submitted){pending=null;renderLesson();$('#chartPoint').focus();}
  });
  $('#teachChart').onclick=event=>{const bounds=$('#teachChart').getBoundingClientRect(),latestX=bounds.width-(bounds.width>=500?70:8);if(Math.abs(event.clientX-bounds.left-latestX)<=36)choosePoint();else $('#lessonResult').textContent='Only the latest point can be taught. Use Reinforcement practice for historical scenes.';};
  $('#teachChart').onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();choosePoint();}};
  $('#chartPoint').onclick=()=>choosePoint();
  $('#saveLesson').onclick=saveLesson;
  $('#flyToolsToggle').onclick=()=>{const open=$('#flyTools').hidden;$('#flyTools').hidden=!open;$('#flyToolsToggle').setAttribute('aria-expanded',String(open));};
  $('#greetFly').onclick=()=>{
    onGreet();$('#greeting').hidden=false;$('#greeting').textContent='A little company at the desk.';
    setTimeout(()=>$('#greeting').hidden=true,3500);
    if(owner){greetings=[{kind:'greeting',title:'You said hello',detail:'A shared moment at the desk. Saved on this device.',created_at:Math.floor(Date.now()/1000)},...greetings].slice(0,20);localStorage.setItem(storageKey('greetings'),JSON.stringify(greetings));renderRecords();}
  };
  $('#pauseMotion').onclick=()=>{document.querySelector('#motion').click();$('#pauseMotion').textContent=sourceText(document.querySelector('#motion')).startsWith('RESUME')?'Resume motion':'Pause motion';};
  $('#companionRename').onsubmit=async e=>{e.preventDefault();try{await onRename($('#companionRename input').value.trim());render();}catch(error){say(error.message);}};
  $('#runFly').onclick=async()=>{const b=$('#runFly');b.disabled=true;$('#flyRunMessage').textContent='Preparing…';try{await onRun();$('#flyRunMessage').textContent='';}catch(error){$('#flyRunMessage').textContent=error.message;}finally{b.disabled=false;updateRun();await refresh();}};
  function updateRun(){const status=document.querySelector('#autoStatus'),running=status.classList.contains('running')&&sourceText(status).startsWith('RUNNING');$('#runFly').textContent=running?'Pause fly':'Start fly';}
  new MutationObserver(updateRun).observe(document.querySelector('#autoStatus'),{attributes:true,childList:true});
  window.addEventListener('popstate',()=>navigate(location.hash.slice(1)||'home'));
  root.querySelector('.companion-header a').onclick=e=>{e.preventDefault();navigate('home');};
  setInterval(()=>{if(['home','holding','records'].includes(page))refresh();},30000);
  new ResizeObserver(()=>{if(page==='home')renderMarket();}).observe($('#teachChart'));
  compactChart.addEventListener('change',()=>{renderMarket();if(owner&&!pending)loadChart();});
  document.addEventListener('defly-language-change',()=>{render();renderLesson();updateRun();});
  render();
  mountLanguage(root);
  return {
    async ready(userId){
      epoch++;refreshing=null;owner=userId;ready=false;busy=false;data={portfolio:null,decisions:[],lessons:[]};market=null;displayMarket=null;chartRequest++;pending=null;lastLessonId=null;greetings=[];
      try {greetings=JSON.parse(localStorage.getItem(storageKey('greetings'))||'[]');pending=JSON.parse(sessionStorage.getItem(storageKey('pending'))||'null');}catch{/* Ignore damaged optional local history. */}
      renderLesson();render();
      await navigate(location.hash.slice(1)||'home',{focus:false});
      await Promise.allSettled([onAccount(),shop.refresh()]);
      ready=true;$('#runFly').disabled=false;lessonControls();
    },
    refresh,
    error:message=>say(message),
  };
}
