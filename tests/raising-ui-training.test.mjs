import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
test('training retries, frozen evaluation and encoded checkpoint activation work in the view',async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  page.setDefaultTimeout(2000);
  page.on('pageerror',error=>console.error('Browser error:',error));
  const waitForStatus=async expected=>{
   try { await page.waitForFunction(expected=>document.querySelector('#raisingStatus').textContent.includes(expected),expected); }
   catch(error) { throw new Error(`Expected status ${expected}; received ${await page.locator('#raisingStatus').textContent()}`,{cause:error}); }
  };
  // randomUUID is a secure-context API; use the app's HTTPS environment.
  await page.route('https://raising.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="raisingRoot"></div>'}));
  await page.goto('https://raising.test/');
  assert.equal(await page.evaluate(()=>isSecureContext && typeof crypto.randomUUID==='function'),true);
  const source=await readFile(new URL('../pages/raising-ui.js',import.meta.url),'utf8');
  await page.evaluate(async source=>{
   const mod=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
   window.calls=[]; let fail=true,active=null,evaluated=false;
   await mod.init({api:async(path,opt)=>{
    window.calls.push({path,opt});
    if(path.endsWith('/profile')) return {profile:{name:'Test',loadout:{}},points:0,owned:[]};
    if(path.endsWith('/catalog')) return {items:[]};
    if(path.endsWith('/sessions')) return {id:'round',status:'ACTIVE',step:0,observation:{action_mask:['BUY','SELL','HOLD']}};
    if(path.endsWith('/activate')) {active=path.includes('/versions/0/')?null:{id:'v /1',checkpoint_hash:'abc'};return {active_version:active};}
    if(path.endsWith('/evaluations')) {
     if(opt?.method==='POST'){evaluated=true;return {evaluation:{status:'COMPLETED'}};}
     return {evaluations:evaluated?[{status:'COMPLETED',result:{status:'NO VERIFIED IMPROVEMENT',results:{post:{net_pnl:-4,max_drawdown:0.01}}}}]:[]};
    }
    if(opt?.method==='POST'){if(fail){fail=false;throw Error('timeout');}return {job:{id:'job',status:'QUEUED'}};}
    return {eligibility:{eligible_count:100,min_train:64,min_validation:16},jobs:[{id:'job',status:'COMPLETED'}],versions:[{id:'v /1',checkpoint_hash:'abc'}],active_version:active};
   }});
  },source);
  await page.locator('[data-raising-tab="training"]').click();
  await page.waitForFunction(()=>document.querySelector('#raisingStatus').textContent==='TRAINING LOADED');
  await page.locator('#trainFly').click();
  await waitForStatus('timeout');
  assert.equal(await page.locator('#trainFly').innerText(),'RETRY TRAINING');
  await page.locator('#trainFly').click();
  await page.waitForFunction(()=>document.querySelector('#raisingStatus').textContent==='TRAINING REQUEST ACCEPTED');
  const keys=await page.evaluate(()=>calls.filter(c=>c.path.endsWith('/training')&&c.opt?.method==='POST').map(c=>c.opt.body.idempotency_key));
  assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
  await page.locator('[data-evaluate]').click();
  await page.waitForFunction(()=>document.querySelector('#raisingStatus').textContent==='EVALUATION SAVED');
  assert.match(await page.locator('#trainingResults').innerText(),/NO VERIFIED IMPROVEMENT/);
  await page.locator('[data-activate="v /1"]').click();
  await page.waitForFunction(()=>document.querySelector('#raisingStatus').textContent==='CHECKPOINT ACTIVATED');
  assert.equal(await page.locator('[data-activate="v /1"]').isDisabled(),true);
  assert.ok(await page.evaluate(()=>calls.some(c=>c.path==='/api/raising/versions/v%20%2F1/activate')));
  await page.locator('[data-activate="0"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-activate="0"]').disabled);
 } finally {await browser.close();}
});
