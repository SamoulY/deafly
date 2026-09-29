import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
test('English automatic decisions require consent, submit real client result and keep correction separate',async()=>{
 const server=createServer(async(req,res)=>{try{res.setHeader('content-type',req.url==='/'?'text/html':'text/javascript');res.end(req.url==='/'?'<div id="root"></div>':await readFile(resolve('pages','.'+req.url)));}catch{res.statusCode=404;res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch();const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.evaluate(async()=>{const {mountColonyUI}=await import('/colony-ui.js');window.calls=[];const client={saved:async()=>({}),enroll:async o=>{calls.push(['enroll',o]);return {}},claim:async()=>({task:{task_id:'task'}}),vote:async id=>{calls.push(['vote',id]);return {task_id:id,vote_id:'vote',action:'BUY'}},correct:async o=>{calls.push(['correct',o]);return {accepted:true}}};window.ui=await mountColonyUI(document.querySelector('#root'),client);});
 assert.match(await page.locator('#root').innerText(),/FLY DECISIONS/);assert.doesNotMatch(await page.locator('#root').innerText(),/[\u3400-\u9fff]|Quorum|Colony ID|Task ID/);
 await page.locator('#colonyStart').click();assert.equal(await page.evaluate(()=>calls.length),0);
 await page.locator('#colonyConsent').check();await page.locator('#colonyStart').click();await page.waitForFunction(()=>document.querySelector('#colonyStatus').textContent.includes('Submitted'));
 assert.match(await page.locator('#colonyDecision').innerText(),/LONG/);await page.locator('#colonyCorrect').click();await page.locator('#colonyCorrectionAction').selectOption('SHORT');await page.locator('#colonyCorrectionSave').click();await page.waitForFunction(()=>document.querySelector('#colonyCorrectionStatus').textContent.includes('saved'));
 const correction=await page.evaluate(()=>calls.find(c=>c[0]==='correct')[1]);assert.equal(correction.task_id,'task');assert.equal(correction.vote_id,'vote');assert.equal(correction.action,'SELL');assert.match(await page.locator('#colonyDecision').innerText(),/LONG/);
 await page.locator('#colonyPause').click();assert.match(await page.locator('#colonyStatus').innerText(),/Paused/);await page.evaluate(()=>ui.dispose());
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});

test('accepted votes are restored without reinference; retry backoff and pause stop polling',async()=>{
 const server=createServer(async(req,res)=>{try{res.setHeader('content-type',req.url==='/'?'text/html':'text/javascript');res.end(req.url==='/'?'<div id="root"></div>':await readFile(resolve('pages','.'+req.url)));}catch{res.statusCode=404;res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch();const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.clock.install();await page.evaluate(async()=>{
 const {mountColonyUI}=await import('/colony-ui.js');window.claims=0;window.votes=0;
 window.ui=await mountColonyUI(document.querySelector('#root'),{saved:async()=>({auto_consent:true}),claim:async()=>{claims++;if(claims===2)throw Error('<img src=x onerror=alert(1)>');return {task:{task_id:'t'},my_vote:{vote_id:'v',action:'SELL'}}},vote:async()=>{votes++;return {vote_id:'wrong',action:'BUY'}}},{pollMs:1000});
 });await page.locator('#colonyStart').click();await page.waitForFunction(()=>document.querySelector('#colonyStatus').textContent==='Submitted');assert.equal(await page.evaluate(()=>votes),0);assert.match(await page.locator('#colonyDecision').innerText(),/SHORT/);
 await page.clock.runFor(1000);await page.waitForFunction(()=>document.querySelector('#colonyStatus').textContent.includes('Retrying'));assert.equal(await page.locator('#root img').count(),0);await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>claims),2);
 await page.locator('#colonyPause').click();await page.clock.runFor(60000);assert.equal(await page.evaluate(()=>claims),2);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
