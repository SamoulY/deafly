import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
test('raising view renders profile and action mask, wardrobe purchase and review states', async () => {
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent('<div id="raisingRoot"></div>');
  const source=await readFile(new URL('../pages/raising-ui.js',import.meta.url),'utf8');
  const result=await page.evaluate(async source=>{
   const mod=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
   if(!mod.init) return 'missing init';
   const p={profile:{name:'Ada',loadout:{}},points:12,owned:['head-cap'],active_session_id:'r'};
   const s={id:'r',status:'ACTIVE',step:0,total_steps:12,bars:[],account:{equity:10000,side:'FLAT'},observation:{action_mask:['BUY','SELL','HOLD']},provenance:{provider:'Kraken',synthetic:false}};
   await mod.init({api:async path=>path.endsWith('/profile')?p:path.endsWith('/catalog')?{items:[{id:'head-crown',slot:'head',name:'Crown',cost:20}]}:s});
   return {name:document.querySelector('#flyName').value,hold:document.querySelector('[data-teach="HOLD"]').disabled,close:document.querySelector('[data-teach="CLOSE"]').disabled};
  },source);
  assert.deepEqual(result,{name:'Ada',hold:false,close:true});
  await page.locator('#wardrobeToggle').click();
  assert.equal(await page.locator('#wardrobe').isVisible(),true);
  assert.equal(await page.locator('[data-purchase="head-crown"]').isDisabled(),true);
 } finally {await browser.close();}
});
