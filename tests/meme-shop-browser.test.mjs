import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startDev} from '../scripts/flydesk-dev.mjs';
import {mkdir} from 'node:fs/promises';

test('expanded shop searches both languages, paginates, trades at new prices, and renders all cosmetics in both views',async t=>{
 const dev=await startDev({fixture:true,port:8905});t.after(()=>dev.close());const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1440,height:1100},locale:'zh-CN'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/full-brain/**',r=>/\.(bin\.gz|wasm)$/.test(new URL(r.request().url()).pathname)?r.abort():r.continue());
 await page.goto(dev.url);await page.locator('#chartPoint:enabled').waitFor();const before=await dev.db.prepare('SELECT * FROM portfolios LIMIT 1').first();await dev.db.prepare('UPDATE portfolios SET cash=10000000 WHERE user_id=?').bind(before.user_id).run();
 await page.locator('[data-page=home] [data-go=shop]').first().click();await page.locator('#shopCash').filter({hasText:'10,000,000'}).waitFor();
 assert.equal(await page.locator('.shop-item').count(),12);assert.match(await page.locator('#shopCount').textContent(),/12 \/ 66/);
 await page.locator('#shopMore').click();assert.equal(await page.locator('.shop-item').count(),24);
 await page.locator('#shopSearch').fill('卡皮巴拉');assert.equal(await page.locator('.shop-item').count(),3);
 await page.locator('[data-language-choice]').selectOption('en');assert.match(await page.locator('.shop-item h3').first().textContent(),/Capybara/);
 await page.locator('#shopSearch').fill('aura');assert.equal(await page.locator('.shop-item').count(),2);
 await page.locator('#shopSearch').fill('');await page.locator('#shopCollection').selectOption('office');assert.equal(await page.locator('.shop-item').count(),10);
 await page.locator('#shopCollection').selectOption('all');
 const selected=['head-capy','face-pixel','body-hodl','background-pond','sticker-67','desk-duck'];
 for(const id of selected){const row=await dev.db.prepare('SELECT name FROM room_catalog WHERE id=?').bind(id).first();await page.locator('#shopSearch').fill(row.name);const card=page.locator(`[data-item="${id}"]`);await card.locator('[data-trade=BUY]').click();await page.locator('#confirmShop').click();await card.locator('[data-equip]').waitFor();await card.locator('[data-equip]').click();await page.waitForFunction(id=>document.querySelector('#flyScene').dataset.room?.includes(id),id);}
 const portfolio=await dev.db.prepare('SELECT * FROM portfolios WHERE user_id=?').bind(before.user_id).first();assert.equal(portfolio.quantity,before.quantity);assert.equal((await dev.db.prepare('SELECT COUNT(*) n FROM room_transactions').first()).n,6);assert.equal(portfolio.cash,6980000);
 await page.locator('[data-page=shop] [data-go=vision]').click();for(const id of selected)assert.match(await page.locator('#visionScene').getAttribute('data-room'),new RegExp(id));
 // Exercise every canvas path, wall/desk geometry and mirror overlay; each
 // render must differ from an empty room and release replaced resources.
 const rendered=await page.evaluate(async()=>{
  const {memeItems}=await import('/meme-items.js?v=1'),{buildRoomDecor,clearDecor,drawVisionRoom}=await import('/room-decor.js?v=2'),THREE=await import('/vendor-three.js');const group=new THREE.Group(),canvas=document.createElement('canvas');
  const market=c=>{c.width=640;c.height=360;c.getContext('2d').fillRect(0,0,640,360);};drawVisionRoom(canvas,{},market);const blank=canvas.toDataURL();const hashes=[];
  for(const item of Object.values(memeItems)){const loadout={[item.slot]:item.id};buildRoomDecor(group,loadout);drawVisionRoom(canvas,loadout,market);const result=canvas.toDataURL();if(result===blank)throw Error('Invisible '+item.id);if(['desk','background','sticker'].includes(item.slot)&&!group.getObjectByName(item.id))throw Error('Missing geometry '+item.id);hashes.push(result);}
  clearDecor(group);return new Set(hashes).size;
 });assert.equal(rendered,48);
 await page.locator('.bottom-nav [data-go=home]').click();await page.locator('[data-page=home] [data-go=shop]').first().click();await page.locator('#shopSearch').fill('');await page.locator('#shopSort').selectOption('new');await page.locator('#shopCollection').selectOption('chill');await page.locator('[data-language-choice]').selectOption('zh-CN');
 const nextFrame=async()=>{const frame=await page.locator('#flyScene').getAttribute('data-lit-frame');await page.waitForFunction(previous=>document.querySelector('#flyScene').dataset.litFrame!==previous,frame);};
 await page.locator('#flyScene').scrollIntoViewIfNeeded();await nextFrame();await mkdir('runtime/reports',{recursive:true});await page.screenshot({path:'runtime/reports/meme-shop-desktop.png',fullPage:false});
 for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:900});for(const lang of ['en','zh-CN']){await page.locator('[data-language-choice]').selectOption(lang);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} ${lang}`);}}
 await page.setViewportSize({width:390,height:844});await page.locator('#flyScene').scrollIntoViewIfNeeded();await nextFrame();await page.screenshot({path:'runtime/reports/meme-shop-mobile.png',fullPage:false});assert.deepEqual(errors,[]);
});
