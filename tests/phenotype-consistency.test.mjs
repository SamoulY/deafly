import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlyModel,deriveAppearance} from '../pages/fly-model.js';
for(const kind of ['stripe','spot','none'])test(`initial ${kind} phenotype equals an update of the same identity`,()=>{
 const appearance={...deriveAppearance('same-fly'),marking:{kind,color:'#77c6bd',offset:4}};
 const model=createFlyModel({fly_id:'same-fly',appearance});
 const snapshot=()=>{const parts=[];model.fly.traverse(o=>{if(o.isMesh)parts.push({name:o.name,visible:o.visible,scale:o.scale.toArray(),position:o.position.toArray(),color:o.material.color.getHexString()});});return parts;};
 const initial=snapshot();model.setAppearance(appearance);assert.deepEqual(snapshot(),initial);
 const meshes=[];model.fly.getObjectByName('phenotype-marking').traverse(o=>{if(o.isMesh&&o.visible)meshes.push(o)});
 assert.equal(meshes.length,kind==='none'?0:1);
 if(kind!=='none'){assert.ok(meshes[0].scale.y<.1,'marking remains shallow, not unit-sized');assert.equal(model.fly.children.filter(o=>o.name==='phenotype-marking').length,1);}
});
