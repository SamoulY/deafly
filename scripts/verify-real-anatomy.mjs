import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.DEFLY_TEST_URL||'http://127.0.0.1:8876/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#neurons')?.textContent==='4,000');
 await page.locator('[data-view="brain"]').click();
 await page.waitForFunction(()=>document.querySelector('#brainScene')?.getAttribute('data-node-count')==='4000');
 assert.match(await page.locator('#anatomyStatus').innerText(),/ANATOMY ONLY/);
 assert.equal(await page.locator('#spikes').innerText(),'—');
 assert.match(await page.locator('#neuralTruth').innerText(),/UNAVAILABLE/);
 assert.equal(await page.locator('.brain-detail').evaluate(e=>e.open),true);
 await page.screenshot({path:'/tmp/defly-real-anatomy-mobile.png',fullPage:true});
 console.log(JSON.stringify({anatomy:await page.locator('#anatomyStatus').innerText(),activity:await page.locator('#neuralTruth').innerText(),errors}));assert.deepEqual(errors,[]);
}finally{await browser.close();}
