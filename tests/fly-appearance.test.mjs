import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlyModel, deriveAppearance } from '../pages/fly-model.js';

test('appearance is deterministic and renders phenotype parts', () => {
  const a = deriveAppearance('fly-alpha');
  assert.deepEqual(a, deriveAppearance('fly-alpha'));
  assert.notDeepEqual(a, deriveAppearance('fly-beta'));
  const { fly } = createFlyModel('fly-alpha');
  const parts = [];
  fly.traverse(object => { if (object.userData.part) parts.push(object.userData.part); });
  for (const part of ['thorax', 'compound-eye', 'wing', 'marking']) assert.ok(parts.includes(part), part);
  assert.equal(fly.userData.appearance.fly_id, 'fly-alpha');
  assert.ok(fly.scale.x !== 1 || fly.scale.y !== 1 || fly.scale.z !== 1);
});

test('setAppearance updates phenotype without changing cosmetic mount', () => {
  const model = createFlyModel('fly-alpha');
  model.setOutfit({ head: 'head-cap', face: 'face-glasses' });
  const cosmetics = model.fly.getObjectByName('cosmetic-mount');
  const resolved = model.setAppearance('fly-beta');
  assert.deepEqual(resolved, deriveAppearance('fly-beta'));
  assert.equal(model.fly.userData.appearance.fly_id, 'fly-beta');
  assert.equal('#'+model.fly.getObjectByName('thorax').material.color.getHexString(),resolved.body_color);
  assert.deepEqual(model.fly.scale.toArray(),resolved.body_scale);
  assert.equal(model.fly.getObjectByName('cosmetic-mount'), cosmetics);
  assert.ok(cosmetics.children.length > 0);
});
