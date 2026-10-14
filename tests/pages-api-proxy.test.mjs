import test from 'node:test';
import assert from 'node:assert/strict';
import proxy from '../pages/_worker.js';
import {createSessionClient,checkpointMapKey} from '../pages/session-client.js';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile} from 'node:fs/promises';
test('first-party proxy pins upstream, forwards authentication and set-cookie, and strips unrelated cookies',async()=>{
 let outgoing;
 const env={DEFLY_API:{fetch:async request=>{outgoing=request;return new Response('{"ok":true}',{headers:{'set-cookie':'flydesk_session='+'b'.repeat(64)+'; Path=/; HttpOnly; Secure; SameSite=None'}});}}};
 const request=new Request('https://defly.99x.meme/api/account/login?return=https://evil.test',{method:'POST',headers:{origin:'https://defly.99x.meme',cookie:'unrelated=private; flydesk_session='+'a'.repeat(64),'x-session-token':'guest','cf-connecting-ip':'192.0.2.4'},body:'{"username":"test"}'});
 const result=await proxy.fetch(request,env);assert.equal(new URL(outgoing.url).origin,'https://flydesk-v2-trial-worker.testcf-195.workers.dev');assert.equal(outgoing.headers.get('cookie'),'flydesk_session='+'a'.repeat(64));assert.equal(outgoing.headers.get('origin'),'https://defly.99x.meme');assert.equal(outgoing.headers.get('x-session-token'),'guest');assert.equal(outgoing.headers.get('cf-connecting-ip'),'192.0.2.4');assert.match(result.headers.get('set-cookie'),/HttpOnly/);assert.equal(result.headers.get('cache-control'),'no-store');
 assert.equal(await outgoing.text(),'{"username":"test"}');
 const asset=await proxy.fetch(new Request('https://defly.99x.meme/app.js'),{ASSETS:{fetch:()=>new Response('asset')}});assert.equal(await asset.text(),'asset');
 assert.equal((await proxy.fetch(new Request('https://defly.99x.meme/api/account/login',{method:'DELETE'}),{})).status,405);
});
test('same-origin transport retains existing guest token and checkpoint identity namespace',async()=>{
 const origin='https://old-api.test',transportOrigin='https://defly.test',values=new Map([[`defly.session:${origin}`,'original-token']]),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};let called;
 const client=createSessionClient({origin,transportOrigin,storage,cookieMode:true,fetch:async(url,options)=>{called={url,options};return Response.json({user:{id:'original-user'}});}});
 await client.restore();assert.equal(called.url,transportOrigin+'/api/state');assert.equal(called.options.headers['X-Session-Token'],'original-token');assert.equal(called.options.credentials,'include');assert.ok(values.has(checkpointMapKey(origin,'original-user')));assert.equal(values.has(checkpointMapKey(transportOrigin,'original-user')),false);
});
test('Pages proxy executes through a real Worker service binding',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'pages',modules:true,script:await readFile('pages/_worker.js','utf8'),compatibilityDate:'2026-09-15',serviceBindings:{DEFLY_API:'api'}},{name:'api',modules:true,compatibilityDate:'2026-09-15',script:`export default {async fetch(r){return Response.json({path:new URL(r.url).pathname,body:await r.text(),token:r.headers.get('x-session-token'),ip:r.headers.get('cf-connecting-ip')},{headers:{'set-cookie':'flydesk_session=sample; Path=/; HttpOnly; Secure; SameSite=None'}})}}`}]}));t.after(()=>mf.dispose());
 const response=await mf.dispatchFetch('https://defly.example/api/account/login',{method:'POST',headers:{'x-session-token':'guest','cf-connecting-ip':'192.0.2.7'},body:'{"test":true}'});assert.equal(response.status,200);assert.deepEqual(await response.json(),{path:'/api/account/login',body:'{"test":true}',token:'guest',ip:'192.0.2.7'});assert.match(response.headers.get('set-cookie'),/HttpOnly/);
});
