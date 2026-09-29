import * as THREE from './vendor-three.js';

const surface = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, ...extra });
const palette=['#344747','#485b4d','#3d4c63','#553f4e','#4b5140','#3b5360'];
const eyePalette=['#ae5369','#d06a52','#8b6ac2','#b28d45','#4aa19b'];
const wingPalette=['#b5ccd1','#9fc8bd','#c7b6d5','#d4c3a4'];
function seedOf(value){let h=2166136261;for(const c of String(value||'unknown')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function pick(h,n){return (h>>>0)%n;}
export function deriveAppearance(fly_id){
  const h=seedOf(fly_id), h2=Math.imul(h^0x9e3779b9,2654435761)>>>0;
  return { version:'defly-appearance-v1', fly_id:String(fly_id||'unknown'), body_color:palette[pick(h,palette.length)], eye_color:eyePalette[pick(h2,eyePalette.length)], wing_color:wingPalette[pick(h>>>7,wingPalette.length)], body_scale:[.92+(h%17)/100,.94+((h>>>5)%13)/100,.94+((h>>>9)%15)/100], marking:{kind:['stripe','spot','none'][pick(h>>>13,3)], color:['#d1b876','#77c6bd','#1a272d'][pick(h>>>17,3)], offset:(h>>>21)%5}, eye_gloss:.12+((h>>>25)%20)/100};
}
function ellipsoid(parent, name, radii, position, material, detail = 0) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, detail), material);
  mesh.name = name; mesh.userData.part = name;
  mesh.scale.set(...radii); mesh.position.set(...position); parent.add(mesh); return mesh;
}
function bone(parent, a, b, radius, material) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * .65, radius, from.distanceTo(to), 6), material);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.userData.length = from.distanceTo(to);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
  parent.add(mesh); return mesh;
}

