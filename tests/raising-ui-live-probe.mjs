import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const report={errors:[],requests:[]};
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.url().includes('/api/raising/'))report.requests.push({url:r.url(),status:r.status()});});
 await page.goto(process.env.DEFLY_TEST_URL || 'http://127.0.0.1:8876/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#raisingStatus')?.textContent==='FLY RESTORED');
 await page.screenshot({path:'/tmp/defly-polished-empty.png',fullPage:true});
 await page.locator('#flyName').fill('Browser Pilot');
 await page.locator('#flyNameForm button').click();
 await page.waitForFunction(()=>document.querySelector('#raisingStatus').textContent==='SAVED');
 const token=await page.evaluate(()=>JSON.stringify(localStorage));
 assert.equal(await page.locator('#roundProgress').innerText(),'0 / 12');
 assert.equal(await page.locator('[data-teach="BUY"]').isEnabled(),true);
 assert.equal(await page.locator('[data-teach="CLOSE"]').isDisabled(),true);
 assert.match(await page.locator('#teachAvailability').innerText(),/no open position/);
 assert.ok(!report.requests.some(r=>r.url.endsWith('/actions')));
 const pixels=await page.locator('#chart').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let green=0;for(let i=0;i<d.length;i+=4)if(d[i]>100&&d[i+1]>200&&d[i+2]<100)green++;return green;});
 assert.ok(pixels>100,'historical chart has real plotted pixels');
 report.chartPixels=pixels;
 await page.locator('[data-teach="BUY"]').click();
 await page.waitForFunction(()=>document.querySelector('#roundProgress').textContent==='1 / 12');
 await page.screenshot({path:'/tmp/defly-raising-active-desktop.png',fullPage:true});
 report.firstFold=[];
 for(const width of [390,360,320]) {
  await page.setViewportSize({width,height:844});
  await page.evaluate(()=>scrollTo(0,0));
  const measure=await page.evaluate(()=>{const chart=document.querySelector('#chart').getBoundingClientRect(),actions=document.querySelector('.teach-actions').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,chartTop:chart.top,chartBottom:chart.bottom,actionsTop:actions.top,actionsBottom:actions.bottom};});
  report.firstFold.push(measure);
  assert.equal(measure.scroll,width);
  assert.ok(measure.chartTop>=0 && measure.chartBottom<=844,JSON.stringify(measure));
  assert.ok(measure.actionsTop>=measure.chartBottom && measure.actionsBottom<=844,JSON.stringify(measure));
  await page.screenshot({path:`/tmp/defly-raising-active-mobile-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});
 assert.equal(await page.locator('[data-teach="BUY"]').isDisabled(),true);
 await page.reload({waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#raisingStatus')?.textContent==='FLY RESTORED');
 assert.equal(await page.locator('#flyName').inputValue(),'Browser Pilot');
 assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),token);
 assert.equal(await page.locator('#roundProgress').innerText(),'1 / 12');
 for(let i=1;i<12;i++) {
  await page.locator(`[data-teach="${i===2?'CLOSE':i===4?'SELL':'HOLD'}"]`).click();
  await page.waitForFunction(step=>document.querySelector('#roundProgress').textContent===`${step} / 12`,i+1);
 }
 await page.locator('#reviewRound').click();
 await page.waitForSelector('#roundReview tbody tr');
 assert.equal(await page.locator('#roundReview tbody tr').count(),12);
 report.round=await page.locator('#roundFacts').innerText();
 await page.screenshot({path:'/tmp/defly-polished-desktop.png',fullPage:true});
 await page.locator('#wardrobeToggle').click();
 await page.locator('[data-preview]').nth(1).click();
 assert.equal(await page.locator('#cancelPreview').isVisible(),true);
 await page.locator('#cancelPreview').click();
 assert.equal(await page.locator('#cancelPreview').isVisible(),false);
 await page.locator('#wardrobeClose').click();
 await page.locator('[data-raising-tab="training"]').click();
 await page.waitForFunction(()=>/TRAINING LOADED|FAILED/.test(document.querySelector('#raisingStatus').textContent));
 report.training=await page.locator('#raisingTraining').innerText();
 await page.locator('[data-raising-tab="teach"]').click();
 await page.locator('#autonomousMode').click();
 await page.waitForFunction(()=>!document.querySelector('#historicalMode').disabled);
 assert.equal(await page.locator('#chart').isVisible(),true);
 assert.equal(await page.locator('.correction').isVisible(),true);
 assert.equal(await page.locator('.teach-actions').isVisible(),false);
 assert.equal(await page.locator('#autoStatus').innerText(),'STOPPED');
 await page.screenshot({path:'/tmp/defly-autonomy-desktop.png',fullPage:true});
 const stopped=page.waitForResponse(r=>r.url().endsWith('/api/autonomy/stop') && r.request().method()==='POST');
 await page.locator('#historicalMode').click();
 assert.equal((await stopped).status(),200);
 assert.equal(await page.locator('#labControls').isVisible(),false);
 report.labExitStoppedServer=true;
 await page.locator('.brain-detail').evaluate(e=>{e.open=true;});
 report.mobile=[];
 for(const width of [390,360,320]) {
  await page.setViewportSize({width,height:844});
  const measure=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.checkVisibility()&&e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width>0).map(e=>e.id||e.className).slice(0,15)}));
  report.mobile.push(measure);
  await page.screenshot({path:`/tmp/defly-polished-mobile-${width}.png`,fullPage:true});
  assert.equal(measure.scroll,width);
 }
 assert.deepEqual(report.errors,[]);
 console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
