import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright';

for(const [name,engine] of Object.entries({chromium,webkit}))test(`${name}: IndexedDB compare-and-swap protects checkpoints across tabs`,async()=>{
 const source=await readFile(new URL('../pages/full-brain/checkpoint.mjs',import.meta.url));
 const server=createServer((req,res)=>{if(req.url==='/checkpoint.mjs'){res.setHeader('content-type','text/javascript');res.end(source);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><title>Checkpoint test</title>');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await engine.launch();const context=await browser.newContext();const a=await context.newPage(),b=await context.newPage();
  const url=`http://127.0.0.1:${server.address().port}`;await Promise.all([a.goto(url),b.goto(url)]);
  const save=(page,key,hash,parent,brain_ms=0)=>page.evaluate(async({key,hash,parent,brain_ms})=>{
   const {checkpointStore}=await import('/checkpoint.mjs');
   try{await checkpointStore().save(key,{hash,meta:{brain_ms}},parent);return 'saved';}catch(e){return e.message;}
  },{key,hash,parent,brain_ms});
  const load=page=>page.evaluate(async()=>{const {checkpointStore}=await import('/checkpoint.mjs');return checkpointStore().load('owner');});
  assert.equal(await save(a,'owner','seed',null),'saved');
  const raced=await Promise.all([save(a,'owner','branch-a','seed',200),save(b,'owner','branch-b','seed',200)]);
  assert.equal(raced.filter(x=>x==='saved').length,1);assert.match(raced.find(x=>x!=='saved'),/another tab/);
  const latest=await load(a);assert.match(await save(b,'owner','stale','seed',999),/another tab/);
  assert.match(await save(b,'owner','unversioned',undefined),/Expected checkpoint hash/);
  assert.equal(await save(b,'other-owner','isolated',null),'saved');assert.deepEqual(await load(a),latest);
  await b.reload();assert.deepEqual(await load(b),latest);
  assert.equal(await save(b,'owner','resumed',latest.hash,300),'saved');assert.equal((await load(a)).hash,'resumed');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
