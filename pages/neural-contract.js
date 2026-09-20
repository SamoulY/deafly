export const UNAVAILABLE = 'NEURAL ACTIVITY UNAVAILABLE';
const hash = v => typeof v === 'string' && /^(sha256:)?[a-f0-9]{64}$/.test(v);
const bare = v => v?.replace(/^sha256:/, '');
export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), b => b.toString(16).padStart(2,'0')).join('');
}
export async function verifyAnatomy(asset) {
  if (!asset || !hash(asset.manifest_hash) || !hash(asset.nodes_hash) || typeof asset.source !== 'string' || !asset.source.trim() || !Array.isArray(asset.nodes) || !asset.nodes.length) return null;
  const ids = new Set();
  for (const n of asset.nodes) {
    if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id) || ![n.x,n.y,n.z].every(Number.isFinite)) return null;
    ids.add(n.id);
  }
  return await digest(asset.nodes) === bare(asset.nodes_hash) ? asset : null;
}
// Authenticated server verification is required in addition to client-side validation.
export function validateActivity(p, {snapshot, anatomy, now = Date.now(), maxAgeMs = 120000, trustedBrowser = false} = {}) {
  const fail = reason => ({available:false, reason});
  if (!p || !anatomy || !snapshot) return fail('runtime_not_connected');
  const browser = trustedBrowser && p.backend === 'stonkfly-full-browser-wasm-v1';
  if ((!browser && p.backend !== 'stonkfly-full-native-v1') || p.truth_status !== 'real_full_kernel' || p.replay === true || p.mode === 'replay') return fail('runtime_not_verified_live');
  for (const key of ['manifest_hash','checkpoint_hash','memory_hash','snapshot_hash','frame_hash']) if (!hash(p[key])) return fail('missing_hash');
  if (bare(p.manifest_hash) !== bare(anatomy.manifest_hash) || p.snapshot_hash !== snapshot.snapshot_hash || p.frame_hash !== snapshot.frame_hash) return fail('snapshot_or_manifest_mismatch');
  const timestamps = [p.observed_at,snapshot.observed_at];
  if (!timestamps.every(t=>Number.isFinite(t)&&now-t<=maxAgeMs&&t<=now+1000)) return fail('stale');
  const a = p.activity;
  if (!a || !Array.isArray(a.node_ids) || !Array.isArray(a.event_counts) || !a.node_ids.length || a.node_ids.length !== a.event_counts.length || !Number.isFinite(a.simulated_ms) || a.simulated_ms<=0) return fail('invalid_shape');
  const ids = new Set(anatomy.nodes.map(n=>n.id));
  if (new Set(a.node_ids).size !== a.node_ids.length || !a.node_ids.every(id=>ids.has(id)) || !a.event_counts.every(n=>Number.isSafeInteger(n)&&n>=0)) return fail('invalid_nodes');
  const total = a.event_counts.reduce((sum,n)=>sum+n,0);
  if (!Number.isSafeInteger(total) || total !== a.total_events) return fail('invalid_total');
  const full = a.full_total_events ?? p.full_total_events;
  if (full !== undefined && (!Number.isSafeInteger(full) || full < total)) return fail('invalid_full_total');
  if (browser && full === undefined) return fail('missing_full_total');
  return {available:true, activity:a, totalSpikes:total, fullTotalSpikes:full, historical:!!snapshot.historical, browser};
}
