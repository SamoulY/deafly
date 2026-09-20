import kernel from './kernel.mjs';import {advance,createState,effectiveWeights} from './rule.mjs';import {buildDrive} from './sensory.mjs';
const types={'<u4':Uint32Array,'<i4':Int32Array,'<i2':Int16Array,'<i8':BigInt64Array,'<f4':Float32Array,'<f8':Float64Array,'|u1':Uint8Array,'|i1':Int8Array};
export const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
export async function createBrain(progress=()=>{}){
 const base=new URL('.',import.meta.url),m=await fetch(new URL('manifest.json',base)).then(r=>r.json()),abi=await fetch(new URL('abi.json',base)).then(r=>r.json()),mod=await kernel();
 const arrays={},ptrs={};let loaded=0;
 function allocate(name,Type,bytes){const p=mod._malloc(bytes);if(!p)throw Error('Model allocation failed');ptrs[name]=p;arrays[name]=new Type(mod.HEAPU8.buffer,p,bytes/Type.BYTES_PER_ELEMENT);return arrays[name];}
 // Allocate every buffer before creating stable views, as heap growth detaches old views.
 const specs={};for(const [name,d]of Object.entries(m.arrays))specs[name]={Type:types[d.dtype],bytes:d.byteLength};
 const aliases={ptr:'ptr',post:'post',weight:'contact',plastic_edge:'plastic_edges',plastic_pre:'plastic_pre',baseline_weight:'plastic_baseline',dan_gain:'plastic_gain',kc_mask:'plastic_kc_mask',dan_index:'plastic_dan_index',modulation_mask:'modulation_mask'};
 for(const [name,d]of Object.entries(abi.arrays))if(!aliases[name])specs[name]={Type:types[d.dtype],bytes:d.bytes};
 for(const [name,s]of Object.entries(specs))allocate(name,s.Type,s.bytes);
 for(const [name,s]of Object.entries(specs))arrays[name]=new s.Type(mod.HEAPU8.buffer,ptrs[name],s.bytes/s.Type.BYTES_PER_ELEMENT);
 for(const [name,d]of Object.entries(m.arrays)){
  const dst=new Uint8Array(arrays[name].buffer,arrays[name].byteOffset,arrays[name].byteLength);
  for(const c of d.chunks){const r=await fetch(new URL(c.file,base));if(!r.ok)throw Error('Model chunk HTTP '+r.status);const reader=r.body.pipeThrough(new DecompressionStream('gzip')).getReader();let offset=c.offset;while(true){const x=await reader.read();if(x.done)break;if(offset+x.value.length>c.offset+c.byteLength)throw Error('Chunk overflow');dst.set(x.value,offset);offset+=x.value.length;}if(offset!==c.offset+c.byteLength||await hash(dst.subarray(c.offset,offset))!==c.sha256)throw Error('Model integrity failed');loaded+=c.byteLength;progress(loaded,m.sizes.decodedBytes);}
 }
 for(const [name,target]of Object.entries(aliases)){arrays[name]=arrays[target];ptrs[name]=ptrs[target];}
 const n=m.nodes;arrays.rest.fill(-52);for(let i=0;i<n;i++)if(arrays.kc_mask[i])arrays.rest[i]=-60;arrays.v.set(arrays.rest);arrays.last.fill(-1n);
 const initial=[...new Set([...arrays.retina,...arrays.lamina,...arrays.sugar])].sort((a,b)=>a-b);arrays.active.set(initial);for(const i of initial)arrays.flags[i]=1;arrays.nactive[0]=initial.length;arrays.plastic_weight.set(arrays.plastic_baseline);
 for(const e of arrays.r8_corrected_edges)arrays.contact[e]=Math.abs(arrays.contact[e]);
 const sensory={luminance:new Float32Array(arrays.retina.length),r8Light:new Float32Array(arrays.r8.length)},learning=createState(m.plasticEdges,arrays.plastic_dan.length);let simulated=0;
 const args=abi.args.map(x=>typeof x==='object'?ptrs[x.array]:x);args[31]=0;args[12]=100;
 return {m,arrays,mod,learning,sensory,get brainMs(){return simulated;},restoreBrainMs(ms){simulated=ms;},get heapBytes(){return mod.HEAPU8.byteLength;},observe(rgb,width,height,duration=10,reinforcement="none"){
  if(!Number.isInteger(duration)||duration<=0||duration>1000)throw Error('Invalid duration');const total=new Int32Array(n);let wall=0;
  for(let remaining=duration;remaining>0;remaining-=10){const ms=Math.min(10,remaining);args[12]=Math.round(ms/.1);const drive=buildDrive({...arrays,nodes:n},sensory,rgb,width,height,ms);arrays.drive.set(drive);if(reinforcement!=="none" && duration-remaining<200){for(const i of m.reinforcement[reinforcement])arrays.drive[i]+=20;}arrays.counts.fill(0);const start=performance.now();mod._memory_advance(...args);wall+=performance.now()-start;
   advance(learning,Float64Array.from(arrays.plastic_pre,i=>arrays.counts[i]/(ms/1000)),Float64Array.from(arrays.plastic_dan,i=>arrays.counts[i]/(ms/1000)),arrays.plastic_gain,ms/1000,.001);effectiveWeights(learning,arrays.plastic_baseline,arrays.plastic_weight);for(let i=0;i<n;i++)total[i]+=arrays.counts[i];simulated+=ms;}
  const mean=ix=>ix.reduce((a,i)=>a+total[i],0)/ix.length/(duration/1000),left=mean(m.decoder.left),right=mean(m.decoder.right),gate=m.decoder.gate.reduce((a,i)=>a+total[i],0);
  return {counts:total,simulated_ms:duration,brain_ms:simulated,compute_ms:wall,decoder:{left_hz:left,right_hz:right,difference_hz:right-left,gate_spikes:gate,threshold_hz:5,proposed_action:!gate||Math.abs(right-left)<5?'HOLD':right>left?'BUY':'SELL'}};
 }};
}
