import * as THREE from './vendor-three.js';
import { createFlyModel } from './fly-model.js';
import { createMotion, ACTION_KEYS } from './fly-motion.js';

const FPS=12;const FRAME_MS=1000/FPS;
const material = (color, options = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.7, metalness: 0.18, flatShading: true, ...options,
});

function makeRenderer(canvas, bg = '#060709') {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  canvas.dataset.webgl = 'ready';
  canvas.style.imageRendering = 'pixelated';
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const scale = Math.min(1, 256 / Math.max(1, r.width), 192 / Math.max(1, r.height));
    renderer.setSize(Math.max(1, Math.round(r.width * scale)), Math.max(1, Math.round(r.height * scale)), false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  return { renderer, scene, camera };
}

function scheduler(canvas, render) {
  let visible = !canvas.hidden;
  let inViewport = true;
  const observer = new IntersectionObserver(entries => { inViewport = entries[0].isIntersecting; });
  observer.observe(canvas);
  let stopped = false;
  let timer = null;
  const frame = () => {
    if (stopped) return;
    if (visible && inViewport && document.visibilityState === 'visible') render(performance.now());
    timer = setTimeout(frame, FRAME_MS);
  };
  frame();
  return {
    setVisible(v) { visible = v; if (v) render(performance.now()); },
    dispose() { observer.disconnect(); stopped = true; if (timer) clearTimeout(timer); },
  };
}

function orbit(canvas, root) {
  let down, targetX = 0, targetY = 0;
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!down) return;
    targetX = Math.max(-0.65, Math.min(0.65, targetX + (e.clientX - down[0]) * 0.008));
    targetY = Math.max(-0.28, Math.min(0.28, targetY + (e.clientY - down[1]) * 0.005));
    down = [e.clientX, e.clientY];
  });
  canvas.addEventListener('pointerup', () => { down = null; });
  return () => {
    root.rotation.y += (targetX - root.rotation.y) * 0.08;
    root.rotation.x += (targetY - root.rotation.x) * 0.08;
  };
}

function box(root, w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z);
  root.add(mesh);
  return mesh;
}

function drawMarketCanvas(series, label, existing) {
  const c = existing || document.createElement('canvas');
  c.width = 640; c.height = 360;
  const x = c.getContext('2d');
  x.fillStyle = '#07111d'; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = '#1d3145'; x.lineWidth = 1;
  for (let i = 1; i < 7; i++) { x.beginPath(); x.moveTo(0, i * 48); x.lineTo(640, i * 48); x.stroke(); }
  const s = series.filter(v => Number.isFinite(v) && v > 0);
  if (!s.length) {
    x.fillStyle = '#989aaa'; x.font = '18px monospace';
    x.fillText('AWAITING MARKET DATA', 150, 180);
    return c;
  }
  const lo = Math.min(...s), hi = Math.max(...s), span = hi - lo || 1;
  x.beginPath();
  s.forEach((v, i) => {
    const px = 20 + i * 600 / Math.max(1, s.length - 1);
    const py = 315 - (v - lo) / span * 260;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  });
  x.strokeStyle = '#bdff32'; x.lineWidth = 5; x.stroke();
  x.fillStyle = '#f3f4ed'; x.font = '18px Pixel, monospace';
  x.fillText(`${label} // BTCUSD`, 18, 28);
  x.fillStyle = '#989aaa'; x.font = '13px Mono, monospace';
  x.fillText('SAME AUTHORITATIVE SNAPSHOT', 18, 344);
  return c;
}

function visionTexture(series, side, existing) {
  const c = drawMarketCanvas(series, `${side} EYE`, existing);
  return new THREE.CanvasTexture(c);
}
function marketTexture(series, existing) { return new THREE.CanvasTexture(drawMarketCanvas(series, 'MARKET', existing)); }
function updateMarket(canvas, values) { drawMarketCanvas(values, 'MARKET', canvas); }

function buildTerminal(root, series) {
  box(root, 0.24, 3.1, 4.8, '#1a2235', 2.15, -0.15, -0.65);
  const monitorCanvas = drawMarketCanvas(series, 'MARKET');
  const monitorTexture = new THREE.CanvasTexture(monitorCanvas);
  const monitor = new THREE.Mesh(
    new THREE.PlaneGeometry(4.18, 2.5),
    new THREE.MeshBasicMaterial({ map: monitorTexture, side: THREE.DoubleSide }),
  );
  monitorTexture.image = monitorCanvas;
  monitor.userData = { monitorCanvas, monitorTexture };
  monitor.position.set(2.0, -0.05, -0.505);
  monitor.rotation.y = -Math.PI / 2;
  root.add(monitor);
  return monitor;
}
function buildDesk(root) {
  box(root, 10, 0.35, 6, '#101a29', 0, -1.9, 0);
  box(root, 1.25, 0.10, 2.5, '#25313b', -.45, -1.675, .2);
  return ACTION_KEYS.map((action,i)=>{
    const key=box(root,.65,.08,.5,['#80a927','#aa405c','#637281','#6961ac'][i],-.45,-1.585,-.7+i*.6);
    key.name='keyboard-key';key.userData.action=action;key.userData.restY=key.position.y;
    const c=document.createElement('canvas');c.width=64;c.height=32;const x=c.getContext('2d');x.fillStyle='#eef2df';x.font='bold 14px monospace';x.textAlign='center';x.fillText(['LONG','SHORT','HOLD','CLOSE'][i],32,21);
    const texture=new THREE.CanvasTexture(c);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
    const label=new THREE.Mesh(new THREE.PlaneGeometry(.6,.3),new THREE.MeshBasicMaterial({map:texture,transparent:true}));label.rotation.x=-Math.PI/2;label.position.y=.042;key.add(label);return key;
  });
}
function lookAtScreen(fly) { fly.position.set(-1.5, -0.63, 0.2); fly.rotation.y = Math.PI / 2; }
function buildFly(root) {
  const model = createFlyModel();
  lookAtScreen(model.fly); root.add(model.fly);
  return model;
}

