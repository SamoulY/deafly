export function checkpointLabel(s){return s?.state==='saved' ? `${s.restored?'RESTORED':'SAVED'} LOCALLY · ${s.hash} · ${s.brain_ms ?? '—'} brain ms` : 'NO SAVED CHECKPOINT · ORIGINAL MODEL ON NEXT AUTONOMOUS START';}
import {createFlyIdentity} from './fly-identity.js';
export async function initializePersonalFly({storage=localStorage,ownerToken,ownerId,apiOrigin,fetchManifest=async()=>{const r=await fetch('/full-brain/manifest.json');if(!r.ok)throw Error(`Manifest HTTP ${r.status}`);return r.json();}}){
 const mapped=apiOrigin&&ownerId?storage.getItem(`defly.checkpoint-owner:${apiOrigin}:${ownerId}`):null;
 const owner=apiOrigin&&ownerId?JSON.stringify([apiOrigin,ownerId]):ownerToken||ownerId;
 if(!owner)throw Error('Session owner required before personal fly initialization');
 const manifest=await fetchManifest();if(!/^[a-f0-9]{64}$/i.test(manifest.manifest_hash||''))throw Error('Invalid full-brain manifest hash');
 const checkpointKey=mapped&&/^[a-f0-9]{64}$/i.test(mapped)?mapped:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner))),v=>v.toString(16).padStart(2,'0')).join('');
 const identity=await createFlyIdentity(storage,{owner_scope:checkpointKey,genesis_model_hash:manifest.manifest_hash,kernel_hash:manifest.kernel_hash});return {identity,checkpointKey};
}
