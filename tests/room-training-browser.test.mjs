import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startDev} from '../scripts/flydesk-dev.mjs';
import {mockTurnstile} from './helpers/turnstile-fixture.mjs';
import {mkdir} from 'node:fs/promises';

test('latest teaching, 40-bar periods, blind training, cash shop, visible room and account work on phone and desktop',async t=>{
 const dev=await startDev({fixture:true,port:8903});t.after(()=>dev.close());const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1100},locale:'zh-CN'}),errors=[],posts=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(new URL(r.url()).pathname);});
 await page.route('**/full-brain/**',r=>/\.(bin\.gz|wasm)$/.test(new URL(r.request().url()).pathname)?r.abort():r.continue());await mockTurnstile(page);
 await page.goto(dev.url);await page.locator('#chartPoint:enabled').waitFor();assert.match(await page.locator('#homeEquity').innerText(),/^USD /);
 const initial=await dev.db.prepare('SELECT * FROM portfolios LIMIT 1').first();
 await page.locator('#teachChart').click({position:{x:30,y:80}});assert.equal((await dev.db.prepare('SELECT COUNT(*) n FROM companion_contexts').first()).n,0,'past points cannot create a lesson');
 await page.locator('[data-chart-style=candles]').click();
 for(const interval of ['60','300','900','1800','3600','14400','86400','604800','2592000']){await page.locator('#marketTimeframe').selectOption(interval);await page.waitForFunction(()=>document.querySelectorAll('#teachChart .market-candle').length===40);assert.equal(await page.locator('#teachChart .partial').count(),0);}
 await page.locator('#chartPoint').click();await page.locator('[data-demonstrate=HOLD]:enabled').waitFor();
 const context=JSON.parse((await dev.db.prepare('SELECT snapshot_json FROM companion_contexts ORDER BY rowid DESC LIMIT 1').first()).snapshot_json);assert.equal(context.market.candles.length,40);assert.equal(context.kind,'live');assert.ok(context.market.candles.at(-1).time>Date.now()/1000-130);
 await page.locator('[data-demonstrate=HOLD]').click();await page.locator('#saveLesson').click();await page.waitForFunction(()=>document.querySelector('#lessonResult').textContent.includes('已经学会'));
 await page.locator('.teaching-entry [data-go=training]').click();await page.locator('[data-training-action=BUY]:enabled').waitFor();assert.equal(await page.locator('#trainingChart .market-candle').count(),40);
 await page.locator('[data-training-action=BUY]').click();await page.locator('#saveTraining').click();await page.waitForFunction(()=>document.querySelector('#trainingStatus').textContent.includes('已经学会'));assert.equal((await dev.db.prepare('SELECT version FROM companion_models LIMIT 1').first()).version,2);assert.deepEqual(await dev.db.prepare('SELECT * FROM portfolios LIMIT 1').first(),initial);
 await page.locator('.bottom-nav [data-go=home]').click();await page.locator('[data-page=home] [data-go=shop]').first().click();await page.locator('[data-item=desk-lamp] [data-trade=SELL]').click();await page.locator('#confirmShop').click();await page.waitForFunction(()=>document.querySelector('#shopCash').textContent==='USD 15.00');
 assert.doesNotMatch(await page.locator('#flyScene').getAttribute('data-room'),/desk-lamp/);
 await page.locator('[data-item=sticker-star] [data-trade=BUY]').click();
 await page.route('**/api/companion/room/trade',async route=>{await route.fetch();await route.abort();},{times:1});await page.locator('#confirmShop').click();await page.waitForFunction(()=>document.querySelector('#shopMessage').textContent.includes('结果尚未确认'));
 await page.reload();await page.locator('#confirmShop:enabled').waitFor();await page.locator('#confirmShop').click();await page.waitForFunction(()=>document.querySelector('#shopCash').textContent==='USD 7.00');assert.equal((await dev.db.prepare('SELECT COUNT(*) n FROM room_transactions').first()).n,2);
 await page.locator('[data-equip=sticker-star]').click();await page.waitForFunction(()=>document.querySelector('#flyScene').dataset.room?.includes('sticker-star'));
 await page.locator('[data-page=shop] [data-go=vision]').click();await page.waitForFunction(()=>document.querySelector('#visionScene').dataset.room?.includes('sticker-star'));assert.equal(await page.locator('#visionScene').isVisible(),true);
 await page.locator('#headerAccount').click();await page.locator('[name=username]').fill('roomtraining');await page.locator('[name=password]').fill('example-long-password-123');await page.locator('[name=register]').click();await page.locator('[name=confirmRegister]:enabled').waitFor();await Promise.all([page.waitForNavigation(),page.locator('[name=confirmRegister]').click()]);await page.locator('#profileForm').waitFor();
 await page.locator('#profileForm [name=displayName]').fill('Waiting');await page.locator('.avatar-picker label').filter({has:page.locator('input[value=moon]')}).click();await page.locator('#profileForm button').click();await page.waitForFunction(()=>document.querySelector('#headerAccount').textContent.includes('Waiting'));assert.ok((await page.context().cookies()).some(c=>c.name==='flydesk_session'&&c.httpOnly));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#headerAccount').textContent.includes('Waiting'));assert.equal((await dev.db.prepare('SELECT COUNT(*) n FROM users').first()).n,1);
 await page.locator('.bottom-nav [data-go=more]').click();await page.locator('[data-theme-choice]').selectOption('dark');
 const colors=await page.locator('[data-language-choice] option').first().evaluate(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));assert.notEqual(colors.bg,colors.color);assert.notEqual(colors.bg,'rgb(255, 255, 255)');
 await mkdir('runtime/reports',{recursive:true});
 for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:1000});for(const lang of ['en','zh-CN']){await page.locator('[data-language-choice]').selectOption(lang);for(const target of ['home','shop','account','training']){if(target==='home')await page.locator('.bottom-nav [data-go=home]').click();if(target==='shop')await page.locator('[data-page=home] [data-go=shop]').first().click();if(target==='account')await page.locator('#headerAccount').click();if(target==='training'){await page.locator('.bottom-nav [data-go=home]').click();await page.locator('.teaching-entry [data-go=training]').click();}await page.locator(`[data-page=${target}]`).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${target} ${lang} ${width}`);}}}
 await page.locator('.bottom-nav [data-go=home]').click();await page.setViewportSize({width:1440,height:1000});await page.waitForFunction(()=>document.querySelectorAll('#teachChart .market-candle').length===40);const frame=await page.locator('#flyScene').getAttribute('data-lit-frame');await page.waitForFunction(before=>document.querySelector('#flyScene').dataset.litFrame!==before,frame);await page.screenshot({path:'runtime/reports/room-desktop-night.png',fullPage:true});
 await page.locator('[data-page=home] [data-go=shop]').first().click();await page.screenshot({path:'runtime/reports/room-shop-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'runtime/reports/room-shop-mobile.png',fullPage:true});
 await page.locator('.bottom-nav [data-go=home]').click();await page.locator('.teaching-entry [data-go=training]').click();await page.screenshot({path:'runtime/reports/room-training-mobile.png',fullPage:true});
 assert.equal(posts.includes('/api/autonomy/start'),false);assert.deepEqual(errors,[]);
});
