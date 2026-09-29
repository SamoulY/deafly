import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {startDev} from '../scripts/flydesk-dev.mjs';
test('integrated desktop and mobile desk: chart drawing, action, reload, skip, review and account login',async t=>{
 const dev=await startDev({fixture:true,port:8896,apiPort:8787});t.after(()=>dev.close());const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Keep this UI test focused; the existing full-brain suite exercises actual WASM loading.
 await page.route('**/full-brain/**',r=>/\.(?:bin\.gz|wasm)$/.test(new URL(r.request().url()).pathname)?r.abort():r.continue());
 await page.goto(dev.url);await page.waitForFunction(()=>document.querySelector('#raisingStatus')?.textContent==='FLY RESTORED');
 assert.equal(await page.locator('[data-teach="SELL"]').isDisabled(),true);assert.equal(await page.locator('[data-teach="CLOSE"]').count(),0);
 await page.locator('[data-tool="horizontal_line"]').click();await page.locator('#chart').scrollIntoViewIfNeeded();const box=await page.locator('#chart').boundingBox();await page.mouse.click(box.x+box.width*.4,box.y+box.height*.2);await page.waitForFunction(()=>document.querySelector('.desk-chart-toolbar [role=status]').textContent==='分析已保存');
 await page.locator('[data-teach="BUY"]').click();await page.waitForFunction(()=>document.querySelector('#roundProgress').textContent==='1 / 12');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#roundProgress')?.textContent==='1 / 12');
 assert.equal(await page.locator('[data-teach="SELL"]').isDisabled(),false);await page.locator('[data-teach="SKIP"]').click();await page.waitForFunction(()=>document.querySelector('#roundProgress').textContent==='2 / 12');
 for(let step=2;step<12;step++){await page.locator('[data-teach="HOLD"]').click();await page.waitForFunction(s=>document.querySelector('#roundProgress').textContent===`${s} / 12`,step+1);}
 await page.locator('#reviewRound').click();await page.waitForFunction(()=>document.querySelector('#raisingStatus').textContent==='REVIEW LOADED');assert.match(await page.locator('#roundReview').textContent(),/SYSTEM/);
 await page.locator('.account-login summary').click();await page.locator('[name=username]').fill('integration');await page.locator('[name=password]').fill('correct-horse-12345');await Promise.all([page.waitForNavigation(),page.locator('[name=register]').click()]);await page.waitForFunction(()=>document.querySelector('#raisingStatus')?.textContent==='FLY RESTORED');
 const cookies=await page.context().cookies();assert.ok(cookies.some(c=>c.name==='flydesk_session'&&c.httpOnly));
 await mkdir('runtime/reports',{recursive:true});await page.screenshot({path:'runtime/reports/flydesk-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'runtime/reports/flydesk-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
});
