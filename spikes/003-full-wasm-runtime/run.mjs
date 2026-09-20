import createKernel from './kernel.mjs';
// Shared browser/Node runner: every original typed array is allocated without pruning.
export async function run(loadBytes, meta, observe = () => {}) {
 const module = await createKernel();
 const pointers = {};
 for (const [name, spec] of Object.entries(meta.arrays)) {
  pointers[name] = module._malloc(spec.bytes);
  if (!pointers[name]) throw Error(`Allocation failed: ${name}`);
  module.HEAPU8.set(await loadBytes(`fixture/${name}.bin`), pointers[name]);
 }
 const frames = [];
 for (let i=0; i<meta.frames.length; i++) {
  module.HEAPU8.set(await loadBytes(`fixture/drive-${i}.bin`), pointers.drive);
  module.HEAPU8.fill(0,pointers.counts,pointers.counts+meta.arrays.counts.bytes);
  const args=meta.frames[i].args.map(x => typeof x==='object' ? pointers[x.array] : x);
  const start=performance.now(); module._memory_advance(...args);
  const seconds=(performance.now()-start)/1000;
  const counts=new Int32Array(module.HEAPU8.buffer,pointers.counts,meta.n);
  const record={frame:i,seconds,spikes:counts.reduce((a,b)=>a+b,0),heap_bytes:module.HEAPU8.byteLength};
  frames.push(record);
  await observe(i,module,pointers,record);
 }
 return {frames, allocated_array_bytes:Object.values(meta.arrays).reduce((s,a)=>s+a.bytes,0)};
}
if (typeof process !== 'undefined' && process.versions?.node) {
 const fs=await import('node:fs/promises');
 const root=new URL('.',import.meta.url);
 const load=async path=>new Uint8Array(await fs.readFile(new URL(path,root)));
 const meta=JSON.parse(await fs.readFile(new URL('fixture.json',root),'utf8'));
 const results=await run(load,meta,async(i,m,p,r)=>{
  for(const name of meta.mutable) await fs.writeFile(new URL(`fixture/wasm-${i}-${name}.bin`,root),m.HEAPU8.subarray(p[name],p[name]+meta.arrays[name].bytes));
  console.log(JSON.stringify(r));
 });
 await fs.writeFile(new URL('wasm-results.json',root),JSON.stringify(results,null,2));
}
