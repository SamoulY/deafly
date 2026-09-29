const KEY='defly.fly.identity.v1';
const pending=new WeakMap();
const stable=v=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';};
const hex=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
function storageKey(model){
  return model?.owner_scope ? `${KEY}:${String(model.owner_scope)}` : KEY;
}
export async function createFlyIdentity(storage=localStorage,model={}){
  const key=storageKey(model), existing=storage.getItem(key);
  if(existing)return JSON.parse(existing);
  // Native localStorage is shared across realms: hold an origin-wide, per-key
  // Web Lock through the canonical re-read, generation and durable write.
  // Explicitly injected stores are single-realm adapters (e.g. test memory),
  // protected by pending below; shared adapters must provide their own locking.
  const native=typeof globalThis.localStorage!=='undefined'&&storage===globalThis.localStorage;
  if(native&&typeof globalThis.navigator?.locks?.request!=='function')throw Error('Reliable cross-tab identity lock unavailable');
  let stores=pending.get(storage); if(!stores){stores=new Map();pending.set(storage,stores);}
  if(stores.has(key))return stores.get(key);
  const create=(async()=>{
    const critical=async()=>{
      const afterWait=storage.getItem(key); if(afterWait)return JSON.parse(afterWait);
      const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
      const pub=await crypto.subtle.exportKey('jwk',keys.publicKey),priv=await crypto.subtle.exportKey('jwk',keys.privateKey),nonce=crypto.randomUUID(),genesis_model_hash=model.genesis_model_hash||'unknown';
      const fly_id=await hex(new TextEncoder().encode(stable({owner_public_key:pub,genesis_model_hash,nonce})));
      const identity={protocol:'defly-federation-v1',fly_id,owner_public_key:pub,private_key:priv,genesis_model_hash,kernel_hash:model.kernel_hash||null,nonce,created_at:Date.now()};
      storage.setItem(key,JSON.stringify(identity)); return identity;
    };
    return native?await navigator.locks.request(`defly.fly.identity:${key}`,critical):await critical();
  })();
  stores.set(key,create);
  try{return await create;}finally{stores.delete(key);}
}
export async function signManifest(identity,payload){const {private_key,...base}=identity;const data={...base,...payload,protocol:'defly-federation-v1',fly_id:identity.fly_id,owner_public_key:identity.owner_public_key,nonce:identity.nonce};const key=await crypto.subtle.importKey('jwk',private_key,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);const signed_payload=stable(data);const signature= btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(signed_payload))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return {...data,signed_payload,signature};}
export function exportIdentity(identity){return JSON.stringify({...identity,private_key:undefined});}