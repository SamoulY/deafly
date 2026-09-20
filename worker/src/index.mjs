import { BROWSER_BACKEND, PINNED_MANIFEST, browserRun, prepareBrowser, stepBrowser } from "./browser-autonomy.mjs";
import { fetchMarket, canonicalSymbol, marketSource } from "./market.mjs";
import { federation } from "./federation.mjs";
import { NINEX_MARKETS } from "./core.mjs";
import { handleRaising } from "./raising.mjs";
import { handleRaisingTraining, runTrainingJobs } from "./raising-training-service.mjs";
import {
  buyFill,
  sellFill,
  parsePolymarketMarket,
  accountEquity,
} from "./core.mjs";
import {
  defaultPolicy,
  features,
  chooseAction,
  reinforce,
  correctPolicy,
  policyHash,
  rewardFromEquity,
  applyPlasticity,
  plasticityHash,
} from "./learning.mjs";
const CORS={"access-control-allow-origin":"*","access-control-allow-headers":"content-type,x-session-token,idempotency-key","access-control-allow-methods":"GET,POST,OPTIONS"};
const json = (x, s = 200) =>
  new Response(JSON.stringify(x), {
    status: s,
    headers: {
      "content-type": "application/json",
      ...CORS,
      "cache-control": "no-store",
    },
  });
const now = () => Math.floor(Date.now() / 1000),
  id = () => crypto.randomUUID();
