import { startScene, startVisionScene, startBrainScene } from "./scene.js?v=4";
import { createSessionClient, resolveApiOrigin } from "./session-client.js";
import { init as initRaising } from "./raising-ui.js";
import { UNAVAILABLE, verifyAnatomy } from "./neural-contract.js";
import { createBrowserBrainClient, encodeMarketObservation } from "./browser-brain-client.js";
import { routerRegistry, addRouter } from './router-registry.js';
import { createFlyIdentity } from './fly-identity.js';
let state = null,
  lastAction = null,
  scenes = {},
  tradeMarkers = [];
const $ = (s) => document.querySelector(s);
const API = resolveApiOrigin($("meta[name='defly-api-origin']")?.content, location.hostname);
const sessionClient = createSessionClient({origin: API, storage: localStorage});
const api = sessionClient.api;
function renderRouters(){if(!document.querySelector('#routerPeers'))return;const el=$("#routerPeers"),items=routers.list();if(el)el.innerHTML=items.length?items.map(p=>`<div>${p.peer_id||p.base_url} · ${p.protocol}</div>`).join(''):'NO PEER ROUTERS';const s=$("#routerStatus");if(s)s.textContent=items.length?`${items.length} PEER ROUTER${items.length>1?'S':''}`:'LOCAL ROUTER';}
const routers = routerRegistry(localStorage);
let series = [], mode = "raising", raising = null, outfit = {}, booted = false;
let anatomy = null, neuralSnapshot = null, neuralPayload = null, observationGeneration = 0;
function renderBackend(state){const el=$("#activeBackend");if(!el)return;el.textContent=({ready:'FULL BROWSER WASM',loading:'FULL BROWSER WASM · LOADING',error:'FULL BROWSER WASM · ERROR',cancelled:'FULL BROWSER WASM · STOPPED'})[state] || 'BROWSER ACTIVITY UNAVAILABLE';}
function initRouterControls(){if(!document.querySelector('#routerPeers'))return;renderRouters();$("#routerConnect")?.addEventListener('click',async()=>{const input=$("#routerUrl"),status=$("#routerStatus");try{status.textContent='CONNECTING...';await addRouter({base_url:input.value},routers);input.value='';renderRouters();status.textContent='CONNECTED';}catch(e){status.textContent=`FAILED · ${e.message}`;}});}
function initRouterAndIdentity(){initRouterControls();if(document.querySelector('#flyIdentity'))createFlyIdentity(localStorage,{genesis_model_hash:'full-browser-model'}).then(identity=>{const el=$("#flyIdentity");if(el)el.textContent=identity.fly_id.slice(0,16)+'…';}).catch(error=>{const el=$("#flyIdentity");if(el)el.textContent='UNAVAILABLE';const s=$("#flyIdentityStatus");if(s)s.textContent=error.message;});}
const browserBrain = createBrowserBrainClient({
  onStatus(status) {
    renderBackend(status.state);
    $("#brainRuntimeStatus").textContent = status.state === 'loading'
      ? `PREPARING FULL BROWSER BRAIN · ${status.loaded || 0} / ${status.total || '…'} bytes`
      : status.state === 'ready' ? `FULL BROWSER BRAIN READY · ${status.scope === 'autonomy' ? 'AUTONOMOUS PAPER · FRESH SESSION WEIGHTS' : 'OBSERVATION ONLY'}` : `BROWSER BRAIN ${status.state.toUpperCase()} · ${status.message || ''}`;
    $("#brainCancel").hidden = !['loading','ready'].includes(status.state);
    $("#brainRetry").hidden = ['loading','ready'].includes(status.state);
    if (['cancelled','error'].includes(status.state)) { neuralPayload = null; renderNeural(); }
  },
  onActivity(payload, frame) {
    if (!neuralSnapshot || frame.snapshot_hash !== neuralSnapshot.snapshot_hash || frame.frame_hash !== neuralSnapshot.frame_hash) return;
    neuralPayload = payload; renderNeural();
  },
});
async function observeBrowser(source, historical = false) {
  if (browserBrain.scope === 'autonomy') return;
  const generation = ++observationGeneration;
  neuralSnapshot = null; neuralPayload = null; renderNeural();
  try {
    const frame = await encodeMarketObservation(source, historical);
    if (generation !== observationGeneration) return;
    neuralSnapshot = frame;
    const canvas = $("#brainInput"), ctx = canvas.getContext('2d'), image = ctx.createImageData(frame.width, frame.height);
    for (let i = 0; i < frame.rgb.length / 3; i++) { image.data[i*4] = frame.rgb[i*3]; image.data[i*4+1] = frame.rgb[i*3+1]; image.data[i*4+2] = frame.rgb[i*3+2]; image.data[i*4+3] = 255; }
    ctx.putImageData(image, 0, 0);
    $("#brainInputIdentity").textContent = `${frame.encoder_version} · ${frame.width}×${frame.height} RGB · ${historical ? 'HISTORICAL' : 'CURRENT'} · snapshot ${frame.snapshot_hash?.slice(0,12)} · pixels ${frame.frame_hash.slice(0,12)}`;
    browserBrain.observe(frame);
  } catch (error) { $("#brainRuntimeStatus").textContent = 'OBSERVATION UNAVAILABLE · ' + error.message; }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && autoRunning) stopAuto().catch(console.error);
  else if (!document.hidden) {
    if (!browserBrain.ready && anatomy) browserBrain.start(anatomy.nodes.map(n => n.id), 'observation');
    browserBrain.resume();
    if (mode === 'lab' && !autoRunning) refreshObservation();
    else if (mode === 'raising' && raising?.state.session) observeBrowser(raising.state.session, true);
  }
});
$("#brainCancel").onclick = () => { if(autoRunning) stopAuto().catch(console.error); else browserBrain.cancel(); };
$("#brainRetry").onclick = () => { browserBrain.start(anatomy?.nodes.map(n => n.id) || []); if (neuralSnapshot) browserBrain.observe(neuralSnapshot); };
function resizeScene() {
  for (const [k, c] of Object.entries({
    fly: $("#flyScene"),
    vision: $("#visionScene"),
    brain: $("#brainScene"),
  }))
    c.hidden = k !== current;
  $("#sceneTitle").textContent = {
    fly: "■ FLY.EXE",
    vision: "■ RETINAL.INPUT",
    brain: "■ BRAIN.EXE",
  }[current];
  $("#anatomyStatus").hidden = current !== "brain";
}
let current = "fly";
function changeView(v) {
  current = v;
  if (v === 'brain' && !anatomy) { $("#brainScene").dataset.nodeCount = '0'; $("#anatomyStatus").textContent = 'ANATOMY UNAVAILABLE'; }
  resizeScene();
  for (const [k, scene] of Object.entries(scenes)) {
    scene.setVisible?.(k === current);
  }
  if (!scenes[v]) {
    if (v === 'brain' && !anatomy) $("#brainScene").dataset.nodeCount = '0';
    try {
      scenes[v] =
        v === "fly"
          ? startScene($("#flyScene"), series)
          : v === "vision"
            ? startVisionScene($("#visionScene"), series)
            : startBrainScene($("#brainScene"), anatomy);
    } catch (e) {
      $("#sceneFallback").hidden = false;
      $("#sceneFallback").textContent = "3D ERROR · " + e.message;
      if (v === 'brain' && !anatomy) $("#brainScene").dataset.nodeCount = '0';
      console.error("DEFLY_SCENE_INIT", v, e);
    }
  }
}
async function boot(reset = false) {
  initRouterAndIdentity();
  changeView("fly");
  const saved = reset ? await sessionClient.reset() : await sessionClient.restore();
  state = saved.portfolio;
  const ownerToken=localStorage.getItem(`defly.session:${API}`);
  browserBrain.setCheckpointKey(ownerToken ? await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ownerToken)).then(b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('')) : null);
  // A reopened historical desk must not leave an earlier server run unattended.
  await stopAuto();
  if (anatomy) browserBrain.start(anatomy.nodes.map(n => n.id), 'observation');
  $("#sessionRecovery").hidden = true;
  raising = await initRaising({api,
    onOutfit: loadout => { outfit = loadout; scenes.fly?.setOutfit?.(loadout); },
    onMode: exitLab,
    onObservation: applyRaisingObservation,
    onAction: (action, eventId) => scenes.fly?.playAction?.(action, eventId),
  });
  if (!raising.state.session) renderState();
  $("#notice").textContent = "RAISING DESK · PAPER ONLY";
  drawMarket();
  if (!booted) { setInterval(renderNeural, 1000); setInterval(refreshObservation, 10000); booted = true; }
}
function applyRaisingObservation(s) {
  observeBrowser(s, true);
  tradeMarkers = [];
  series = (s.bars || []).map(bar => bar.close);
  drawMarket();
  scenes.fly?.updateMarket?.(series);
  scenes.vision?.updateMarket?.(series);
  $("#chartSymbol").textContent = s.symbol || "MARKET";
  $("#price").textContent = series.length ? "$" + Number(series.at(-1)).toFixed(2) : "—";
  $("#chartSource").textContent = "HISTORICAL · " + (s.provenance?.provider || "SERVER");
  // Teaching mode does not change the neural runtime identity.
  $("#neuralOrder").textContent = s.status === "ACTIVE" ? "YOUR DECISION" : "ROUND COMPLETE";
  $("#neuralReason").textContent = `CLOSED BARS · STEP ${s.step} · ${s.observation_hash?.slice(0,10) || ""}`;
  const a = s.account;
  if (a) {
    $("#cash").textContent = "$" + Number(a.cash).toFixed(2);
    $("#equity").textContent = "$" + Number(a.equity).toFixed(2);
    $("#qty").textContent = Number(a.quantity).toFixed(6);
    $("#side").textContent = a.side;
    $("#avg").textContent = "$" + Number(a.entry_price).toFixed(2);
  }
}
async function refreshObservation() {
  if (mode !== "lab" || autoRunning || autoInFlight) return;
  try {
    await applyObservation(await api("/api/observation"));
  } catch (e) {
    console.warn("OBSERVATION_REFRESH", e.message);
  }
}
async function applyObservation(o) {
  if (mode !== "lab") return;
  if (!o?.candles?.length) return;
  observeBrowser(o);
  $("#chartSource").textContent = "LIVE · KRAKEN MARKET";
  series = o.candles.map((x) => x.close);
  drawMarket();
  scenes.fly?.updateMarket?.(series);
  scenes.vision?.updateMarket?.(series);
  $("#price").textContent =
    "$" + series.at(-1).toLocaleString(undefined, { maximumFractionDigits: 0 });
  // Market snapshot metadata is not the neural runtime backend.
  $("#neuralReason").textContent =
    `${o.truth_status} · snapshot ${o.snapshot_hash.slice(0, 10)}…`;
}
function renderState() {
  if (!state) return;
  $("#cash").textContent = "$" + Number(state.cash).toFixed(2);
  $("#qty").textContent =
    Number(state.position_qty ?? state.quantity ?? 0).toFixed(6) + " BTC";
  $("#side").textContent =
    state.position_side || (Number(state.quantity) > 0 ? "LONG" : "FLAT");
  $("#avg").textContent = "$" + Number(state.avg_cost).toFixed(2);
  const mark = Number(series.at(-1) || state.entry_price || 0),
    side = state.position_side || "FLAT",
    q = Number(state.position_qty ?? state.quantity ?? 0),
    entry = Number(state.entry_price || state.avg_cost || mark);
  const equity =
    side === "LONG"
      ? Number(state.cash) + q * mark
      : side === "SHORT"
        ? Number(state.cash) + q * (entry - mark) + q * entry
        : Number(state.cash);
  $("#equity").textContent = "$" + equity.toFixed(2);
}
async function act(action) {
  try {
    $("#notice").textContent = "SUBMITTING…";
    const d = await api("/api/decision", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { action, symbol: "BTCUSDT" },
    });
    lastAction = action;
    state = d.state;
    renderState();
    tradeMarkers.push({
      action,
      price: Number(d.server_price || series.at(-1)),
      index: series.length - 1,
    });
    if (d.server_price) {
      series.push(Number(d.server_price));
      series.shift();
    }
    drawMarket();
    model.postMessage({ type: "observe", series });
    $("#notice").textContent = `${action} RECORDED · SERVER-AUTHORITATIVE`;
  } catch (e) {
    $("#notice").textContent = "FAILED · " + e.message;
  }
}
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-view]")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      changeView(b.dataset.view);
    }),
);
document
  .querySelectorAll("[data-action]")
  .forEach((b) => (b.onclick = () => act(b.dataset.action)));
