import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {sampleRGB} from './sensory.mjs';
async function load(name,T){const b=await readFile(new URL('fixture/'+name+'.bin',import.meta.url));return new T(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
const rgb=await load('rgb',Uint8Array);let maxError=0;
for(const [uvName,expectedName,ch] of [['uv','samples',null],['r8uv','r8samples',await load('r8channel',Int32Array)]]){
 const uv=await load(uvName,Float32Array),expected=await load(expectedName,Float32Array),actual=sampleRGB(rgb,64,32,uv,ch);
 for(let i=0;i<actual.length;i++){const e=Math.abs(actual[i]-expected[i]);maxError=Math.max(maxError,e);assert.ok(e<2e-7,`${i}:${e}`);}
}
console.log(JSON.stringify({pass:true,maxError,scope:'R1-R6 and R8 RGB sample parity; drive and full visual closed-loop not yet verified'}));
