import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../pages/vendor-three.js';

const model = await import('../pages/fly-model.js').catch(() => ({}));

test('outfits replace only cosmetic mounts and support clearing and invalid slot IDs', () => {
  const { fly, setOutfit } = model.createFlyModel();
  assert.equal(typeof setOutfit, 'function');
  const anatomy = fly.children.filter(o => !o.userData.cosmetic);
  const bounds = anatomy.map(o => o.position.toArray());
  const loaded = { head: 'head-cap', face: 'face-glasses', body: 'body-tie', background: 'background-mint' };
  assert.deepEqual(setOutfit(loaded), loaded);
  const mount = fly.children.find(o => o.userData.cosmetic);
  assert.equal(mount.children.length, 3);
  const oldMesh = mount.children[0].children.find(o => o.isMesh);
  let disposed = false; oldMesh.geometry.addEventListener('dispose', () => { disposed = true; });
  assert.deepEqual(setOutfit({head:'head-crown',face:'face-monocle',body:'body-bowtie',background:'background-rose'}), {head:'head-crown',face:'face-monocle',body:'body-bowtie',background:'background-rose'});
  assert.ok(disposed, 'replaced cosmetic geometry is released');
  assert.equal(mount.children.length, 3);
  assert.deepEqual(setOutfit({head:'head-beanie',face:'face-visor',body:'body-vest',background:'background-graphite'}), {head:'head-beanie',face:'face-visor',body:'body-vest',background:'background-graphite'});
  assert.deepEqual(setOutfit({ head: 'body-vest', face: 'unknown', background: '#ffffff' }), { head:null, face:null, body:null, background:null });
  assert.equal(mount.children.length, 0);
  assert.deepEqual(fly.children.filter(o => !o.userData.cosmetic), anatomy);
  assert.deepEqual(anatomy.map(o => o.position.toArray()), bounds);
  assert.deepEqual(setOutfit(null), {head:null, face:null, body:null, background:null});
});

test('fly has a compact segmented silhouette, six articulated feet, compound eyes and veined wings', () => {
  assert.equal(typeof model.createFlyModel, 'function', 'procedural fly model is available');
  const { fly } = model.createFlyModel();
  const parts = [];
  fly.traverse(o => parts.push(o));
  assert.equal(parts.filter(o => o.userData.part === 'leg').length, 6);
  for (const leg of parts.filter(o => o.userData.part === 'leg')) {
    assert.equal(leg.children.filter(o => o.isMesh).length, 3, 'femur, tibia, tarsus');
  }
  assert.ok(parts.filter(o => o.userData.part === 'abdomen-segment').length >= 4);
  assert.equal(parts.filter(o => o.userData.part === 'compound-eye').length, 2);
  assert.equal(parts.filter(o => o.userData.part === 'antenna').length, 2);
  const wings = parts.filter(o => o.userData.part === 'wing');
  assert.equal(wings.length, 2);
  for (const wing of wings) {
    const wingBounds = new THREE.Box3().setFromObject(wing);
    assert.ok(wingBounds.max.z < .55, 'wings trail behind the head, never across the eyes');
    assert.equal(wing.geometry.type, 'ShapeGeometry');
    assert.ok(wing.material.transparent);
    assert.ok(wing.children.some(o => o.isLineSegments), 'visible wing veins');
  }
  const bounds = new THREE.Box3().setFromObject(fly);
  assert.ok(bounds.max.z > 1, 'head points toward local +Z');
  assert.ok(bounds.max.x - bounds.min.x < 5, 'compact wingspan');
  for (const eye of parts.filter(o => o.userData.part === 'compound-eye')) {
    assert.ok(eye.geometry.attributes.position.count <= 240, 'low-poly compound-eye budget');
  }
});