$("#motion").onclick = () => {
  const s = scenes[current];
  if (!s?.setPaused) return;
  const p = !s.isPaused();
  s.setPaused(p);
  $("#motion").textContent = p ? "RESUME MOTION" : "PAUSE MOTION";
};
let autoTimer = null,
  autoRunning = false, autoEpoch = 0, autoInFlight = false;
async function refreshLearning() {
  const d = await api("/api/learning");
  $("#modelVersion").textContent = "v" + d.policy.version;
  $("#synapsesChanged").textContent =
    d.policy.plasticity?.changed_synapses || 0;
  $("#plasticityHash").textContent = d.policy.plasticity_hash
    ? d.policy.plasticity_hash.slice(0, 10) + "…"
    : "—";
  $("#learningEvidence").textContent = d.learned
    ? `LEARNED：${d.policy.updates} updates · ${d.policy.corrections} corrections · hash ${d.policy.hash.slice(0, 10)}…`
    : "The fly has not updated its policy through reinforcement or correction yet.";
  if (d.events?.[0]) {
    const e = d.events[0];
    $("#lastReward").textContent =
      e.kind === "REWARD"
        ? `PROFIT REWARD +${Number(e.reward).toFixed(4)}`
        : e.kind === "PUNISHMENT"
          ? `LOSS PENALTY ${Number(e.reward).toFixed(4)}`
          : `HUMAN CORRECTION ${e.source_action}→${e.corrected_action}`;
  }
}
async function autoStep() {
  if (mode !== "lab" || !autoRunning || autoInFlight || document.hidden) return;
  const epoch = autoEpoch; autoInFlight = true;
  try {
  const prepared = await api('/api/autonomy/prepare', {method:'POST', body:{}});
  if (!autoRunning || epoch !== autoEpoch || document.hidden) return;
  series = prepared.observation.candles.map(bar => bar.close);
  drawMarket(); scenes.fly?.updateMarket?.(series); scenes.vision?.updateMarket?.(series);
  $("#chartSymbol").textContent = 'BTCUSD';
  $("#chartSource").textContent = 'LIVE · KRAKEN MARKET';
  const frame = await encodeMarketObservation(prepared.observation);
  frame.observed_at = prepared.challenge.observed_at < 1e12 ? prepared.challenge.observed_at * 1000 : prepared.challenge.observed_at;
  neuralSnapshot = frame; neuralPayload = null;
  const canvas = $("#brainInput"), ctx = canvas.getContext('2d'), image = ctx.createImageData(frame.width, frame.height);
  for(let i=0;i<frame.rgb.length/3;i++){image.data.set([...frame.rgb.subarray(i*3,i*3+3),255],i*4);} ctx.putImageData(image,0,0);
  $("#brainInputIdentity").textContent = `${frame.encoder_version} · ${frame.width}×${frame.height} RGB · AUTONOMOUS · snapshot ${frame.snapshot_hash.slice(0,12)} · pixels ${frame.frame_hash.slice(0,12)}`;
  const payload = await browserBrain.infer(frame);
  if (!autoRunning || epoch !== autoEpoch || document.hidden || mode !== 'lab') return;
  const sideBefore = prepared.portfolio.position_side || 'FLAT', direction = payload.decoder.proposed_action;
  const proposed_action = direction === 'HOLD' ? 'HOLD' : sideBefore === 'FLAT' ? direction : ((sideBefore === 'LONG' && direction === 'SELL') || (sideBefore === 'SHORT' && direction === 'BUY')) ? 'CLOSE' : 'HOLD';
  const d = await api('/api/autonomy/step', {method:'POST', body:{challenge_id:prepared.challenge_id, neural:{...payload,symbol:prepared.challenge.symbol,source:prepared.challenge.source,proposed_action}}});
  if (!autoRunning || epoch !== autoEpoch || mode !== 'lab') return;
  state = d.portfolio;
  renderState();
  lastAction = d.executed_action;
  scenes.fly?.playAction?.(d.executed_action, `autonomous:${d.run_id}:${d.step}`);
  tradeMarkers.push({
    action: d.executed_action,
    price: Number(d.market_price || series.at(-1)),
    index: series.length - 1,
  });
  const side = d.portfolio?.position_side || "FLAT",
    isFlat = side === "FLAT";
  $("#neuralOrder").textContent =
    d.executed_action === "HOLD"
      ? isFlat
        ? "AWAITING SIGNAL"
        : `HOLD ${side}`
      : d.executed_action === "CLOSE"
        ? "CLOSE POSITION"
        : `${d.executed_action} ${side}`;
  $("#neuralReason").textContent =
    d.executed_action === "HOLD"
      ? isFlat
        ? "No position · evaluating LONG or SHORT entry"
        : `${side} position active · awaiting close signal`
      : `AUTONOMOUS STEP ${d.step} · FULL NEURAL DECODER`;
  $("#lastReward").textContent =
    d.reward.kind === "REWARD"
      ? `PROFIT REWARD +${d.reward.value.toFixed(4)}`
      : d.reward.kind === "PUNISHMENT"
        ? `LOSS PENALTY ${d.reward.value.toFixed(4)}`
        : "AWAITING NEXT EVALUATION";
  $("#modelVersion").textContent = d.learning?.version ?? 'FULL WASM';
  $("#learningEvidence").textContent = `FULL NEURAL · proposed ${payload.decoder.proposed_action} · executed ${d.executed_action} · memory ${payload.memory_hash.slice(0,12)}`;
  if (d.reward && ['REWARD','PUNISHMENT'].includes(d.reward.kind)) {
    const learned = await browserBrain.reinforce(frame, d.reward);
    $("#plasticityHash").textContent = learned.memory_hash.slice(0,12);
    $("#learningEvidence").textContent = `ORIGINAL CIRCUIT ${learned.reinforcement} · ${learned.stimulus_ms}ms · memory ${learned.memory_hash.slice(0,12)} · session only`;
  }
  if (d.market_price) {
    series.push(d.market_price);
    series.shift();
    drawMarket();
  }
  } finally { autoInFlight = false; }
}
async function startAuto(single = false) {
  if (mode !== "lab") return;
  const epoch = ++autoEpoch;
  browserBrain.start(anatomy?.nodes.map(n => n.id) || [], 'autonomy');
  $("#learningEvidence").textContent = 'RESET TO ORIGINAL WEIGHTS · AUTONOMOUS SESSION ONLY';
  try {
    await browserBrain.waitReady();
  if (epoch !== autoEpoch || mode !== 'lab' || document.hidden) return;
  await api("/api/autonomy/start", { method: "POST", body: {backend:'stonkfly-full-browser-wasm-v1'} });
  if (mode !== "lab") { await stopAuto(); return; }
  autoRunning = true;
  $("#autoStatus").textContent = "RUNNING · NEXT STEP IN 10S";
  $("#autoStatus").classList.add("running");
  $("#autoToggle").textContent = "STOP AUTONOMOUS FLY";
  $("#autoToggle").disabled = false;
  await autoStep();
  if (single) { await stopAuto(); return; }
  if (mode !== "lab" || !autoRunning) return;
  autoTimer = setInterval(
    () =>
      autoStep().catch((e) => {
        $("#learningEvidence").textContent =
          "AUTONOMOUS STEP FAILED: " + e.message;
      }),
    10000,
  );
  } catch (e) {
    autoRunning = false;
    $("#autoStatus").textContent = "START FAILED · " + e.message;
    $("#learningEvidence").textContent = "AUTONOMOUS START FAILED · " + e.message;
    throw e;
  }
}
async function stopAuto() {
  ++autoEpoch; autoRunning = false; browserBrain.cancel();
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
  await api("/api/autonomy/stop", { method: "POST", body: {} });
  $("#autoStatus").textContent = "STOPPED";
  $("#autoStatus").classList.remove("running");
  $("#autoToggle").textContent = "START AUTONOMOUS FLY";
  if (anatomy && !document.hidden) {
    browserBrain.start(anatomy.nodes.map(n => n.id), 'observation');
    if (mode === 'lab') await refreshObservation();
  }
}
async function runAutonomy(task) {
  if (modeBusy || mode !== "lab") return;
  modeBusy = true;
  for (const id of ['historicalMode','autonomousMode','autoToggle','autoStep']) $("#"+id).disabled = true;
  try { await task(); }
  catch(error) { $("#notice").textContent = "AUTONOMY FAILED · " + error.message; }
  finally {
    modeBusy = false;
    for (const id of ['historicalMode','autonomousMode','autoToggle','autoStep']) $("#"+id).disabled = false;
  }
}
$("#autoToggle").onclick = () => autoRunning ? stopAuto().catch(console.error) : runAutonomy(() => startAuto());
$("#autoStep").onclick = () => runAutonomy(() => autoRunning ? autoStep() : startAuto(true));
document.querySelectorAll("[data-correct]").forEach(
  (b) =>
    (b.onclick = () => runAutonomy(async () => {
      const d = await api("/api/correct", {
        method: "POST",
        body: { action: b.dataset.correct },
      });
      $("#modelVersion").textContent = "v" + d.learning.version;
      $("#lastReward").textContent =
        `HUMAN CORRECTION ${d.source_action}→${d.corrected_action}`;
      $("#learningEvidence").textContent =
        `LEARNEDHUMAN CORRECTION · policy ${d.learning.policy_hash.slice(0, 10)}…`;
    })), 
);
$("#openPoly").onclick = async () => {
  $("#poly").hidden = false;
  await loadMarkets();
  $("#poly").scrollIntoView({ behavior: "smooth" });
};
$("#closePoly").onclick = () => {
  $("#poly").hidden = true;
  scrollTo({ top: 0, behavior: "smooth" });
};
async function loadMarkets() {
  const box = $("#markets");
  box.innerHTML = "<p>LOADING PUBLIC MARKETS…</p>";
  try {
    const d = await api("/api/predictions");
    box.innerHTML = d.markets
      .map(
        (m) =>
          `<article class="market"><h3>${esc(m.question)}</h3><div class="prob"><span>YES <b>${pct(m.yes)}</b></span><span>NO <b>${pct(m.no)}</b></span></div><div class="market-meta"><span>VOL $${compact(m.volume)}</span><span>${new Date(m.end_date).toLocaleDateString()}</span></div><div class="market-actions"><button data-predict="YES" data-id="${esc(m.id)}">YES</button><button data-predict="NO" data-id="${esc(m.id)}">NO</button></div></article>`,
      )
      .join("");
    box
      .querySelectorAll("[data-predict]")
      .forEach(
        (b) => (b.onclick = () => predict(b.dataset.id, b.dataset.predict)),
      );
  } catch (e) {
    box.innerHTML = "<p>POLYMARKET UNAVAILABLE · " + esc(e.message) + "</p>";
  }
}
async function predict(market_id, action) {
  await api("/api/predict", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: { market_id, action },
  });
  alert(`SIMULATED PREDICTION ${action} RECORDED. AWAITING PUBLIC RESOLUTION.`);
}
function drawMarket() {
  const c = $("#chart"),
    x = c.getContext("2d"),
    w = c.width,
    h = c.height,
    mn = Math.min(...series),
    mx = Math.max(...series);
  x.fillStyle = "#101213";
  x.fillRect(0, 0, w, h);
  if (!series.length) {
    x.fillStyle = "#989aaa";
    x.font = "12px Mono,monospace";
    x.fillText("AWAITING HISTORICAL MARKET DATA", 20, h / 2);
    $("#price").textContent = "—";
    return;
  }
  x.strokeStyle = "#303536";
  for (let i = 1; i < 6; i++) {
    x.beginPath();
    x.moveTo(0, (h * i) / 6);
    x.lineTo(w, (h * i) / 6);
    x.stroke();
  }
  x.beginPath();
  series.forEach((v, i) => {
    const px = (i * w) / (series.length - 1),
      py = h - 20 - ((v - mn) / (mx - mn || 1)) * (h - 40);
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  });
  x.strokeStyle = "#bdff32";
  x.lineWidth = 3;
  x.stroke();
  tradeMarkers.slice(-24).forEach((m) => {
    const i = Math.max(0, Math.min(series.length - 1, m.index)),
      px = (i * w) / Math.max(1, series.length - 1),
      py = h - 20 - ((series[i] - mn) / (mx - mn)) * (h - 40),
      buy = m.action === "BUY";
    x.fillStyle = buy ? "#63d6ff" : "#ff4b78";
    x.beginPath();
    x.arc(px, py, 7, 0, Math.PI * 2);
    x.fill();
    x.font = "700 18px Mono,monospace";
    x.fillText(buy ? "B" : "S", px + 9, py + (buy ? -9 : 18));
  });
  $("#price").textContent =
    "$" + series.at(-1).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function renderNeural() {
  const result = browserBrain.validate(neuralPayload, {snapshot:neuralSnapshot, anatomy});
  scenes.brain?.update(result.available ? result.activity : null);
  $("#neuralTruth").textContent = result.available ? `VERIFIED BROWSER WASM ACTIVITY · ${result.historical ? 'HISTORICAL TEACHING SNAPSHOT' : 'CURRENT MARKET SNAPSHOT'} · ${result.totalSpikes} sampled events` : UNAVAILABLE + ' · waiting for browser inference';
  // Runtime identity is separate from per-frame activity freshness.
  if (result.available) renderBackend('ready');
  if (anatomy) $("#anatomyStatus").textContent = `${anatomy.source} · ${anatomy.nodes.length.toLocaleString()} displayed sample nodes · ${result.available ? 'verified browser activity' : 'anatomy only'}`;
  $("#neuralTruth").dataset.reason = result.reason || 'verified';
  $("#spikes").textContent = result.available ? String(result.fullTotalSpikes ?? result.totalSpikes) : '—';
  $("#brainTime").textContent = result.available ? result.activity.simulated_ms + ' ms' : '—';
  const decoder = result.available ? neuralPayload.decoder : null;
  for (const [id, key] of [['leftHz','left_hz'],['rightHz','right_hz'],['diffHz','difference_hz']]) {
    const value = decoder?.[key] ?? decoder?.inputs?.[key];
    $('#'+id).textContent = Number.isFinite(value) ? value.toFixed(2) + ' Hz' : '—';
  }
  const canvas = $("#brainActivity"), context = canvas.getContext('2d');
  context.clearRect(0,0,canvas.width,canvas.height);
  context.fillStyle = '#989aaa'; context.font = '16px monospace';
  context.fillText(result.available ? 'VERIFIED EVENTS / NODE ID ORDER' : 'NEURAL ACTIVITY UNAVAILABLE',18,30);
  if (result.available) {
    const counts = result.activity.event_counts, max = counts.reduce((m,n)=>Math.max(m,n),1);
    context.fillStyle = '#63d6ff';
    counts.forEach((n,i)=>context.fillRect(i*canvas.width/counts.length,canvas.height-n/max*180,Math.max(1,canvas.width/counts.length),n/max*180));
  }
}
async function loadAnatomy() {
  try {
    const response = await fetch('/neural-anatomy.json');
    if (!response.ok) throw Error('asset unavailable');
    anatomy = await verifyAnatomy(await response.json());
    if (!anatomy) throw Error('asset integrity failed');
    scenes.brain?.setAnatomy(anatomy);
    browserBrain.start(anatomy.nodes.map(n => n.id));
    $("#neurons").textContent = (166700).toLocaleString();
    $("#anatomyStatus").textContent = `ANATOMY ONLY · ${anatomy.source} · ${anatomy.nodes.length.toLocaleString()} displayed nodes · no live activity`;
  } catch { $("#anatomyStatus").textContent = 'ANATOMY UNAVAILABLE'; }
  renderNeural();
}
let ninexToken = "";
async function load99xArea() {
  const [m, l] = await Promise.all([
    api("/api/99x/markets"),
    api("/api/99x/leaderboard"),
  ]);
  $("#ninexMarkets").innerHTML = (m.markets || [])
    .map((x) => `<span>${esc(x.pair || x.symbol)}</span>`)
    .join("");
  $("#ninexLeaderboard").innerHTML =
    "<h3>PUBLIC LEADERBOARD</h3>" +
    ((l.entries || [])
      .slice(0, 10)
      .map(
        (x) =>
          `<p><b>#${x.rank}</b><span>${esc(x.nickname)}</span><em>${Number(x.returnPct || 0).toFixed(2)}%</em></p>`,
      )
      .join("") || "<p>NO ENTRIES YET</p>");
}
$("#open99x").onclick = async () => {
  $("#arena99x").hidden = false;
  await load99xArea().catch(
    (e) => ($("#ninexStatus").textContent = "ARENA API: " + e.message),
  );
  $("#arena99x").scrollIntoView({ behavior: "smooth" });
};
$("#close99x").onclick = () => {
  $("#arena99x").hidden = true;
  scrollTo({ top: 0, behavior: "smooth" });
};
$("#ninexJoin").onclick = async () => {
  const nickname = $("#ninexUsername").value.trim();
  if (!nickname || !$("#ninexConsent").checked) {
    $("#ninexStatus").textContent =
      "ENTER A NAME AND ACCEPT THE CONSENT CHECKBOX.";
    return;
  }
  const d = await api("/api/99x/session", {
    method: "POST",
    body: { nickname },
  });
  ninexToken = d.token;
  $("#ninexStatus").textContent =
    `JOINED AS ${d.user.nickname} · 10,000 99X PAPER BALANCE`;
  await load99xArea();
};
const model = new Worker("model-worker.js?v=4", { type: "module" });
model.onmessage = (e) => {
  if (mode !== "lab") return;
  $("#neuralOrder").textContent =
    e.data.action === "HOLD" && Number(state?.quantity || 0) === 0
      ? "AWAITING FIRST SIGNAL"
      : e.data.action + " BTC";
  $("#neuralReason").textContent =
    e.data.action === "HOLD" && Number(state?.quantity || 0) === 0
      ? "No position is held · waiting for an actionable signal"
      : Math.round(e.data.confidence * 100) + "% browser debug confidence";
};
const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  pct = (n) => (Number(n) * 100).toFixed(1) + "%",
  compact = (n) =>
    Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Number(n) || 0);
