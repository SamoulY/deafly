import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {memeItems} from '../pages/meme-items.js';
import {artShapes,memeArt} from '../pages/meme-art.js';
import {createFlyModel} from '../pages/fly-model.js';
import {handleRoom} from '../worker/src/companion-room.mjs';

test('48 distinct bilingual designs cover every slot with real vector art and wearable geometry',()=>{
 const items=Object.values(memeItems);assert.equal(items.length,48);assert.equal(new Set(items.map(i=>i.name)).size,48);assert.equal(new Set(items.map(i=>memeArt(i.id))).size,48);
 for(const slot of ['head','face','body','background','sticker','desk'])assert.equal(items.filter(i=>i.slot===slot).length,8);
 const {fly,setOutfit}=createFlyModel('unchanged-fly'),anatomy=fly.children.filter(o=>!o.userData.cosmetic);
 for(const item of items){assert.ok(item.zh&&item.descriptionZh&&item.description);assert.ok(item.price>=60000);assert.equal(item.resale,item.price/2);assert.ok(artShapes(item).length>0);assert.match(memeArt(item.id),/<svg/);
  if(['head','face','body'].includes(item.slot)){assert.equal(setOutfit({[item.slot]:item.id})[item.slot],item.id);const group=fly.getObjectByName(item.id);assert.ok(group?.children.length>0,item.id);}
 }
 setOutfit(null);assert.deepEqual(fly.children.filter(o=>!o.userData.cosmetic),anatomy);
});

test('catalog repricing is exactly 10000x and retry-safe without rewriting receipts, balances or ownership',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-18',d1Databases:['DB']}));t.after(()=>mf.dispose());const DB=await mf.getD1Database('DB');
 const apply=async file=>DB.exec((await readFile('worker/'+file,'utf8')).replace(/^\s*--.*$/gm,'').replace(/\r?\n/g,' '));
 for(const f of ['schema.sql','migrations/0004_raising.sql','migrations/0014_room_and_profile.sql'])await apply(f);
 await DB.prepare("INSERT INTO users VALUES ('alice','alice','token',1,1)").run();await DB.prepare("INSERT INTO portfolios(user_id,cash) VALUES ('alice',0)").run();
 const call=async(path,body)=>{if(path==='/trade'&&body.expected_price===undefined){const item=await DB.prepare('SELECT * FROM room_catalog WHERE id=?').bind(body.item_id).first();body={...body,expected_price:body.operation==='BUY'?item.price:item.resale};}const r=await handleRoom(new Request('https://test/api/companion/room'+path,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})}),{DB},{id:'alice'});return {status:r.status,data:await r.json()};};
 const before=(await call('')).data,oldPrices=before.items;
 const sell={item_id:'desk-lamp',operation:'SELL',idempotency_key:'before_price_change_1234'};const receipt=(await call('/trade',sell)).data.receipt;
 const portfolio=await DB.prepare("SELECT * FROM portfolios WHERE user_id='alice'").first(),inventory=(await call('')).data.inventory;
 await apply('migrations/0015_meme_shop.sql');await apply('migrations/0015_meme_shop.sql');
 let state=(await call('')).data;assert.equal(state.items.length,66);
 for(const old of oldPrices){const item=state.items.find(i=>i.id===old.id);assert.equal(item.price,old.price*10000);assert.equal(item.resale,old.resale*10000);}
 for(const item of Object.values(memeItems))assert.deepEqual(state.items.find(i=>i.id===item.id),{id:item.id,slot:item.slot,name:item.name,price:item.price,resale:item.resale});
 assert.deepEqual(await DB.prepare("SELECT * FROM portfolios WHERE user_id='alice'").first(),portfolio);assert.deepEqual(state.inventory,inventory);
 assert.deepEqual((await call('/trade',sell)).data.receipt,receipt,'retry uses historical receipt without repricing');
 assert.equal((await call('/trade',{item_id:'sticker-67',operation:'BUY',idempotency_key:'cannot_afford_123456'})).status,409);
 await DB.prepare("UPDATE portfolios SET cash=100000 WHERE user_id='alice'").run();
 assert.equal((await call('/trade',{item_id:'sticker-67',operation:'BUY',idempotency_key:'stale_quote_1234567',expected_price:6})).data.error,'PRICE_CHANGED');
 const buy={item_id:'sticker-67',operation:'BUY',idempotency_key:'new_price_buy_123456'};
 const bought=await call('/trade',buy);assert.equal(bought.data.cash,40000);assert.equal((await call('/trade',buy)).data.cash,40000);
 assert.equal((await call('/equip',{item_id:'sticker-67',equipped:true})).data.loadout.sticker,'sticker-67');
 const sold=await call('/trade',{item_id:'sticker-67',operation:'SELL',idempotency_key:'new_price_sell_123456'});assert.equal(sold.data.cash,70000);assert.equal(sold.data.loadout.sticker,undefined);
});
