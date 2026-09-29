import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

async function browserTest(fn){
 const server=createServer(async(req,res)=>{try{res.setHeader('content-type',req.url==='/'?'text/html':'text/javascript');res.end(req.url==='/'?'<div id="root"></div>':await readFile(resolve('pages','.'+req.url)));}catch{res.statusCode=404;res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch();const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.clock.install();await fn(page);}
 finally{await browser?.close();await new Promise(r=>server.close(r));}
}
test('dispose during beforeStart never restarts or enrolls the disposed UI',()=>browserTest(async page=>{
 await page.evaluate(async()=>{
 const {mountColonyUI}=await import('/colony-ui.js');window.events=[];
 window.ui=await mountColonyUI(document.querySelector('#root'),{saved:async()=>({}),enroll:async()=>events.push('enroll'),claim:async()=>{events.push('claim');return {task:null};}},{beforeStart:()=>new Promise(r=>window.finishStart=r),onRunning:value=>events.push(value)});
 document.querySelector('#colonyConsent').checked=true;document.querySelector('#colonyStart').click();
 });
 await page.evaluate(()=>{ui.dispose();finishStart();});
 assert.deepEqual(await page.evaluate(()=>events),[false]);assert.equal(await page.evaluate(()=>ui.running),false);
}));

test('lost vote response survives reload and finalization without reinference and preserves correction target',()=>browserTest(async page=>{
 const result=await page.evaluate(async()=>{
 const {mountColonyUI}=await import('/colony-ui.js');const {createColonyClient}=await import('/colony-client.js');const {createFlyIdentity}=await import('/fly-identity.js');
 const identity=await createFlyIdentity(localStorage,{genesis_model_hash:'a'.repeat(64)});
 const key=`defly.colony:alice:${identity.fly_id}`;localStorage.setItem(key,JSON.stringify({auto_consent:true}));
 const snapshot={bars:[{close:10},{close:12}],symbol:'BTCUSD'};
 const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(snapshot)))),b=>b.toString(16).padStart(2,'0')).join('');
 const task={task_id:'lost-task',snapshot,snapshot_hash:hash,status:'OPEN',deadline:Date.now()+60000,members:[{member_user_id:'alice',fly_id:identity.fly_id}]};
 let accepted=null,inferences=0,sends=0,persistedBeforeSend=false,correction=null;const requests=[];
 const api=async(path,o={})=>{
 if(path==='/api/state')return {user:{id:'alice'}};
 if(path==='/api/colony/auto/next'){requests.push(o.body);return o.body.recover_task_id===task.task_id?{task:{...task,status:'FINALIZED'},my_vote:accepted}:{task:null};}
 if(path.endsWith('/votes')){sends++;persistedBeforeSend=JSON.parse(localStorage.getItem(key)).pending_vote_task_id===task.task_id;accepted={vote_id:'accepted-vote',action:o.body.action,checkpoint_hash:o.body.checkpoint_hash};throw Error('response lost after commit');}
 if(path.endsWith('/corrections')){correction=o.body;return {accepted:true};}
 return task;
 };
 const withBrain=fn=>fn({saveCheckpoint:async()=>({hash:'b'.repeat(64)}),infer:async()=>{inferences++;return {decoder:{proposed_action:'SELL'}};}});
 const first=createColonyClient({api,identity,storage:localStorage,withBrain});
 try{await first.vote(task.task_id);}catch{}
 // Re-create the client, like a reload: no in-memory accepted-vote state survives.
 window.reloaded=createColonyClient({api,identity,storage:localStorage,withBrain});
 window.ui=await mountColonyUI(document.querySelector('#root'),reloaded);
 await document.querySelector('#colonyStart').onclick();
 const decision=document.querySelector('#colonyDecision').textContent;
 document.querySelector('#colonyCorrect').click();document.querySelector('#colonyCorrectionAction').value='LONG';await document.querySelector('#colonyCorrectionSave').onclick();
 ui.dispose();
 return {decision,inferences,sends,persistedBeforeSend,requests,correction,pending:(await reloaded.saved()).pending_vote_task_id};
 });
 assert.equal(result.persistedBeforeSend,true);assert.match(result.decision,/SHORT/);assert.equal(result.inferences,1);assert.equal(result.sends,1);
 assert.deepEqual(result.requests,[{recover_task_id:'lost-task'}]);assert.equal(result.correction.vote_id,'accepted-vote');assert.equal(result.correction.action,'BUY');assert.ok(!result.pending);
}));

for(const pendingStage of ['claim','vote']) test(`visibility resume while ${pendingStage} is busy does not lose its only polling timer`,()=>browserTest(async page=>{
 await page.evaluate(async pendingStage=>{
 const {mountColonyUI}=await import('/colony-ui.js');window.claims=0;window.hidden=false;
 Object.defineProperty(document,'hidden',{get:()=>window.hidden});
 window.ui=await mountColonyUI(document.querySelector('#root'),{saved:async()=>({auto_consent:true}),claim:async()=>{claims++;if(claims===1&&pendingStage==='claim')await new Promise(r=>window.finishClaim=r);return {task:claims===1&&pendingStage==='vote'?{task_id:'delayed'}:null};},vote:async()=>{await new Promise(r=>window.finishClaim=r);return {vote_id:'delayed-vote',action:'BUY'};}},{pollMs:1000});
 document.querySelector('#colonyStart').click();
 },pendingStage);
 await page.waitForFunction(()=>!!window.finishClaim);
 await page.evaluate(()=>{hidden=true;document.dispatchEvent(new Event('visibilitychange'));hidden=false;document.dispatchEvent(new Event('visibilitychange'));});
 await page.clock.runFor(1100);assert.equal(await page.evaluate(()=>claims),1);
 await page.evaluate(()=>finishClaim());await page.clock.runFor(1100);
 assert.equal(await page.evaluate(()=>claims),2,'busy claim settlement must restore polling after the visibility timer fires');
 await page.evaluate(()=>ui.dispose());await page.clock.runFor(60000);assert.equal(await page.evaluate(()=>claims),2);
}));
