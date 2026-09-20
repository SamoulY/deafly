// Mutable state only. Base graph remains manifest-verified, never duplicated in a checkpoint.
const names=['v','g','refractory','drive','previous_drive','queue','queue_count','counts','active','nactive','last','eligibility','eligibility_last','modulation','modulation_last','rest','adaptation','clock','flags','plastic_weight'];
const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
async function sha(a){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');}
function views(brain){const out={};for(const k of names){if(!ArrayBuffer.isView(brain.arrays[k]))throw Error('Missing checkpoint array '+k);out['kernel:'+k]=brain.arrays[k];}for(const group of ['learning','sensory'])for(const [k,v] of Object.entries(brain[group])){if(!ArrayBuffer.isView(v))throw Error('Unsupported checkpoint state '+k);out[group+':'+k]=v;}return out;}
export async function captureCheckpoint(brain,scope){
 if(scope!=='autonomy')throw Error('Checkpoint scope mismatch');
 const entries={};for(const [k,a] of Object.entries(views(brain))){const data=bytes(a).slice();entries[k]={type:a.constructor.name,data,hash:await sha(data)};}
 const meta={version:1,scope,manifest_hash:brain.m.manifest_hash,brain_ms:brain.brainMs,entries:Object.entries(entries).map(([k,v])=>[k,v.type,v.data.length,v.hash])};
 return {meta,entries,hash:await sha(new TextEncoder().encode(JSON.stringify(meta)))};
}
export async function restoreCheckpoint(brain,checkpoint,scope){
 const {meta,entries,hash}=checkpoint||{};
 if(meta?.version!==1||scope!=='autonomy'||meta.scope!==scope||meta.manifest_hash!==brain.m.manifest_hash||!Number.isSafeInteger(meta.brain_ms)||meta.brain_ms<0)throw Error('Incompatible checkpoint');
 if(hash!==await sha(new TextEncoder().encode(JSON.stringify(meta))))throw Error('Checkpoint metadata corrupt');
 const targets=views(brain),descriptors=Object.entries(targets).map(([k,a])=>{const v=entries?.[k];if(!v||!(v.data instanceof Uint8Array)||v.type!==a.constructor.name||v.data.byteLength!==a.byteLength)throw Error('Checkpoint shape mismatch');return [k,v.type,v.data.length,v.hash];});
 if(JSON.stringify(descriptors)!==JSON.stringify(meta.entries)||Object.keys(entries).length!==descriptors.length)throw Error('Checkpoint inventory mismatch');
 // Validate ALL bytes before changing any state.
 for(const [k] of descriptors)if(await sha(entries[k].data)!==entries[k].hash)throw Error('Checkpoint data corrupt');
 for(const [k,a] of Object.entries(targets))bytes(a).set(entries[k].data);
 brain.restoreBrainMs(meta.brain_ms);
 return hash;
}
export function checkpointStore(indexedDB=globalThis.indexedDB){
 async function run(key,value,write){if(!key||typeof key!=='string')throw Error('Checkpoint owner required');if(!indexedDB)throw Error('Checkpoint storage unavailable');const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('defly-full-brain',1);r.onupgradeneeded=()=>r.result.createObjectStore('checkpoints');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('checkpoints',write?'readwrite':'readonly'),s=tx.objectStore('checkpoints'),r=write?s.put(value,key):s.get(key);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Checkpoint save aborted'));});}finally{db.close();}}
 return {load:key=>run(key,null,false),save:(key,value)=>run(key,value,true)};
}
