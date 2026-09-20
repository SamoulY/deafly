import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {createRuntime} from '../004-quantized-wasm-runtime/runtime.mjs';import {advance,createState,checkpoint,effectiveWeights} from './rule.mjs';
const root=new URL('../004-quantized-wasm-runtime/',import.meta.url);
const meta=JSON.parse(await readFile(new URL('fixture.json',root)));
const bytes=async name=>{const b=await readFile(new URL('fixture/'+name+'.bin',root));return new Uint8Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const gainbuf=await readFile(new URL('fixture/gain.bin',import.meta.url));const gain=new Float32Array(gainbuf.buffer.slice(gainbuf.byteOffset,gainbuf.byteOffset+gainbuf.byteLength));
const rt=await createRuntime(meta,name=>bytes(name));
try{
 const n=meta.nplastic,d=gain.length/n,s=createState(n,d),baseline=rt.view('baseline_weight').slice();
 const pre=rt.view('plastic_pre'),danIndex=rt.view('dan_index'),danNodes=Array(d).fill(-1);
 for(let i=0;i<danIndex.length;i++)if(danIndex[i]>=0)danNodes[danIndex[i]]=i;
 assert.ok(danNodes.every(x=>x>=0));
 const drive=new Float32Array((await bytes('drive-1')).buffer),args=meta.frames[1].args.slice();args[12]=100;
 const neural=rt.checkpoint(),start=checkpoint(s);
 function run(state){const frames=[];for(let k=0;k<12;k++){
  const r=rt.step(args,drive);const kc=Float64Array.from(pre,i=>r.counts[i]/.01),dan=Float64Array.from(danNodes,i=>r.counts[i]/.01);
  advance(state,kc,dan,gain,.01,.001,{learning:true});effectiveWeights(state,baseline,rt.plasticWeights);
  frames.push(r.counts.reduce((a,b)=>a+b,0));
 }return frames;}
 const spikes=run(s),end=rt.checkpoint();rt.restore(neural);const replay=checkpoint(start);assert.deepEqual(run(replay),spikes);assert.deepEqual(replay,s);assert.deepEqual(rt.checkpoint(),end);
 const report={pass:true,scope:'full quantized kernel plus outer rule driven by actual full-network counts; controlled stimulation, not live market or Python closed-loop parity',spikes,restoreExact:true,changedPlastic:rt.plasticWeights.reduce((n,w,i)=>n+(w!==baseline[i]),0),heapBytes:rt.heapBytes};
 await writeFile(new URL('integration-results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{rt.dispose();}
