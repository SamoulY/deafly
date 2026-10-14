import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handleRoom} from '../worker/src/companion-room.mjs';
import {handleCompanion} from '../worker/src/companion.mjs';
import {chartBars,chartMarket,historicalMarket,closeTime} from '../worker/src/companion-charts.mjs';
import {handleAccount,verifyRegistration} from '../worker/src/flydesk-auth.mjs';

async function setup(t){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-18',d1Databases:['DB']}));t.after(()=>mf.dispose());const DB=await mf.getD1Database('DB');
 for(const name of ['schema.sql','migrations/0004_raising.sql','migrations/0010_flydesk_auth.sql','migrations/0012_companion_teaching.sql','migrations/0013_companion_learning.sql','migrations/0014_room_and_profile.sql'])await DB.exec((await readFile('worker/'+name,'utf8')).replace(/^\s*--.*$/gm,'').replace(/\r?\n/g,' '));
 for(const id of ['alice','bob']){await DB.prepare('INSERT INTO users VALUES (?,?,?,?,?)').bind(id,id,id,1,1).run();await DB.prepare('INSERT INTO portfolios(user_id,cash) VALUES (?,0)').bind(id).run();}
 const call=async(path,body,owner='alice')=>{const r=await handleRoom(new Request('https://test/api/companion/room'+path,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})}),{DB},{id:owner});return {status:r.status,data:await r.json()};};return {DB,call};
}
test('room ledger spends only cash, sells equipped items, migrates once and handles retry/concurrent purchases atomically',async t=>{
 const {DB,call}=await setup(t);
 let state=(await call('')).data;assert.equal(state.loadout.desk,'desk-lamp');assert.equal(state.cash,0);
 await DB.prepare("INSERT INTO autonomous_runs VALUES ('run','alice','RUNNING',0,10000,NULL,NULL,NULL,1,1)").run();
 const sale={item_id:'desk-lamp',operation:'SELL',idempotency_key:'sell_lamp_1234567890',amount:999999};
 const [first,retry]=await Promise.all([call('/trade',sale),call('/trade',sale)]);assert.equal(first.status,200);assert.equal(retry.status,200);assert.equal(first.data.cash,15);assert.equal(retry.data.receipt.id,first.data.receipt.id);assert.equal(first.data.loadout.desk,undefined);
 assert.equal((await call('')).data.inventory.length,0,'refresh never grants a sold starter item again');assert.equal((await call('',undefined,'bob')).data.cash,0);
 assert.equal((await call('/trade',{...sale,item_id:'body-tie'})).status,409,'receipt cannot be reused for another item');
 const results=await Promise.all(['sticker-star','desk-coffee'].map((item,i)=>call('/trade',{item_id:item,operation:'BUY',idempotency_key:'purchase_12345678'+i})));
 assert.equal(results.filter(r=>r.status===200).length,1,'15 USD cannot fund both 8 and 10 USD purchases');assert.equal(results.find(r=>r.status===409).data.error,'INSUFFICIENT_CASH');
 state=(await call('')).data;const owned=state.inventory[0].item_id;
 const equip=await call('/equip',{item_id:owned,equipped:true});assert.equal(equip.data.loadout[state.inventory[0].slot],owned);
 assert.equal((await call('/equip',{item_id:owned,equipped:true},'bob')).status,409);
 const portfolio=await DB.prepare('SELECT * FROM portfolios WHERE user_id=?').bind('alice').first();assert.equal(portfolio.quantity,0);assert.equal(portfolio.position_side,'FLAT');assert.equal(portfolio.revision,2,'every cash trade invalidates earlier autonomous challenges');assert.equal((await DB.prepare('SELECT COUNT(*) n FROM decisions').first()).n,0);
 assert.equal(state.history.length,2);assert.equal(state.history.reduce((n,r)=>n+r.amount,0),state.cash);
 assert.equal((await DB.prepare("SELECT last_equity FROM autonomous_runs WHERE id='run'").first()).last_equity,10000+state.cash,'cosmetic cash flows do not create trading rewards or penalties');
});
test('historical teaching exposes only cutoff data, trains the live private head and leaves actual holdings unchanged',async t=>{
 const {DB}=await setup(t);const candles=Array.from({length:40},(_,i)=>({time:100000+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:10,interval:60})),market={candles,source:'real-provider-test',symbol:'BTCUSD'};
 const call=async(path,body)=>{const r=await handleCompanion(new Request('https://test/api/companion'+path,{method:'POST',body:JSON.stringify(body)}),{DB},{id:'alice'},{observation:async()=>market,history:async()=>market});return {status:r.status,data:await r.json()};};
 assert.equal((await call('/contexts',{candle_time:candles[10].time})).data.error,'LATEST_POINT_ONLY');
 const current=await call('/contexts',{});assert.equal(current.data.market.candles.at(-1).time,candles.at(-1).time);
 const before=await DB.prepare('SELECT * FROM portfolios WHERE user_id=?').bind('alice').first();
 const context=(await call('/training',{})).data;assert.equal(context.kind,'historical');assert.equal(context.market.candles.length,40);assert.equal(context.future,undefined);
 const lesson=await call('/lessons',{context_id:context.id,action:'BUY',idempotency_key:'historical_example_1234'});assert.equal(lesson.data.training_applied,true);assert.equal(lesson.data.training.model_version,1);
 assert.deepEqual(await DB.prepare('SELECT * FROM portfolios WHERE user_id=?').bind('alice').first(),before);
});
test('provider chart validation keeps 40 completed bars, respects calendar months and never requests future training candles',async()=>{
 const candles=Array.from({length:42},(_,i)=>({time:60+i*60,open:10,close:11,high:12,low:9,volume:1}));assert.equal(chartBars(candles,60,2520).length,40);assert.equal(chartBars(candles,60,2520).at(-1).time,2460);
 assert.throws(()=>chartBars([...candles.slice(0,40),candles[39]],60,99999),/INVALID/);
 assert.equal(closeTime(Date.UTC(2024,1,1)/1000,2592000),Date.UTC(2024,2,1)/1000);
 let requested;const now=Date.UTC(2026,9,13),fetchImpl=async url=>{requested=new URL(url);const end=Number(requested.searchParams.get('end'));return Response.json(Array.from({length:45},(_,i)=>[end-i*60000,100,101,102,99,10]));};
 const history=await historicalMarket({fetchImpl,now,random:()=>.5});assert.ok(Number(requested.searchParams.get('end'))<now-7*86400000);assert.equal(history.candles.length,40);assert.ok(history.candles.every(b=>(b.time+60)*1000<=Number(requested.searchParams.get('end'))+60000));
 const chart=await chartMarket(300,{now,fetchImpl:async()=>Response.json({error:[],result:{XBTUSD:Array.from({length:41},(_,i)=>[now/1000-(41-i)*300,100,102,99,101,0,10])}})});assert.equal(chart.candles.length,40);assert.equal(chart.interval,300);
});
test('registration fails closed for missing, forged, replayed, wrong action and wrong hostname tokens',async()=>{
 const request=new Request('https://api.test/api/account/register'),env={TURNSTILE_SECRET_KEY:'secret-for-unit-test',ALLOWED_ORIGIN:'https://defly.example'};
 assert.equal(await verifyRegistration(request,{},'token'),false);assert.equal(await verifyRegistration(request,env,''),false);
 for(const reply of [{success:false},{success:true,action:'login',hostname:'defly.example'},{success:true,action:'register',hostname:'evil.example'}])assert.equal(await verifyRegistration(request,env,'token',async()=>Response.json(reply)),false);
 assert.equal(await verifyRegistration(request,env,'token',async()=>Response.json({success:true,action:'register',hostname:'defly.example'})),true);
 assert.equal(await verifyRegistration(request,env,'token',async()=>{throw Error('unavailable');}),false);
});
test('account profiles validate safe avatars and remain owner scoped',async t=>{
 const {DB}=await setup(t),env={DB,ALLOWED_ORIGIN:'https://test',APP_ENV:'production'};
 const call=async(body,user='alice')=>{const r=await handleAccount(new Request('https://test/api/account/profile',{method:body?'POST':'GET',headers:{origin:'https://test'},...(body?{body:JSON.stringify(body)}:{})}),env,user?{id:user,nickname:user}:null);return {status:r.status,data:await r.json()};};
 assert.equal((await call(undefined,null)).status,401);assert.equal((await call({display_name:'Name',avatar:'javascript:alert(1)'})).status,422);
 assert.equal((await call({display_name:'Waiting',avatar:'moon'})).data.display_name,'Waiting');assert.equal((await call()).data.avatar,'moon');assert.equal((await call(undefined,'bob')).data.avatar,'orbit');
});
test('local loadout reconciliation atomically equips only owned items without touching cash or another owner',async t=>{
 const {DB,call}=await setup(t);await call('');await call('',undefined,'bob');
 const before=await DB.prepare("SELECT * FROM portfolios WHERE user_id='alice'").first();
 assert.equal((await call('/loadout',{loadout:{desk:'desk-lamp',head:'unowned-item'},cash:999999})).status,200);
 assert.deepEqual((await call('')).data.loadout,{desk:'desk-lamp'});
 assert.deepEqual((await call('/loadout',{loadout:{}})).data.loadout,{});
 assert.deepEqual((await call('',undefined,'bob')).data.loadout,{desk:'desk-lamp'});
 assert.equal((await call('/loadout',{loadout:{evil:'desk-lamp'}})).status,422);
 assert.equal((await call('/loadout',{loadout:[]})).status,422);
 assert.deepEqual(await DB.prepare("SELECT * FROM portfolios WHERE user_id='alice'").first(),before);
 await call('/trade',{item_id:'desk-lamp',operation:'SELL',idempotency_key:'sell_during_sync_12345'});
 assert.deepEqual((await call('/loadout',{loadout:{desk:'desk-lamp'}})).data.loadout,{});
 assert.equal((await call('')).data.cash,15);
});