function bootError(error) {
  $("#notice").textContent = "RESTORE FAILED · " + error.message;
  $("#sessionRecovery").hidden = false;
  $("#resetSession").hidden = error.code !== "SESSION_RESET_REQUIRED";
}
$("#retrySession").onclick = () => boot().catch(bootError);
$("#resetSession").onclick = () => {
  if (confirm("Start a new fly? The saved session token will be replaced on this browser.")) boot(true).catch(bootError);
};
let modeBusy = false;
function renderMode() {
  const lab = mode === "lab";
  $("#historicalMode").setAttribute("aria-pressed", String(!lab));
  $("#autonomousMode").setAttribute("aria-pressed", String(lab));
  $("#raisingRoot").hidden = lab;
  $("#experimentalLab").hidden = !lab;
  $("#labControls").hidden = !lab;
  $("#modeStatus").textContent = lab ? "LIVE PAPER · EXPLICIT START REQUIRED" : "HISTORICAL · HUMAN DECISIONS";
  const terminal = $(".terminal");
  if (lab) $("#experimentalLab").prepend(terminal);
  else if ($("#raisingTeach")) $("#raisingTeach").insertBefore(terminal, $(".teach-actions"));
}
async function exitLab() {
  if (mode === "lab" || autoRunning) await stopAuto();
  mode = "raising";
  observationGeneration++; neuralSnapshot = null; neuralPayload = null; renderNeural();
  renderMode();
}
async function switchMode(next) {
  if (modeBusy || next === mode || !raising) return;
  modeBusy = true;
  $("#historicalMode").disabled = $("#autonomousMode").disabled = true;
  try {
    if (next === "lab") {
      mode = "lab";
      if (!browserBrain.ready || browserBrain.scope !== 'observation') browserBrain.start(anatomy?.nodes.map(n => n.id) || [], 'observation');
      observationGeneration++; neuralSnapshot = null; neuralPayload = null; renderNeural();
      series = []; tradeMarkers = []; lastAction = null;
      renderMode(); drawMarket();
      $("#chartSymbol").textContent = "BTCUSDT";
      $("#chartSource").textContent = "LIVE · LOADING";
      $("#neuralOrder").textContent = "AUTONOMY STOPPED";
      await refreshObservation();
      renderState();
      await refreshLearning();
    } else {
      await exitLab();
      if (raising.state.session) applyRaisingObservation(raising.state.session);
    }
  } catch(error) { $("#notice").textContent = "MODE FAILED · " + error.message; }
  finally {
    modeBusy = false;
    $("#historicalMode").disabled = $("#autonomousMode").disabled = false;
  }
}
$("#historicalMode").onclick = () => switchMode("raising");
$("#autonomousMode").onclick = () => switchMode("lab");
renderNeural();
loadAnatomy();
boot().catch(bootError);