// Original geometry. Local +Z is the fly's gaze; the workstation supplies world pose.
export function createFlyModel(identityOrFlyId = null) {
  const fly = new THREE.Group(); fly.name = 'Compound eye fly';
  const fly_id=typeof identityOrFlyId==='string'?identityOrFlyId:identityOrFlyId?.fly_id;
  const appearance=identityOrFlyId?.appearance||deriveAppearance(fly_id||'default');
  const shell = surface(appearance.body_color), seam = surface('#1a272d'), legs = surface('#899b9c', { roughness: .46 });
  const eyeMaterial = surface(appearance.eye_color, { roughness: .48, metalness: .16, flatShading: true });
  const wingMaterial = surface(appearance.wing_color, { transparent: true, opacity: .32, metalness: .08, roughness: .38, side: THREE.DoubleSide, depthWrite: false });
  fly.userData.appearance=appearance;
  ellipsoid(fly, 'thorax', [.64, .57, .75], [0, .05, .05], shell);
  ellipsoid(fly, 'abdomen', [.49, .35, .81], [0, -.07, -.85], shell, 1);
  // Shallow continuous bands follow the abdomen instead of forming separate lobes.
  for (let i = 0; i < 5; i++) {
    const z = -.52 - i * .22;
    const width = .492 * Math.sqrt(1 - ((z + .85) / .81) ** 2);
    ellipsoid(fly, 'abdomen-segment', [width, width * .718, .025], [0, -.07, z], seam, 0);
  }
  ellipsoid(fly, 'head', [.52, .46, .46], [0, .13, .93], seam);
  ellipsoid(fly, 'face', [.19, .28, .16], [0, .02, 1.32], shell);
  for (const side of [-1, 1]) {
    ellipsoid(fly, 'compound-eye', [.34, .40, .32], [side * .35, .18, 1.15], eyeMaterial, 1);
    const antenna = new THREE.Group(); antenna.userData.part = 'antenna'; fly.add(antenna);
    bone(antenna, [side * .14, .38, 1.31], [side * .21, .55, 1.51], .035, legs);
    bone(antenna, [side * .21, .55, 1.51], [side * .31, .65, 1.54], .012, legs);
    for (let n = 0; n < 3; n++) {
      const leg = new THREE.Group(); leg.userData.part = 'leg'; leg.name = `leg-${side}-${n}`; fly.add(leg);
      const z = .46 - n * .48;
      const knee = [side * (1.0 + (n === 1 ? .13 : 0)), -.30, z + (.36 - n * .36)];
      const ankle = [side * (n === 0 ? .85 : n === 1 ? 1.22 : 1.06), n === 0 ? -.895 : -1.065, z + (.53 - n * .52)];
      bone(leg, [side * .42, -.17, z], knee, .046, legs);
      bone(leg, knee, ankle, .028, legs);
      const foot = [ankle[0] + side * .10, n === 0 ? -.915 : -1.095, ankle[2] + .16];
      bone(leg, ankle, foot, .021, legs);
      leg.userData.contact = foot;
      leg.userData.rig = { side, index: n, hip: [side * .42, -.17, z], knee, ankle, foot };
    }
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.bezierCurveTo(.36, .25, 1.61, .32, 1.82, -.12);
    shape.bezierCurveTo(2.01, -.64, .90, -1.50, .31, -.88);
    shape.quadraticCurveTo(.08, -.44, 0, 0);
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape, 3), wingMaterial);
    wing.userData.part = 'wing'; wing.name = `wing-${side}`;
    wing.rotation.x = Math.PI / 2; wing.scale.set(side * .82, 1.45, 1);
    wing.position.set(side * .27, .54, -.30); fly.add(wing);
    const paths = [ [[0,0],[1.78,-.18]], [[0,0],[1.49,-.66]], [[0,0],[.75,-1.02]], [[.53,-.06],[.70,-.43],[.75,-1.02]], [[.70,-.43],[1.49,-.66]] ];
    const points = [];
    for (const path of paths) for (let i = 1; i < path.length; i++) points.push(new THREE.Vector3(...path[i-1], .008), new THREE.Vector3(...path[i], .008));
    wing.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#718f99', transparent: true, opacity: .52 })));
  }
  // Three subtle thoracic stripes emphasize the fly's forward direction.
  for (const x of [-.23, 0, .23]) ellipsoid(fly, 'thorax-stripe', [.035, .014, .43], [x, .595 - Math.abs(x) * .2, .05], seam, 1);
  const marking = new THREE.Group(); marking.name = 'phenotype-marking'; marking.userData.part = 'marking'; fly.add(marking);
  const markingMaterial = surface(appearance.marking.color, { roughness: .72 });
  const markingMesh = ellipsoid(marking, 'marking-shape', [.22, .035, .42], [0, .585, -.25], markingMaterial, 1);
  function applyAppearance(next) {
    shell.color.set(next.body_color); eyeMaterial.color.set(next.eye_color); wingMaterial.color.set(next.wing_color);
    markingMaterial.color.set(next.marking.color); markingMesh.visible = next.marking.kind !== 'none';
    markingMesh.scale.set(.22 * (next.marking.kind === 'spot' ? 1.35 : .72), .035, .42 * (next.marking.kind === 'spot' ? .72 : 1));
    markingMesh.position.x = (next.marking.offset - 2) * .12; fly.scale.set(...next.body_scale);
  }
  const cosmetics = new THREE.Group(); cosmetics.name = 'cosmetic-mount'; cosmetics.userData.cosmetic = true; fly.add(cosmetics);
  const allowed = { head: ['head-cap', 'head-crown', 'head-beanie'], face: ['face-glasses', 'face-monocle', 'face-visor'], body: ['body-tie', 'body-bowtie', 'body-vest'], background: ['background-mint', 'background-rose', 'background-graphite'] };
  let current = { head: null, face: null, body: null, background: null };
  function setOutfit(loadout = null) {
    const next = Object.fromEntries(Object.entries(allowed).map(([slot, ids]) => [slot, ids.includes(loadout?.[slot]) ? loadout[slot] : null]));
    if (Object.keys(next).every(slot => next[slot] === current[slot])) return { ...current };
    cosmetics.traverse(o => { o.geometry?.dispose(); if (o.material) o.material.dispose(); });
    cosmetics.clear();
    for (const slot of ['head', 'face', 'body']) if (next[slot]) {
      const group = new THREE.Group(); group.name = next[slot]; group.userData.cosmetic = true; cosmetics.add(group);
      buildAccessory(group, next[slot]);
    }
    current = next; return { ...current };
  }
  applyAppearance(appearance);
  function setAppearance(next){
    const resolved=typeof next==='string'?deriveAppearance(next):next?.version?next:deriveAppearance(next?.fly_id||fly_id||'default');
    fly.userData.appearance=resolved; applyAppearance(resolved); return resolved;
  }
  return { fly, setOutfit, setAppearance, appearance };
}