async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function auth(r, e) {
  const t = r.headers.get("X-Session-Token");
  return t
    ? e.DB.prepare("SELECT * FROM users WHERE token_hash=?")
        .bind(await sha(t))
        .first()
    : null;
}
async function marketFetch(symbol="BTCUSDT", e={}) {
  return (await fetchMarket(symbol,e)).bars;
}
async function priceSeries(e={},symbol="BTCUSDT") {
  return (await marketFetch(symbol,e)).slice(-20).map(x=>Number(x.close)).filter(x=>x>0);
}
async function mark(e={},symbol="BTCUSDT") {
  const p = await priceSeries(e,symbol),
    n = p.at(-1);
  if (!(n > 0)) throw Error("MARKET_INVALID");
  return n;
}
async function observation(e={}) {
  const live = await fetchMarket("BTCUSD", e), normalized = live.bars.slice(-40);
  const snapshot_hash = await sha(JSON.stringify(normalized)),
    frame_hash = await sha("vision-v2:" + snapshot_hash);
  return {
    backend: "market-snapshot-v1",
    truth_status: "market_input_only",
    symbol: live.symbol,
    source: live.source,
    candles: normalized,
    snapshot_hash,
    frame_hash,
    observed_at: now(),
    provenance: marketSource(live), model: {
      neurons_displayed: 560,
      full_kernel_verified_locally: true,
      full_kernel_active: false,
      full_kernel_neurons: 166700,
      full_kernel_edges: 25582938,
      plastic_edges: 7835,
    },
  };
}
const NATIVE_MAX_AGE_MS = 120000;
const NATIVE_HASH_FIELDS = ["manifest_hash", "checkpoint_hash", "memory_hash", "snapshot_hash", "frame_hash"];
// This table is global: only explicitly public market telemetry may enter it.
// Runner authentication is the trust boundary; shape checks do not attest execution.
async function validateNative(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return "INVALID_NATIVE_PAYLOAD";
  if (b.scope !== "public_market") return "PUBLIC_MARKET_SCOPE_REQUIRED";
  if (b.backend !== "stonkfly-full-native-v1" || b.neurons !== 166700 ||
      b.edges !== 25582938 || b.plastic_edges !== 7835) return "FULL_KERNEL_MANIFEST_MISMATCH";
  for (const k of NATIVE_HASH_FIELDS)
    if (typeof b[k] !== "string" || !/^[a-fA-F0-9]{64}$/.test(b[k])) return "INVALID_" + k.toUpperCase();
  const age = Date.now() - b.observed_at;
  if (!Number.isSafeInteger(b.observed_at) || age < 0 || age > NATIVE_MAX_AGE_MS)
    return "INVALID_NATIVE_FRESHNESS";
  const a = b.activity;
  if (!a || !Array.isArray(a.node_ids) || !Array.isArray(a.event_counts) ||
      !a.node_ids.length || a.node_ids.length > b.neurons || a.node_ids.length !== a.event_counts.length ||
      !a.node_ids.every(x => typeof x === "string" && x.length <= 128 && x.trim() === x && x.length > 0) ||
      new Set(a.node_ids).size !== a.node_ids.length ||
      !a.event_counts.every(x => Number.isSafeInteger(x) && x >= 0) ||
      !Number.isSafeInteger(a.total_events) || a.total_events < 0 ||
      a.event_counts.reduce((sum, x) => sum + x, 0) !== a.total_events ||
      !Number.isFinite(a.simulated_ms) || a.simulated_ms <= 0) return "INVALID_NATIVE_ACTIVITY";
  if (b.symbol !== "BTCUSD" || !["kraken-public","okx-public","binance-public"].includes(b.source) ||
      !Array.isArray(b.candles) || !b.candles.length || b.candles.length > 40 ||
      !b.candles.every(c => c && ["time", "open", "high", "low", "close", "volume"].every(k => Number.isFinite(c[k])) &&
        c.time > 0 && c.open > 0 && c.close > 0 && c.low > 0 && c.volume >= 0 &&
        c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close)))
    return "INVALID_NATIVE_OBSERVATION";
  const candles = nativeCandles(b);
  const snapshot = await sha(JSON.stringify(candles));
  if (snapshot !== b.snapshot_hash.toLowerCase() ||
      await sha("vision-v2:" + snapshot) !== b.frame_hash.toLowerCase()) return "NATIVE_OBSERVATION_HASH_MISMATCH";
  return null;
}
function nativeCandles(b) {
  return b.candles.map(({time, open, high, low, close, volume}) => ({time, open, high, low, close, volume}));
}
function nativePayload(b) {
  // Never spread runner payloads: private learning data must not leak globally.
  return {
    scope: "public_market", backend: b.backend, truth_status: "real_full_kernel",
    neurons: b.neurons, edges: b.edges, plastic_edges: b.plastic_edges,
    ...Object.fromEntries(NATIVE_HASH_FIELDS.map(k => [k, b[k].toLowerCase()])),
    observed_at: b.observed_at, symbol: b.symbol, source: b.source, candles: nativeCandles(b),
    activity: {node_ids: b.activity.node_ids, event_counts: b.activity.event_counts,
      simulated_ms: b.activity.simulated_ms, total_events: b.activity.total_events},
    created_at: b.created_at,
  };
}
async function published(e) {
  const row = await e.DB.prepare(
    "SELECT * FROM published_observations ORDER BY created_at DESC LIMIT 1",
  ).first();
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload_json);
    return await validateNative(payload) ? null : nativePayload(payload);
  } catch {
    return null;
  }
}
async function publishNative(r, e) {
  const key = r.headers.get("X-Native-Runner-Key");
  if (!e.NATIVE_RUNNER_KEY || key !== e.NATIVE_RUNNER_KEY)
    return json({ error: "NATIVE_RUNNER_UNAUTHORIZED" }, 401);
  let b;
  try { b = await r.json(); } catch { return json({error: "INVALID_NATIVE_PAYLOAD"}, 422); }
  const error = await validateNative(b);
  if (error) return json({error}, 422);
  const payload = { ...nativePayload(b), created_at: now() };
  await e.DB.prepare(
    "INSERT INTO published_observations VALUES (?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      id(),
      b.backend,
      payload.truth_status,
      b.manifest_hash,
      b.checkpoint_hash,
      b.memory_hash,
      b.snapshot_hash,
      b.frame_hash,
      JSON.stringify(payload),
      payload.created_at,
    )
    .run();
  return json({
    published: true,
    backend: b.backend,
    memory_hash: b.memory_hash,
  });
}
async function predictionFeedback(e, u) {
  const rows = (
    await e.DB.prepare(
      "SELECT * FROM prediction_feedback WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
    )
      .bind(u.id)
      .all()
  ).results;
  return json({
    feedback: rows,
    training_source: "prediction_settlement",
    truth: "settlement_only",
  });
}
async function markets() {
  const r = await fetch(
    "https://gamma-api.polymarket.com/markets?limit=20&closed=false&offset=0",
    {
      headers: { "User-Agent": "DeFly-v2/1.0" },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!r.ok) throw Error("POLYMARKET_UNAVAILABLE");
  const d = await r.json();
  return (Array.isArray(d) ? d : d.markets || [])
    .map((x) => parsePolymarketMarket(x))
    .filter(Boolean)
    .slice(0, 12);
}
async function getPortfolio(e, uid) {
  return e.DB.prepare("SELECT * FROM portfolios WHERE user_id=?")
    .bind(uid)
    .first();
}
const equity = (p, price) => accountEquity(p, price);
const positionSide = (p) =>
  p.position_side || (Number(p.quantity) > 0 ? "LONG" : "FLAT");

async function getPolicy(e, uid) {
  let row = await e.DB.prepare("SELECT * FROM model_states WHERE user_id=?")
    .bind(uid)
    .first();
  if (row) return { row, policy: JSON.parse(row.policy_json) };
  const p = defaultPolicy(),
    h = await policyHash(p);
  await e.DB.prepare("INSERT INTO model_states VALUES (?,?,?,?,?)")
    .bind(uid, JSON.stringify(p), p.version, h, now())
    .run();
  return { row: { version: 0, policy_hash: h }, policy: p };
}
async function savePolicy(e, uid, p) {
  const h = await policyHash(p);
  await e.DB.prepare(
    "UPDATE model_states SET policy_json=?,version=?,policy_hash=?,updated_at=? WHERE user_id=?",
  )
    .bind(JSON.stringify(p), p.version, h, now(), uid)
    .run();
  return h;
}
async function executeAction(e, user, p, action, key, source = "HUMAN") {
  const markPrice = await mark(e, "BTCUSD"),
    side = p.position_side || "FLAT",
    qty = Number(p.position_qty || p.quantity || 0);
  let next = { ...p },
    price = markPrice,
    fee = 0,
    executed = action;
  if (action === "BUY" && side === "FLAT") {
    const x = buyFill({ cash: p.cash, quantity: 0, avg_cost: 0 }, markPrice);
    next = {
      ...p,
      cash: x.cash,
      quantity: x.quantity,
      avg_cost: x.avgCost,
      position_side: "LONG",
      position_qty: x.quantity,
      entry_price: x.fillPrice,
      take_profit: x.fillPrice * 1.01,
      stop_loss: x.fillPrice * 0.99,
      risk_policy: "MODEL_TAKE_PROFIT / MODEL_STOP_LOSS",
      revision: p.revision,
    };
    fee = x.fee;
  } else if (action === "SELL" && side === "FLAT") {
    const x = buyFill({ cash: p.cash, quantity: 0, avg_cost: 0 }, markPrice);
    next = {
      ...p,
      cash: x.cash,
      quantity: 0,
      avg_cost: 0,
      position_side: "SHORT",
      position_qty: x.quantity,
      entry_price: x.fillPrice,
      take_profit: x.fillPrice * 0.99,
      stop_loss: x.fillPrice * 1.01,
      risk_policy: "MODEL_TAKE_PROFIT / MODEL_STOP_LOSS",
      revision: p.revision,
    };
    fee = x.fee;
  } else if (action === "CLOSE" && side !== "FLAT") {
    const pnl =
      side === "LONG"
        ? qty * (markPrice - Number(p.entry_price))
        : qty * (Number(p.entry_price) - markPrice);
    next = {
      ...p,
      cash: Number(p.cash) + pnl + Number(p.entry_price) * qty,
      quantity: 0,
      avg_cost: 0,
      position_side: "FLAT",
      position_qty: 0,
      entry_price: 0,
      take_profit: 0,
      stop_loss: 0,
      revision: p.revision,
    };
    fee = Math.abs(pnl) * 0.001;
  } else if (action === "HOLD") {
    executed = "HOLD";
  }
  const did = id();
  await e.DB.batch([
    e.DB.prepare("INSERT INTO decisions VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(
      did,
      user.id,
      "TRADE",
      executed,
      "BTCUSD",
      null,
      price,
      fee,
      JSON.stringify({ ...next, source, proposed_action: action }),
      key,
      now(),
    ),
    e.DB.prepare(
      "UPDATE portfolios SET cash=?,quantity=?,avg_cost=?,revision=revision+1,position_side=?,position_qty=?,entry_price=?,take_profit=?,stop_loss=? WHERE user_id=? AND revision=?",
    ).bind(
      next.cash,
      next.quantity,
      next.avg_cost,
      next.position_side || "FLAT",
      next.position_qty || 0,
      next.entry_price || 0,
      next.take_profit || 0,
      next.stop_loss || 0,
      user.id,
      p.revision,
    ),
  ]);
  return {
    did,
    next: { ...next, revision: p.revision + 1 },
    price,
    fee,
    executed,
  };
}
async function startAutonomy(e, u, body = {}) {
  if (body.backend && body.backend !== BROWSER_BACKEND) return json({error:"BACKEND_NOT_ALLOWED",message:"Only the full browser WASM backend is supported"},422);
  const p = await getPortfolio(e, u.id),
    price = await mark(e, "BTCUSD"),
    rid = id(),
    t = now();
  await getPolicy(e, u.id);
  const statements = [
    e.DB.prepare("UPDATE autonomous_runs SET status='STOPPED',updated_at=? WHERE user_id=? AND status='RUNNING'").bind(t,u.id),
    e.DB.prepare("INSERT INTO autonomous_runs VALUES (?,?,?,?,?,?,?,?,?,?)").bind(rid,u.id,"RUNNING",0,equity(p,price),null,null,null,t,t),
  ];
  statements.push(e.DB.prepare("INSERT INTO browser_autonomy_runs VALUES(?,?,?)").bind(rid,BROWSER_BACKEND,PINNED_MANIFEST));
  await e.DB.batch(statements);
  return json({
    backend: BROWSER_BACKEND,
    run_id: rid,
    status: "RUNNING",
    autonomous: true,
    paper_only: true,
    next_step_seconds: 10,
  });
}
async function autonomyStep(e, u) {
  if (await browserRun(e,u.id)) return json({error:"BROWSER_PROPOSAL_REQUIRED"},409);
  const run = await e.DB.prepare(
    "SELECT * FROM autonomous_runs WHERE user_id=? AND status='RUNNING' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(u.id)
    .first();
  if (!run) return json({ error: "AUTONOMY_NOT_RUNNING" }, 409);
  const slot = Math.floor(now() / 10),
    claim = await e.DB.prepare(
      "INSERT OR IGNORE INTO autonomy_step_claims(run_id,slot,created_at) VALUES(?,?,?)",
    )
      .bind(run.id, slot, now())
      .run();
  if (!claim.meta.changes)
    return json({ error: "AUTONOMY_SLOT_ALREADY_PROCESSED", slot }, 409);
  const p = await getPortfolio(e, u.id),
    prices = await priceSeries(e, "BTCUSDT"),
    price = prices.at(-1),
    f = features(prices);
  let { policy } = await getPolicy(e, u.id),
    reward = 0,
    kind = null,
    hash = await policyHash(policy),
    versionBefore = policy.version;
  if (run.last_action) {
    const before = Number(run.last_equity),
      after = equity(p, price);
    reward = rewardFromEquity(before, after);
    if (Math.abs(reward) > 0) {
      kind = reward > 0 ? "REWARD" : "PUNISHMENT";
      policy = applyPlasticity(
        reinforce(
          policy,
          JSON.parse(run.last_features_json),
          run.last_action,
          reward,
        ),
        JSON.parse(run.last_features_json).map(Math.abs),
        reward,
      );
      hash = await savePolicy(e, u.id, policy);
      await e.DB.prepare(
        "INSERT INTO learning_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          id(),
          u.id,
          run.id,
          run.last_decision_id,
          kind,
          run.last_action,
          null,
          reward,
          before,
          after,
          versionBefore,
          policy.version,
          hash,
          now(),
        )
        .run();
    }
  }
  const side = positionSide(p),
    mask = [p.cash >= 1, true, true, side !== "FLAT"],
    proposal = chooseAction(policy, f, mask);
  let inactivity_penalty = 0,
    forcedAction = proposal.action,
    inactivity_escalation = false;
  if (proposal.action === "HOLD" && side === "FLAT") {
    inactivity_penalty = -0.05;
    const before = policy.version;
    policy = applyPlasticity(
      reinforce(policy, f, "HOLD", inactivity_penalty),
      f.map(Math.abs),
      inactivity_penalty,
    );
    hash = await savePolicy(e, u.id, policy);
    await e.DB.prepare(
      "INSERT INTO learning_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id(),
        u.id,
        run.id,
        null,
        "PUNISHMENT",
        "HOLD",
        null,
        inactivity_penalty,
        null,
        null,
        before,
        policy.version,
        hash,
        now(),
      )
      .run();
    forcedAction = f[0] >= 0 ? "BUY" : "SELL";
    inactivity_escalation = true;
  }
  const result = await executeAction(
      e,
      u,
      p,
      forcedAction,
      `auto_${run.id}_${run.step_count + 1}`,
      "AUTONOMOUS",
    ),
    afterEquity = equity(result.next, result.price || price);
  await e.DB.prepare(
    "UPDATE autonomous_runs SET step_count=step_count+1,last_equity=?,last_action=?,last_features_json=?,last_decision_id=?,updated_at=? WHERE id=?",
  )
    .bind(
      afterEquity,
      proposal.action,
      JSON.stringify(f),
      result.did,
      now(),
      run.id,
    )
    .run();
  return json({
    run_id: run.id,
    status: "RUNNING",
    step: run.step_count + 1,
    proposal,
    proposed_action: proposal.action,
    executed_action: forcedAction,
    inactivity_escalation,
    decision_id: result.did,
    portfolio: result.next,
    market_price: price,
    reward: {
      value: inactivity_penalty || reward,
      kind: inactivity_penalty ? "INACTIVITY_PENALTY" : kind,
    },
    learning: {
      version: policy.version,
      policy_hash: hash,
      updates: policy.updates,
      reward_total: policy.rewardTotal,
      corrections: policy.corrections,
      plasticity: policy.plasticity,
      plasticity_hash: await plasticityHash(policy),
    },
    paper_only: true,
  });
}
async function correct(e, u, b) {
  const run = await e.DB.prepare(
    "SELECT * FROM autonomous_runs WHERE user_id=? AND status='RUNNING' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(u.id)
    .first();
  if (!run || !run.last_action || !run.last_features_json)
    return json({ error: "NOTHING_TO_CORRECT" }, 409);
  const corrected = String(b.action || "").toUpperCase();
  if (!["BUY", "SELL", "HOLD", "CLOSE"].includes(corrected))
    return json({ error: "ACTION_NOT_ALLOWED" }, 422);
  const { policy } = await getPolicy(e, u.id),
    n = correctPolicy(
      policy,
      JSON.parse(run.last_features_json),
      run.last_action,
      corrected,
    ),
    h = await savePolicy(e, u.id, n);
  await e.DB.prepare(
    "INSERT INTO learning_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      id(),
      u.id,
      run.id,
      run.last_decision_id,
      "CORRECTION",
      run.last_action,
      corrected,
      0,
      null,
      null,
      policy.version,
      n.version,
      h,
      now(),
    )
    .run();
  return json({
    learned: true,
    source_action: run.last_action,
    corrected_action: corrected,
    learning: {
      version: n.version,
      policy_hash: h,
      updates: n.updates,
      corrections: n.corrections,
    },
  });
}
async function learning(e, u) {
  const { policy, row } = await getPolicy(e, u.id),
    events = (
      await e.DB.prepare(
        "SELECT kind,source_action,corrected_action,reward,policy_version_after,created_at FROM learning_events WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
      )
        .bind(u.id)
        .all()
    ).results,
    run = await e.DB.prepare(
      "SELECT * FROM autonomous_runs WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(u.id)
      .first();
  return json({
    policy: {
      version: policy.version,
      updates: policy.updates,
      reward_total: policy.rewardTotal,
      corrections: policy.corrections,
      hash: row.policy_hash,
      plasticity: policy.plasticity,
      plasticity_hash: await plasticityHash(policy),
      mean_synaptic_efficacy:
        policy.synapses.reduce((a, b) => a + b, 0) / policy.synapses.length,
    },
    run,
    events,
    learned: policy.updates > 0,
  });
}
async function arenaProxy(r, e, path, method = "GET", body = null) {
  if (!e.ARENA) return json({ error: "ARENA_UNAVAILABLE" }, 503);
  const headers = { "content-type": "application/json" };
  const token = r.headers.get("X-99X-Session-Token");
  if (token) headers["X-Session-Token"] = token;
  const out = await e.ARENA.fetch(
    new Request("https://arena.internal" + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const data = await out.json();
  return json(data, out.status);
}
async function runScheduledAutonomy(e) {
  await e.DB.prepare("UPDATE autonomous_runs SET status='STOPPED',updated_at=? WHERE status='RUNNING' AND NOT EXISTS (SELECT 1 FROM browser_autonomy_runs b WHERE b.run_id=autonomous_runs.id)").bind(now()).run();
}
export default {
  async scheduled(controller, e, ctx) {
    ctx.waitUntil(runScheduledAutonomy(e));
    ctx.waitUntil(runTrainingJobs(e));
  },
  async fetch(r, e, ctx) {
    try {
      if (r.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: {
            ...CORS,
            "access-control-allow-origin": "*",
            "access-control-allow-headers":
              "content-type,x-session-token,idempotency-key",
            "access-control-allow-methods": "GET,POST,OPTIONS",
          },
        });
      const u = new URL(r.url);
      if (u.pathname === "/api/99x/markets" && r.method === "GET")
        return arenaProxy(r, e, "/api/arena/markets");
      if (u.pathname === "/api/99x/leaderboard" && r.method === "GET")
        return arenaProxy(r, e, "/api/arena/leaderboard");
      if (u.pathname === "/api/99x/session" && r.method === "POST") {
        const b = await r.json();
        return arenaProxy(r, e, "/api/session", "POST", {
          nickname: String(b.nickname || "").slice(0, 24),
        });
      }
      if (r.method === "POST" && u.pathname === "/api/native/publish")
        return publishNative(r, e);
      if (u.pathname === "/health")
        return json({
          status: "ok",
          service: "defly-v2-trial-worker",
          paper_only: true,
          features: [
            "99x-paper-adapter",
            "polymarket-prediction",
            "autonomous-learning",
          ],
        });
      if (r.method === "POST" && u.pathname === "/api/session") {
        const b = await r.json(),
          token = `defly_${id()}_${id()}`,
          uid = id(),
          t = now(),
          p = defaultPolicy(),
          h = await policyHash(p);
        await e.DB.batch([
          e.DB.prepare("INSERT INTO users VALUES (?,?,?,?,?)").bind(
            uid,
            await sha(token),
            String(b.nickname || "DeFlyPilot").slice(0, 32),
            t,
            t,
          ),
          e.DB.prepare(
            "INSERT INTO portfolios (user_id,cash,quantity,avg_cost,revision) VALUES (?,?,?,?,?)",
          ).bind(uid, 10000, 0, 0, 0),
          e.DB.prepare("INSERT INTO model_states VALUES (?,?,?,?,?)").bind(
            uid,
            JSON.stringify(p),
            0,
            h,
            t,
          ),
        ]);
        return json({
          token,
          user: { id: uid, nickname: b.nickname || "DeFlyPilot" },
          paper_only: true,
        });
      }
      if (u.pathname === "/api/router/info" && r.method === "GET") return federation(r,e,null,u.pathname);
      const user = await auth(r, e);
      if (!user) return json({ error: "UNAUTHORIZED" }, 401);
      const federated = await federation(r, e, user, u.pathname);
      if (federated) return federated;
      if (u.pathname.startsWith("/api/raising/")) {
        const response = await handleRaisingTraining(r, e, user, ctx) || await handleRaising(r, e, user);
        if (response) {
          const headers = new Headers(response.headers);
          headers.set("access-control-allow-origin", "*");
          headers.set("cache-control", "no-store");
          return new Response(response.body, {status: response.status, headers});
        }
      }
      if (r.method === "GET" && u.pathname === "/api/state")
        return json({
          user: { id: user.id, nickname: user.nickname },
          portfolio: await getPortfolio(e, user.id),
          paper_only: true,
          backend: "99x_paper_adapter_v1",
        });
      if (r.method === "GET" && u.pathname === "/api/observation") {
        const live = await published(e);
        return json(live || (await observation(e)));
      }
      if (r.method === "GET" && u.pathname === "/api/prediction-feedback")
        return predictionFeedback(e, user);
      if (r.method === "GET" && u.pathname === "/api/markets")
        return json({
          symbols: [
            "PEPEUSDT",
            "DOGEUSDT",
            "SHIBUSDT",
            "SOLUSDT",
            "ASTERUSDT",
            "CAKEUSDT",
            "UNIUSDT",
          ],
          supported_tokens: NINEX_MARKETS,
          training_available: true,
          settlement_required: true,
          paper_only: true,
          source: "binance-public",
        });
      if (r.method === "GET" && u.pathname.startsWith("/api/candles/"))
        return json({
          prices: await priceSeries(e, "BTCUSDT"),
          symbol: "BTCUSDT",
          source: "multi-provider-public",
        });
      if (r.method === "GET" && u.pathname === "/api/predictions")
        return json({
          markets: await markets(),
          paper_only: true,
          supported_tokens: NINEX_MARKETS,
          training_available: true,
          settlement_required: true,
        });
      if (r.method === "POST" && u.pathname === "/api/autonomy/start")
        return startAutonomy(e, user, await r.json());
      if (r.method === "POST" && u.pathname === "/api/autonomy/prepare") {
        try { return await prepareBrowser(e,user,()=>observation(e)); }
        catch (x) { console.error("AUTONOMY_PREPARE", x); return json({error:"AUTONOMY_PREPARE_FAILED",detail:String(x?.message||x)},500); }
      }
      if (r.method === "POST" && u.pathname === "/api/autonomy/step") {
        const body=await r.json();
        if (await browserRun(e,user.id)) return stepBrowser(e,user,body,()=>observation(e));
        if (body.neural || body.challenge_id) return json({error:"BROWSER_AUTONOMY_NOT_RUNNING"},409);
        return json({error:"BROWSER_PROPOSAL_REQUIRED"},409);
      }
      if (r.method === "POST" && u.pathname === "/api/autonomy/stop") {
        await e.DB.prepare(
          "UPDATE autonomous_runs SET status='STOPPED',updated_at=? WHERE user_id=? AND status='RUNNING'",
        )
          .bind(now(), user.id)
          .run();
        return json({ status: "STOPPED" });
      }
      if (r.method === "POST" && u.pathname === "/api/correct")
        return correct(e, user, await r.json());
      if (r.method === "GET" && u.pathname === "/api/learning")
        return learning(e, user);
      if (r.method === "POST" && u.pathname === "/api/decision") {
        const b = await r.json(),
          a = String(b.action || "").toUpperCase();
        if (!["BUY", "SELL", "HOLD", "CLOSE"].includes(a))
          return json({ error: "ACTION_NOT_ALLOWED" }, 422);
        const result = await executeAction(
          e,
          user,
          await getPortfolio(e, user.id),
          a,
          r.headers.get("Idempotency-Key") || id(),
        );
        return json({
          decision_id: result.did,
          action: a,
          state: result.next,
          server_price: result.price,
          fee: result.fee,
          paper_only: true,
        });
      }
      if (r.method === "POST" && u.pathname === "/api/predict") {
        const b = await r.json(),
          a = String(b.action || "").toUpperCase(),
          did = id();
        await e.DB.prepare(
          "INSERT INTO decisions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        )
          .bind(
            did,
            user.id,
            "PREDICTION",
            a,
            null,
            String(b.market_id || ""),
            null,
            0,
            JSON.stringify(b),
            r.headers.get("Idempotency-Key") || id(),
            now(),
          )
          .run();
        return json({
          decision_id: did,
          paper_only: true,
          settlement: "PENDING_RESOLUTION",
        });
      }
      return json({ error: "NOT_FOUND" }, 404);
    } catch (x) {
      console.error(x);
      if (x instanceof SyntaxError) return json({error:"INVALID_JSON"},400);
      if (["MARKET_UNAVAILABLE","MARKET_STALE","HISTORY_UNAVAILABLE","HISTORY_INCOMPLETE","MARKET_INVALID"].includes(x.message)) return json({error:x.message},503);
      if (x.message === "INVALID_SYMBOL") return json({error:x.message},422);
      return json({ error: "INTERNAL_ERROR" }, 500);
    }
  },
};
