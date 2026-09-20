import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
test('browser neural UI fails closed on desktop and mobile',async()=>{
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'TEST_OFFLINE'}));}
  if(path==='/neural-anatomy.json'){res.writeHead(404);return res.end();}
  try{const file=path==='/'?'index.html':path.slice(1);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(await readFile(new URL('../pages/'+file,import.meta.url)));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true});
  for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   await page.locator('[data-view="brain"]').click();
   await page.waitForFunction(()=>document.querySelector('#brainScene').dataset.nodeCount==='0');
   assert.match(await page.locator('#neuralTruth').textContent(),/NEURAL ACTIVITY UNAVAILABLE/);
   assert.match(await page.locator('#anatomyStatus').textContent(),/ANATOMY UNAVAILABLE/);
   assert.equal(await page.locator('.brain-detail').getAttribute('open'),'');
   for(const id of ['spikes','brainTime','leftHz','rightHz','diffHz'])assert.equal(await page.locator('#'+id).textContent(),'—');
   await page.screenshot({path:`/tmp/defly-neural-unavailable-${name}.png`,fullPage:true});
   assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.close();
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
