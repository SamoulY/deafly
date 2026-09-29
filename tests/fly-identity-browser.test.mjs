import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

async function setup(t) {
  const server=createServer(async(req,res)=>{
    try {
      res.setHeader('content-type',req.url==='/'?'text/html':'text/javascript');
      res.end(req.url==='/'?'<!doctype html><title>Identity test</title>':await readFile(new URL('../pages'+req.url,import.meta.url)));
    } catch {res.statusCode=404;res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const browser=await chromium.launch();t.after(()=>browser.close());
  const context=await browser.newContext();
  const pages=await Promise.all([context.newPage(),context.newPage()]);
  await Promise.all(pages.map(p=>p.goto(`http://127.0.0.1:${server.address().port}/`)));
  return pages;
}

for (const personal of [false,true]) test(`parallel tabs preserve ${personal?'personal scoped':'legacy'} identity, private key and reload`,async t=>{
  const pages=await setup(t);
  // Hold the first real WebCrypto generation until the second tab has entered
  // initialization. This exposes the async race without replacing key generation.
  await pages[0].evaluate(()=>{
    const generate=crypto.subtle.generateKey.bind(crypto.subtle);
    crypto.subtle.generateKey=async(...args)=>{window.generating=true;await new Promise(r=>window.release=r);return generate(...args)};
  });
  const init=async(page)=>page.evaluate(async personal=>{
    window.entered=true;
    if(personal){const {initializePersonalFly}=await import('/personal-fly.js');return initializePersonalFly({ownerId:'alice',apiOrigin:'https://api.test',fetchManifest:async()=>({manifest_hash:'a'.repeat(64)})});}
    const {createFlyIdentity}=await import('/fly-identity.js');return {identity:await createFlyIdentity()};
  },personal);
  const first=init(pages[0]);
  await pages[0].waitForFunction(()=>window.generating);
  const second=init(pages[1]);
  await pages[1].waitForFunction(()=>window.entered);
  // Give the second independent realm time to reach the lock / WebCrypto.
  await pages[1].waitForTimeout(150);
  await pages[0].evaluate(()=>window.release());
  const [a,b]=await Promise.all([first,second]);
  assert.deepEqual(a,b,'both callers must receive the canonical identity before enrollment');
  await Promise.all(pages.map(p=>p.reload()));
  const identityKey=personal?`defly.fly.identity.v1:${a.checkpointKey}`:'defly.fly.identity.v1';
  const before=await Promise.all(pages.map(p=>p.evaluate(key=>localStorage.getItem(key),identityKey)));
  assert.ok(before.every(Boolean));
  assert.equal(new Set(before.map(v=>JSON.parse(v).fly_id)).size,1);
  for(const p of pages) assert.deepEqual(await init(p),a);
  const proofs=await Promise.all(pages.map(p=>p.evaluate(async identity=>{
    const {signManifest}=await import('/fly-identity.js');return signManifest(identity,{purpose:'colony-enroll',owner_user_id:'alice'});
  },a.identity)));
  assert.equal(proofs[0].fly_id,proofs[1].fly_id);
  const valid=await pages[1].evaluate(async proof=>{
    const key=await crypto.subtle.importKey('jwk',proof.owner_public_key,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    const sig=Uint8Array.from(atob(proof.signature.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,sig,new TextEncoder().encode(proof.signed_payload));
  },proofs[0]);assert.equal(valid,true);
  if(personal){
    const bob=await pages[1].evaluate(async()=>{const {initializePersonalFly}=await import('/personal-fly.js');return initializePersonalFly({ownerId:'bob',apiOrigin:'https://api.test',fetchManifest:async()=>({manifest_hash:'a'.repeat(64)})})});
    assert.notEqual(bob.identity.fly_id,a.identity.fly_id);
    assert.notEqual(bob.checkpointKey,a.checkpointKey);
    assert.deepEqual(await init(pages[1]),a);
  }
});

test('missing or rejected Web Locks fails closed without storage writes',async t=>{
  const [page]=await setup(t);
  const result=await page.evaluate(async()=>{
    const {createFlyIdentity}=await import('/fly-identity.js');
    const outcomes=[];
    for(const locks of [undefined,{request:async()=>{throw Error('Lock access denied')}}]){
      Object.defineProperty(navigator,'locks',{value:locks,configurable:true});
      try{await createFlyIdentity();outcomes.push('unsafe success')}catch(e){outcomes.push(e.message)}
    }
    return {outcomes,length:localStorage.length};
  });
  assert.match(result.outcomes[0],/cross-tab identity lock unavailable/);
  assert.match(result.outcomes[1],/Lock access denied/);
  assert.equal(result.length,0);
});

test('existing legacy and mapped scoped identities survive without locks; injected memory stays supported',async t=>{
  const [page]=await setup(t);
  const result=await page.evaluate(async()=>{
    const {createFlyIdentity}=await import('/fly-identity.js');
    const {initializePersonalFly}=await import('/personal-fly.js');
    const legacy=await createFlyIdentity();
    const scope='b'.repeat(64);
    const scoped=await createFlyIdentity(localStorage,{owner_scope:scope});
    localStorage.setItem('defly.checkpoint-owner:https://api.test:alice',scope);
    const before=JSON.stringify({...localStorage});
    Object.defineProperty(navigator,'locks',{value:undefined});
    const restored=await initializePersonalFly({ownerId:'alice',apiOrigin:'https://api.test',fetchManifest:async()=>({manifest_hash:'c'.repeat(64)})});
    const restoredLegacy=await createFlyIdentity();
    const map=new Map(),memory={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
    const injected=await Promise.all([createFlyIdentity(memory),createFlyIdentity(memory)]);
    return {legacy,scoped,restored,restoredLegacy,unchanged:before===JSON.stringify({...localStorage}),injectedEqual:injected[0].fly_id===injected[1].fly_id};
  });
  assert.deepEqual(result.restored.identity,result.scoped);
  assert.deepEqual(result.restoredLegacy,result.legacy);
  assert.notEqual(result.legacy.fly_id,result.scoped.fly_id);
  assert.equal(result.restored.checkpointKey,'b'.repeat(64));
  assert.equal(result.unchanged,true);
  assert.equal(result.injectedEqual,true);
});
