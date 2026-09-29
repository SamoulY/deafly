import { validateActivity, digest } from './neural-contract.js';

const pixelHash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
// Fixed-size, integer rasterization: no theme, DPR, labels, or display canvas enters inference.
export async function encodeMarketObservation(source, historical = false) {
  const bars = historical ? source.bars : source.candles;
  if (!bars?.length || !bars.every(b => Number.isFinite(Number(b.close)))) throw Error('Market bars unavailable');
  const width = 320, height = 180, rgb = new Uint8Array(width * height * 3);
  rgb.fill(16);
  const values = bars.map(b => Number(b.close)), min = Math.min(...values), max = Math.max(...values);
  const points = values.map((v, i) => [Math.round(i * (width - 1) / Math.max(1, values.length - 1)), Math.round(height - 12 - (v - min) / (max - min || 1) * (height - 24))]);
  for (let i = 0; i < points.length; i++) {
    let [x, y] = points[Math.max(0, i - 1)]; const [endX, endY] = points[i];
    const dx = Math.abs(endX - x), dy = -Math.abs(endY - y), sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      const offset = (y * width + x) * 3; rgb.set([189,255,50], offset);
      if (x === endX && y === endY) break;
      const twice = error * 2;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
  }
  return {rgb, width, height, encoder_version:'market-close-rgb-v1', snapshot_hash: historical ? source.observation_hash : source.snapshot_hash || await digest(bars), frame_hash:await pixelHash(rgb), source_frame_hash:source.frame_hash, observed_at:Date.now(), historical, source_observed_at:source.observed_at};
}

