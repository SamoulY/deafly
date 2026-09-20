import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {advance,createState,checkpoint,effectiveWeights} from './rule.mjs';
const root=new URL('.',import.meta.url),meta=JSON.parse(await readFile(new URL('fixture.json',root)));
async function load(name,Type=Float64Array){const b=await readFile(new URL('fixture/'+name+'.bin',root));return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
const gain=await load('gain',Float32Array),base=await load('baseline',Float32Array),s=createState(meta.n,meta.d),weights=base.slice();
let maxError=0,saved;const inputs=[];
for(let i=0;i<meta.frames.length;i++){
 const f=meta.frames[i],kc=await load(i+'-kc'),dan=await load(i+'-dan');inputs.push({kc,dan,f});
 const before=checkpoint(s),oldWeights=weights.slice();
 advance(s,kc,dan,gain,f.h,.001,f);effectiveWeights(s,base,weights,f);
 for(const key of Object.keys(s)){
  const expected=await load(i+'-'+key);
  for(let j=0;j<expected.length;j++){const error=Math.abs(s[key][j]-expected[j]);maxError=Math.max(maxError,error);assert.ok(error<=1e-11+Math.abs(expected[j])*1e-11,`${i}:${key}:${j}:${error}`);}
 }
 if(f.frozen){assert.deepEqual(s.u,before.u);assert.deepEqual(s.w,before.w);assert.deepEqual(weights,oldWeights);}
 if(i===5)saved=checkpoint(s);
}
const restored=checkpoint(saved);
for(const {kc,dan,f} of inputs.slice(6))advance(restored,kc,dan,gain,f.h,.001,f);
assert.deepEqual(restored,s);assert.ok(s.w.some(x=>x!==0));
const report={pass:true,plasticEdges:meta.n,DANs:meta.d,frames:meta.frames.length,maxAbsoluteError:maxError,checkpointContinuationExact:true,frozenWeightsPreserved:true,scope:'outer learning rule against Python; controlled rate inputs, not complete closed-loop inference'};
await writeFile(new URL('results.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
