import createKernel from './kernel.mjs';
const types={'<u4':Uint32Array,'<i4':Int32Array,'<i2':Int16Array,'<f4':Float32Array,'<f8':Float64Array,'<i8':BigInt64Array,'|u1':Uint8Array,'|i1':Int8Array};
// Runs in a browser Worker or Node. loadArray(name, spec) supplies encoded bytes.
// weight is the historical ABI name for the INT16 contacts, never FP32 edges.
export async function createRuntime(meta, loadArray, options={}) {
 const module=await createKernel(options), pointers={}; let disposed=false;
 try {
  for(const [name,spec] of Object.entries(meta.arrays)) {
   if(!types[spec.dtype]) throw Error(`Unsupported type ${spec.dtype}`);
   const ptr=module._malloc(spec.bytes); if(!ptr)throw Error(`Allocation failed: ${name}`);
   pointers[name]=ptr;
   const data=await loadArray(name,spec);
   if(data.byteLength!==spec.bytes)throw Error(`Array length mismatch: ${name}`);
   module.HEAPU8.set(data,ptr);
  }
 } catch(e) {for(const ptr of Object.values(pointers))module._free(ptr);throw e;}
 const view=name=>{if(disposed)throw Error('Disposed');const s=meta.arrays[name];return new types[s.dtype](module.HEAPU8.buffer,pointers[name],s.bytes/types[s.dtype].BYTES_PER_ELEMENT);};
 const ptr=view('ptr'),edges=view('plastic_edge'),post=view('post');
 if(ptr.length!==meta.n+1 || ptr[0]!==0 || ptr[meta.n]!==meta.edges || post.length!==meta.edges || view('weight').length!==meta.edges || edges.length!==meta.nplastic)throw Error('Graph shape mismatch');
 for(let i=0;i<meta.n;i++)if(ptr[i]>ptr[i+1])throw Error('CSR order mismatch');
 for(let i=0;i<post.length;i++)if(post[i]<0||post[i]>=meta.n)throw Error('Target out of range');
 for(let i=0;i<edges.length;i++)if(edges[i]>=meta.edges||(i&&edges[i]<=edges[i-1]))throw Error('Plastic index order mismatch');
 return {
  module,pointers,meta,view,
  get arrayBytes(){return Object.values(meta.arrays).reduce((s,a)=>s+a.bytes,0);},
  get heapBytes(){return module.HEAPU8.byteLength;},
  // Fresh view each time: safe if the WASM heap grows. External rule writes here.
  get plasticWeights(){return view('plastic_weight');},
  step(args,drive,{kernelLearning=false}={}) {
   if(drive.length!==meta.n)throw Error('Drive length mismatch');
   for(const x of drive)if(!Number.isFinite(x))throw Error('Nonfinite drive');
   view('drive').set(drive);view('counts').fill(0);
   const resolved=args.map(x=>typeof x==='object'?pointers[x.array]:x);
   // Production outer learning owns plastic weights; kernel LTD is opt-in fixture only.
   resolved[31]=kernelLearning?args[31]:0;
   const start=performance.now(); module._memory_advance(...resolved);
   return {seconds:(performance.now()-start)/1000,counts:view('counts'),heap_bytes:module.HEAPU8.byteLength};
  },
  checkpoint(){return Object.fromEntries(meta.mutable.map(k=>[k,view(k).slice()]));},
  restore(snapshot){
   for(const k of meta.mutable)if(!snapshot[k]||snapshot[k].constructor!==types[meta.arrays[k].dtype]||snapshot[k].byteLength!==meta.arrays[k].bytes)throw Error(`Invalid checkpoint ${k}`);
   for(const k of meta.mutable)view(k).set(snapshot[k]);
  },
  dispose(){if(!disposed){for(const ptr of Object.values(pointers))module._free(ptr);disposed=true;}}
 };
}