export function startScene(canvas, series = []) {
  const { renderer, scene, camera } = makeRenderer(canvas);
  camera.position.set(-6, 4.2, 9); camera.lookAt(0.1, -0.35, 0);
  const root = new THREE.Group(); scene.add(root);
  scene.add(new THREE.HemisphereLight('#d9e8ff', '#080a12', 2.2));
  const key = new THREE.DirectionalLight('#bdffcc', 3); key.position.set(-4, 8, 6); scene.add(key);
  const rim = new THREE.DirectionalLight('#c2dfff', 1.6); rim.position.set(-3, 3, -5); scene.add(rim);
  const fill = new THREE.DirectionalLight('#ffddd6', .7); fill.position.set(3, 2, 5); scene.add(fill);
  const keys=buildDesk(root);canvas.dataset.keyCount=String(keys.length); const monitor = buildTerminal(root, series); const { fly, setOutfit } = buildFly(root); const move = orbit(canvas, root);
  const motion=createMotion(fly,keys,canvas);
  let paused = false;
  const loop = t => {
    if (!paused) {
      move();
      motion.update(t);
    }
    canvas.setAttribute('data-lit-frame', String(t)); renderer.render(scene, camera);
  };
  const run = scheduler(canvas, loop);
  return {
    playAction: motion.playAction,
    setPaused: v => { paused = v; }, isPaused: () => paused, setVisible: run.setVisible,
    setOutfit(loadout) {
      const normalized = setOutfit(loadout);
      const backgrounds = { 'background-mint': '#10201e', 'background-rose': '#23171e', 'background-graphite': '#181c24' };
      scene.background.set(backgrounds[normalized.background] || '#060709');
      return normalized;
    },
    updateMarket(values) { updateMarket(monitor.userData.monitorCanvas, values); monitor.userData.monitorTexture.needsUpdate = true; },
  };
}

export function startVisionScene(canvas, series = []) {
  const { renderer, scene, camera } = makeRenderer(canvas, '#030506'); camera.position.set(0, 0, 6);
  const root = new THREE.Group(); scene.add(root);
  const rebuild = values => {
    root.clear();
    for (const side of [-1, 1]) {
      const tex = visionTexture(values, side === -1 ? 'LEFT' : 'RIGHT');
      const lens = new THREE.Mesh(new THREE.SphereGeometry(1.65, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
      lens.scale.set(1, 0.72, 0.22); lens.position.x = side * 1.22; lens.rotation.y = side * 0.24; root.add(lens);
    }
  };
  rebuild(series);
  const loop = t => { root.rotation.y = Math.sin(t * 0.0005) * 0.04; canvas.setAttribute('data-lit-frame', String(t)); renderer.render(scene, camera); };
  const run = scheduler(canvas, loop);
  return { update() {}, updateMarket: rebuild, setVisible: run.setVisible };
}

export function startBrainScene(canvas, anatomy = null) {
  const { renderer, scene, camera } = makeRenderer(canvas, '#050509');
  camera.position.set(0,0,9);
  const root = new THREE.Group(); scene.add(root);
  const move = orbit(canvas,root);
  let points = null, ids = [], paused = false;
  function setAnatomy(asset) {
    if (points) { root.remove(points); points.geometry.dispose(); points.material.dispose(); }
    points = null; ids = [];
    canvas.dataset.nodeCount = '0';
    if (!asset?.nodes?.length) return;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(asset.nodes.length*3);
    ids = asset.nodes.map((n,i)=>{positions.set([n.x,n.y,n.z],i*3); return n.id;});
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(positions.length).fill(.55),3));
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const scale = 4 / Math.max(size.x,size.y,size.z,1);
    points = new THREE.Points(geometry,new THREE.PointsMaterial({size:.022,vertexColors:true}));
    points.position.copy(center).multiplyScalar(-scale); points.scale.setScalar(scale);
    points.userData.nodeIds = ids; root.add(points);
    canvas.dataset.nodeCount = String(ids.length);
  }
  setAnatomy(anatomy);
  const loop = t => { if (!paused) move(); canvas.dataset.litFrame = String(t); renderer.render(scene,camera); };
  const run = scheduler(canvas,loop);
  return {setAnatomy, setVisible:run.setVisible, setPaused:v=>{paused=v;}, isPaused:()=>paused,
    update(activity) {
      if (!points) return;
      const counts = new Map(activity?.node_ids.map((id,i)=>[id,activity.event_counts[i]]) || []);
      const color = points.geometry.getAttribute('color');
      const max = activity?.event_counts.reduce((m,n)=>Math.max(m,n),1) || 1;
      ids.forEach((id,i)=>{const n=counts.get(id)||0; color.setXYZ(i,n ? .3 : .55,n ? .6+n/max*.4 : .55,n ? 1 : .55);});
      color.needsUpdate = true;
    },
  };
}