export function createBrowserBrainClient({workerFactory = () => new Worker('/full-brain/worker.mjs', {type:'module'}), onStatus = () => {}, onActivity = () => {}, isHidden = () => document.hidden, timeoutMs = 60000} = {}) {
  let worker, ready = false, busy = false, latest = null, pending = null, sampleIds = [], serial = 0, scope = 'observation', readiness = [], checkpointKey = null, checkpointPersistence = 'normal';
  const trusted = new WeakSet();
  const commandQueue = [];
  const status = (state, detail = {}) => onStatus({state, scope, ...detail});
  function rejectPending(error) { if (pending) { clearTimeout(pending.timer); pending.reject?.(error); } pending = null; busy = false; }
  function cancel() { for(const item of commandQueue.splice(0)) item.reject(Error('Runtime cancelled')); for(const c of controls.values()){clearTimeout(c.timer);c.reject(Error('Checkpoint cancelled'));} controls.clear(); worker?.terminate(); worker = null; ready = false; latest = null; rejectPending(Error('Inference cancelled')); for (const r of readiness.splice(0)) {clearTimeout(r.timer); r.reject(Error('Runtime cancelled'));} status('cancelled'); }
  function send(frame, resolve, reject, type = 'OBSERVE', reward) {
    busy = true; const request_id = ++serial;
    pending = {frame, resolve, reject, request_id, type, timer:setTimeout(() => { const fail = pending?.reject; cancel(); fail?.(Error('Inference timeout')); }, timeoutMs)};
    const {rgb,width,height,snapshot_hash,frame_hash,observed_at} = frame;
    worker.postMessage({type, request_id, rgb,width,height,snapshot_hash,frame_hash,observed_at,reward});
  }
  const controls=new Map();
  function control(type) { return new Promise((resolve,reject)=>{
    if(!worker||!ready)return reject(Error('Full brain unavailable'));
    commandQueue.push({reject,run(){
      busy=true;const request_id=++serial,timer=setTimeout(()=>{cancel();reject(Error('Checkpoint request timeout'));},timeoutMs);
      controls.set(request_id,{resolve,reject,timer});worker.postMessage({type,request_id});
    }});pump();
  }); }
  function pump() { if(worker && ready && !busy && commandQueue.length){commandQueue.shift().run();return;} if (worker && ready && !busy && latest && !isHidden() && scope === 'observation') { const frame = latest; latest = null; send(frame); } }
  function start(ids = sampleIds, nextScope = 'observation', options = {}) {
    const queued = nextScope === 'observation' && scope === 'observation' ? latest : null;
    cancel(); latest = queued; sampleIds = ids; scope = nextScope; checkpointPersistence = options.checkpointPersistence === 'ephemeral' ? 'ephemeral' : 'normal'; status('loading');
    try {
      const active = worker = workerFactory();
      active.onerror = e => { if (worker !== active) return; cancel(); status('error', {message:e.message || 'Worker failed'}); };
      active.onmessage = ({data}) => {
        if (worker !== active) return;
        if (data.type === 'PROGRESS') status('loading', data);
        else if (data.type === 'READY') { ready = true; for (const r of readiness.splice(0)) {clearTimeout(r.timer); r.resolve();} status('ready', data); pump(); }
        else if (controls.has(data.request_id)) {const c=controls.get(data.request_id);controls.delete(data.request_id);clearTimeout(c.timer);busy=false;if(data.type==='ERROR')c.reject(Error(data.message));else c.resolve(data.payload);pump();}
        else if (data.type === 'ERROR') { rejectPending(Error(data.message));cancel(); status('error', {message:data.message}); }
        else if (['ACTIVITY','REINFORCED'].includes(data.type) && pending && data.request_id === pending.request_id) {
          const p = pending, payload = data.payload; clearTimeout(p.timer); pending = null; busy = false;
          if (!payload || payload.snapshot_hash !== p.frame.snapshot_hash || payload.frame_hash !== p.frame.frame_hash) p.reject?.(Error('Stale inference identity'));
          else { trusted.add(payload); if (data.type === 'ACTIVITY') onActivity(payload, p.frame); p.resolve?.(payload); }
          pump();
        }
      };
      worker.postMessage({type:'INIT', sample_ids:sampleIds, scope, checkpoint_key:checkpointKey, checkpoint_persistence:checkpointPersistence});
    } catch (error) { cancel(); status('error', {message:error.message}); }
  }
  function request(frame, type, reward) { return new Promise((resolve,reject) => {
    if (!ready || !worker || (busy && pending) || isHidden() || scope !== 'autonomy') return reject(Error('Full brain unavailable, busy, or paused'));
    commandQueue.push({reject,run:()=>send(frame,resolve,reject,type,reward)});pump();
  }); }
  return {start,cancel,saveCheckpoint:()=>control('SAVE_CHECKPOINT'),checkpointStatus:()=>control('CHECKPOINT_STATUS'),exportCheckpoint:()=>control('EXPORT_CHECKPOINT'),flush:()=>control('SAVE_CHECKPOINT'),async shutdown(){await control('SAVE_CHECKPOINT');cancel();},setCheckpointKey(key){if(worker&&key!==checkpointKey)throw Error('Stop runtime before changing checkpoint owner');if(key!==null&&(typeof key!=='string'||!key.trim()))throw Error('Checkpoint owner required');checkpointKey=key;},resume:pump,get ready(){return ready;},get scope(){return scope;},
    waitReady() { if (ready) return Promise.resolve(); if (!worker) return Promise.reject(Error('Full brain unavailable')); return new Promise((resolve,reject) => {const r={resolve,reject}; r.timer=setTimeout(()=>{readiness=readiness.filter(x=>x!==r); reject(Error('Brain readiness timeout'));},timeoutMs); readiness.push(r);}); },
    infer:frame=>request(frame,'OBSERVE'), reinforce:(frame,reward)=>request(frame,'REINFORCE',reward),
    observe(frame) { if(scope !== 'observation') return; latest = frame; pump(); },
    validate(payload, options) {return validateActivity(payload, {...options, trustedBrowser:!!payload && trusted.has(payload)});}};
}