function buildAccessory(group, id) {
  const cloth = surface('#36a8a5', { roughness: .82, metalness: 0 });
  const gold = surface('#d1b876', { roughness: .38, metalness: .65 });
  const ink = surface('#18232a');
  const add = (geo, mat, pos) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...pos); group.add(mesh); return mesh; };
  if (id === 'head-cap' || id === 'head-beanie') {
    add(new THREE.SphereGeometry(.48, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), cloth, [0,.47,.94]).scale.set(1,.64,.9);
    if (id === 'head-cap') ellipsoid(group, 'cap-brim', [.43,.035,.32], [0,.48,1.30], cloth);
    else { add(new THREE.TorusGeometry(.44,.055,4,8), cloth, [0,.48,.94]).rotation.x = Math.PI / 2; ellipsoid(group, 'pom', [.10,.10,.10], [0,.83,.94], cloth); }
  } else if (id === 'head-crown') {
    add(new THREE.CylinderGeometry(.36,.41,.14,10,1,true), gold, [0,.53,.94]);
    for (let i=0;i<5;i++) { const a=i*Math.PI*2/5; add(new THREE.ConeGeometry(.09,.25,4),gold,[Math.cos(a)*.35,.71,.94+Math.sin(a)*.35]); }
  } else if (id === 'face-glasses' || id === 'face-monocle') {
    for (const side of id === 'face-monocle' ? [-1] : [-1,1]) add(new THREE.TorusGeometry(.28,.025,4,8),id === 'face-monocle' ? gold : ink,[side*.35,.18,1.46]);
    if (id === 'face-glasses') bone(group,[-.08,.21,1.47],[.08,.21,1.47],.024,ink);
    else bone(group,[-.62,.02,1.44],[-.57,-.30,1.36],.012,gold);
  } else if (id === 'face-visor') {
    ellipsoid(group,'visor',[.69,.23,.09],[0,.20,1.45],surface('#91bfc5',{transparent:true,opacity:.48,roughness:.18,depthWrite:false}));
    bone(group,[-.63,.40,1.40],[.63,.40,1.40],.025,ink);
  } else if (id === 'body-tie') {
    ellipsoid(group,'tie-knot',[.08,.08,.06],[0,-.23,1.25],gold);
    add(new THREE.ConeGeometry(.12,.39,4),cloth,[0,-.48,1.21]).rotation.z = Math.PI;
  } else if (id === 'body-bowtie') {
    for (const side of [-1,1]) { const bow=add(new THREE.ConeGeometry(.14,.25,4),gold,[side*.14,-.24,1.25]); bow.rotation.z=side*Math.PI/2; }
    ellipsoid(group,'bow-knot',[.065,.065,.06],[0,-.24,1.29],cloth);
  } else if (id === 'body-vest') {
    // Side panels leave the dorsal stripes, wing roots and legs exposed.
    for (const side of [-1,1]) ellipsoid(group,'vest-panel',[.16,.36,.49],[side*.52,-.02,.18],cloth);
    for (const y of [-.12,.05,.22]) ellipsoid(group,'vest-button',[.035,.035,.025],[0,y,.80],gold,1);
  }
  // Accessory builders share materials within one mount; release unused ones too.
  for (const mat of [cloth,gold,ink]) { let used=false; group.traverse(o => { if(o.material===mat) used=true; }); if(!used) mat.dispose(); }
}
