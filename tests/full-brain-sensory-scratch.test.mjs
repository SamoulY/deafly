import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDrive} from '../pages/full-brain/sensory.mjs';

test('buildDrive reuses full-size sensory scratch buffers without changing output contract',()=>{
  const graph={nodes:4,uv:new Float32Array([0,0]),retina:new Uint32Array([0]),r8_uv:new Float32Array([1,1]),r8:new Uint32Array([1]),r8_channel:new Uint8Array([0]),lamina:new Uint32Array([2])};
  const state={luminance:new Float32Array(1),r8Light:new Float32Array(1),drive:new Float32Array(4),light:new Float32Array(1),r8Sample:new Float32Array(1)};
  const rgb=new Uint8Array([255,0,0,0,255,0]);
  const first=buildDrive(graph,state,rgb,2,1,10);
  const second=buildDrive(graph,state,rgb,2,1,10);
  assert.strictEqual(first,state.drive);
  assert.strictEqual(second,state.drive);
  assert.strictEqual(state.light.length,1);
  assert.strictEqual(state.r8Sample.length,1);
});

test('buildDrive still allocates compatible scratch when state has no buffers',()=>{
  const graph={nodes:1,uv:new Float32Array([0,0]),retina:new Uint32Array([0]),r8_uv:new Float32Array([]),r8:new Uint32Array([]),r8_channel:new Uint8Array([]),lamina:new Uint32Array([])};
  const state={luminance:new Float32Array(1),r8Light:new Float32Array(0)};
  const out=buildDrive(graph,state,new Uint8Array([0,0,0]),1,1,10);
  assert.ok(out instanceof Float32Array);
  assert.equal(out.length,1);
});
