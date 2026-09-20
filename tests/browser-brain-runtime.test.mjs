import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
test('actual browser full kernel delivers trusted activity for encoded historical snapshot', {timeout:180000}, async()=>{
 const server=createServer(async(req,res)=>{try {
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');return res.end('<html><body>Browser kernel integration</body></html>');}
  res.setHeader('Content-Type',/\.m?js$/.test(path)?'text/javascript':path.endsWith('.wasm')?'application/wasm':'application/octet-stream');
  res.end(await readFile(new URL('../pages'+path,import.meta.url)));
 } catch {res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try {
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async()=>{
   const {createBrowserBrainClient,encodeMarketObservation}=await import('/browser-brain-client.js');
   const anatomy=await fetch('/neural-anatomy.json').then(r=>r.json());
   const frame=await encodeMarketObservation({observation_hash:'a'.repeat(64),bars:[{close:100},{close:105},{close:102},{close:108}]},true);
   return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{client.cancel();reject(Error('Kernel timed out'));},150000);
    const client=createBrowserBrainClient({onStatus:s=>{if(s.state==='error'){clearTimeout(timer);reject(Error(s.message));}},onActivity:p=>{const checked=client.validate(p,{snapshot:frame,anatomy});clearTimeout(timer);client.cancel();resolve({available:checked.available,reason:checked.reason,full:checked.fullTotalSpikes,sampled:checked.totalSpikes,historical:checked.historical,decoder:p.decoder,brain_ms:p.brain_ms});}});
    client.observe(frame);client.start(anatomy.nodes.map(n=>n.id));
   });
  });
  assert.equal(result.available,true,JSON.stringify(result));assert.equal(result.historical,true);
  assert.ok(result.full>=result.sampled);assert.ok(Number.isFinite(result.decoder.left_hz));assert.ok(result.brain_ms>0);
  console.log('REAL_BROWSER_RESULT',JSON.stringify(result));
 } finally {await browser?.close();await new Promise(r=>server.close(r));}
});
