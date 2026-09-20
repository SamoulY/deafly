import fs from 'node:fs/promises';
import {createRuntime} from './runtime.mjs';
const root=new URL('.',import.meta.url),old=new URL('../003-full-wasm-runtime/',root);
const load=async(url)=>new Uint8Array(await fs.readFile(url));
const meta=JSON.parse(await fs.readFile(new URL('fixture.json',root),'utf8'));
const rt=await createRuntime(meta,(name)=>load(new URL(`fixture/${name}.bin`,root)));
const report={backend:'quantized_full_graph_wasm_fixture',array_bytes:rt.arrayBytes,heap_bytes:rt.heapBytes,frames:[]};
let snapshot;
for(let i=0;i<meta.frames.length;i++){
 if(i===1)snapshot=rt.checkpoint();
 const drive=new Float32Array((await load(new URL(`fixture/drive-${i}.bin`,root))).buffer);
 const r=rt.step(meta.frames[i].args,drive,{kernelLearning:true});
 for(const name of meta.mutable)await fs.writeFile(new URL(`fixture/wasm-${i}-${name}.bin`,root),new Uint8Array(rt.view(name).buffer,rt.view(name).byteOffset,rt.view(name).byteLength));
 report.frames.push({frame:i,seconds:r.seconds,spikes:r.counts.reduce((a,b)=>a+b,0),changed_plastic:rt.plasticWeights.reduce((n,x,p)=>n+(x!==rt.view('baseline_weight')[p]),0)});
}
const end=rt.checkpoint();rt.restore(snapshot);
for(let i=1;i<meta.frames.length;i++)rt.step(meta.frames[i].args,new Float32Array((await load(new URL(`fixture/drive-${i}.bin`,root))).buffer),{kernelLearning:true});
report.restore_replay_exact=meta.mutable.every(k=>Buffer.from(rt.view(k).buffer,rt.view(k).byteOffset,rt.view(k).byteLength).equals(Buffer.from(end[k].buffer)));
if(!report.restore_replay_exact)throw Error('Restore replay mismatch');
// Outer-rule integration API: preserve full precision, restore sparse overrides.
const before=rt.plasticWeights[0]; rt.plasticWeights[0]=Math.fround(before*1.01234567);
report.external_sparse_update_exact=rt.plasticWeights[0]===Math.fround(before*1.01234567);
rt.restore(end);report.external_update_restore_exact=rt.plasticWeights[0]===before;
await fs.writeFile(new URL('wasm-results.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));rt.dispose();
