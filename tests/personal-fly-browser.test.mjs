import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
for(const [name,engine] of Object.entries({chromium,webkit}))test(`${name}: personal identities survive reload and remain owner-isolated with real phenotype materials`,async()=>{
 const root=resolve('pages');
 const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Personal fly test</title>');return;}const p=resolve(root,'.'+path);if(!p.startsWith(root+'/'))throw Error('path');res.setHeader('content-type',['.js','.mjs'].includes(extname(p))?'text/javascript':'application/json');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await engine.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const inspect=()=>page.evaluate(async()=>{const {initializePersonalFly}=await import('/personal-fly.js');const {createFlyModel}=await import('/fly-model.js');const a=await initializePersonalFly({ownerToken:'fixture-owner-a'}),b=await initializePersonalFly({ownerToken:'fixture-owner-b'});const model=createFlyModel(a.identity);model.setOutfit({head:'head-cap'});model.setAppearance(b.identity);return {a:a.identity.fly_id,b:b.identity.fly_id,key:a.checkpointKey,genesis:a.identity.genesis_model_hash,body:'#'+model.fly.getObjectByName('thorax').material.color.getHexString(),expected:model.fly.userData.appearance.body_color,outfit:model.fly.getObjectByName('cosmetic-mount').children.length};});
 const before=await inspect();await page.reload();const after=await inspect();assert.deepEqual(after,before);assert.notEqual(before.a,before.b);assert.equal(before.body,before.expected);assert.ok(before.outfit>0);assert.match(before.genesis,/^[a-f0-9]{64}$/);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
