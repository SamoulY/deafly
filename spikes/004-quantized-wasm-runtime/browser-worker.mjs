import {createRuntime} from './runtime.mjs';
self.onmessage = async () => {
 let rt;
 try {
  const meta = await fetch('./fixture.json').then(r => r.json());
  const load = async name => { const r = await fetch(`./fixture/${name}.bin`); if (!r.ok) throw Error(`HTTP ${r.status}: ${name}`); return new Uint8Array(await r.arrayBuffer()); };
  rt = await createRuntime(meta, name => load(name));
  const frames = [];
  for (let i=0;i<meta.frames.length;i++) {
   const drive = new Float32Array((await load(`drive-${i}`)).buffer);
   const result = rt.step(meta.frames[i].args, drive, {kernelLearning:true});
   frames.push({spikes:result.counts.reduce((a,b)=>a+b,0),seconds:result.seconds});
  }
  self.postMessage({ok:true,scope:'full graph quantized kernel fixture; not live market inference or outer learning',frames,arrayBytes:rt.arrayBytes,heapBytes:rt.heapBytes});
 } catch(e) { self.postMessage({ok:false,error:e.stack}); }
 finally {rt?.dispose();}
};
