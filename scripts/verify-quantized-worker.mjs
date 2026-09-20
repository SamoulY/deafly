import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://127.0.0.1:8900/');
 const result=await page.evaluate(()=>new Promise((resolve,reject)=>{
  let ticks=0;const interval=setInterval(()=>ticks++,25);
  const worker=new Worker('./browser-worker.mjs',{type:'module'});
  const timeout=setTimeout(()=>{worker.terminate();clearInterval(interval);reject(Error('timeout'));},120000);
  worker.onerror=e=>{clearTimeout(timeout);clearInterval(interval);worker.terminate();reject(Error(e.message));};
  worker.onmessage=e=>{clearTimeout(timeout);clearInterval(interval);worker.terminate();resolve({...e.data,mainThreadTicks:ticks});};
  worker.postMessage({});
 }));
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.deepEqual(result.frames.map(f=>f.spikes),[3335,12951,7561]);
 assert.ok(result.mainThreadTicks>0);
 console.log(JSON.stringify({environment:'desktop Chromium with mobile viewport; NOT physical phone',...result},null,2));
}finally{await browser.close();}
