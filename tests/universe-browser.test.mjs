import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {startDev} from '../scripts/flydesk-dev.mjs';
test('universe works on phone and desktop in both languages and themes without adding home status',async t=>{
 const dev=await startDev({fixture:true,port:8893});t.after(()=>dev.close());const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/full-brain/**',route=>/\.(?:bin\.gz|wasm)$/.test(new URL(route.request().url()).pathname)?route.abort():route.continue());
 await page.goto(dev.url+'/#colony');await page.locator('#universeEnroll').waitFor();await page.waitForFunction(()=>!document.querySelector('#universeEnroll').disabled);
 assert.equal(await page.locator('#universeRoot').isVisible(),true);assert.equal(await page.locator('#colonyStart').isVisible(),false);await page.locator('#universeEnroll').click();assert.match(await page.locator('#universeStatus').textContent(),/accept sharing/);assert.equal(await page.locator('#universeRun').isDisabled(),true);
 await mkdir('runtime/reports',{recursive:true});
 for(const width of [390,1440])for(const language of ['en','zh-CN'])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:950});await page.locator('[data-language-choice]').selectOption(language);await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  const heading=page.locator('[data-page="colony"] h1');await heading.waitFor();await page.waitForFunction(lang=>document.querySelector('[data-page="colony"] h1').textContent===(lang==='en'?'Fly universe':'果蝇宇宙'),language);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width} ${language} ${theme}`);
  const colors=await page.locator('#universePeriod').evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));assert.notEqual(colors.color,colors.background);
  await page.screenshot({path:`runtime/reports/universe-${width}-${language}-${theme}.png`,fullPage:true});
 }
 const round=await dev.db.prepare('SELECT * FROM universe_rounds ORDER BY starts_at LIMIT 1').first(),owner=(await dev.db.prepare('SELECT id FROM users LIMIT 1').first()).id;
 await dev.db.prepare("UPDATE universe_rounds SET status='COMPLETE',settled_tasks=288 WHERE id=?").bind(round.id).run();
 await dev.db.prepare("INSERT INTO universe_entries(round_id,owner_id,fly_id,display_name,kind,state_json,received,joined_at) VALUES(?,?,?,?,'PERSONAL',?,288,?)").bind(round.id,owner,'b'.repeat(64),'<img src=x onerror=alert(1)> Long fly',JSON.stringify({equity:12345,drawdown:.034,fees:12}),round.starts_at).run();
 await page.reload();await page.locator('.universe-table tbody tr').waitFor();await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.universe-table img').count(),0);assert.match(await page.locator('#universeMine').textContent(),/23.45/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'runtime/reports/universe-ranked-mobile.png',fullPage:true});
 await page.locator('.bottom-nav [data-go="home"]').click();assert.equal(await page.locator('#universeRoot').isVisible(),false);assert.equal(await page.locator('#flyScene').isVisible(),true);assert.deepEqual(errors,[]);
});
