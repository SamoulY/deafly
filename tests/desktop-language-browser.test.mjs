import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {startDev} from '../scripts/flydesk-dev.mjs';

test('desktop charts and bilingual mobile preserve teaching, user data and option values',async t=>{
  const dev=await startDev({fixture:true,port:8901,apiPort:8787});t.after(()=>dev.close());
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});const page=await context.newPage(),errors=[],posts=[],copy={};
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push({path:new URL(r.url()).pathname,body:r.postDataJSON()});});
  await page.route('**/full-brain/**',route=>/\.(?:bin\.gz|wasm)$/.test(new URL(route.request().url()).pathname)?route.abort():route.continue());
  await page.goto(dev.url);await page.waitForFunction(()=>!document.querySelector('#chartPoint')?.disabled);
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
  assert.equal(await page.locator('.overview>.muted').textContent(),'总资产');
  assert.equal(await page.locator('[data-language-choice]').inputValue(),'zh-CN');
  const initial=await dev.db.prepare('SELECT * FROM portfolios LIMIT 1').first(),baseline=posts.length;
  const chart=await page.locator('#teachChart').boundingBox(),side=await page.locator('.home-sidebar').boundingBox();
  assert.ok(chart.width>650&&chart.height>=300);assert.ok(side.x>chart.x+chart.width+30);
  await page.locator('[data-chart-style="candles"]').click();await page.locator('#marketTimeframe').selectOption('300');
  await page.locator('#chartSettingsToggle').click();await page.locator('[data-chart-setting="volume"]').check();await page.locator('[data-chart-setting="average"]').check();
  await page.waitForFunction(()=>document.querySelectorAll('#teachChart .market-candle').length===40);assert.equal(await page.locator('.volume-bar').count(),40);
  assert.equal(await page.locator('#averageNotice').isVisible(),false);
  assert.equal(posts.length,baseline,'display preferences must not mutate any account or start training');
  await page.locator('#teachChart').click({position:{x:chart.width-70,y:100}});await page.waitForFunction(()=>!document.querySelector('[data-demonstrate="BUY"]').disabled);
  assert.equal(await page.locator('#marketTimeframe').isDisabled(),true,'timeframe freezes with a pending example');
  const captured=posts.findLast(r=>r.path.endsWith('/contexts')).body;
  const lessonContext=await dev.db.prepare('SELECT snapshot_json FROM companion_contexts ORDER BY created_at DESC LIMIT 1').first();
  assert.equal(captured.candle_time,undefined);assert.ok(JSON.parse(lessonContext.snapshot_json).market.candles.at(-1).time>Date.now()/1000-130);
  await page.locator('[data-demonstrate="HOLD"]').click();
  const beforeSwitch=posts.length;
  await page.locator('[data-language-choice]').selectOption('en');
  assert.equal(await page.locator('#lessonTitle').textContent(),'You would wait here');
  assert.equal(await page.locator('#saveLesson').isDisabled(),false);assert.equal(posts.length,beforeSwitch);
  await page.locator('[data-language-choice]').selectOption('zh-CN');
  await page.getByRole('button',{name:'保存示范',exact:true}).click();
  await page.getByText('已经学会这个示范，果蝇会在以后的判断中参考它。',{exact:true}).waitFor();
  assert.deepEqual(await dev.db.prepare('SELECT * FROM portfolios LIMIT 1').first(),initial);
  assert.equal((await dev.db.prepare('SELECT COUNT(*) n FROM companion_lessons').first()).n,1);
  await page.locator('#chartPoint').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('[data-demonstrate="BUY"]').disabled);
  const keyboardContext=await dev.db.prepare('SELECT snapshot_json FROM companion_contexts ORDER BY rowid DESC LIMIT 1').first();
  const keyboardTime=JSON.parse(keyboardContext.snapshot_json).market.candles.at(-1).time;
  assert.ok(keyboardTime>Date.now()/1000-130,'keyboard teaching always captures the latest point');
  await page.locator('[data-cancel-lesson]').last().click();
  await page.locator('.bottom-nav [data-go="records"]').click();await page.locator('[data-filter="teaching"]').click();await page.locator('#recordList summary').click();
  await page.getByRole('heading',{name:'它学到了什么',exact:true}).waitFor();
  await page.locator('[data-language-choice]').selectOption('en');assert.equal(await page.locator('.record[open]').count(),1);await page.getByRole('heading',{name:'What it learned',exact:true}).waitFor();
  await page.locator('[data-language-choice]').selectOption('zh-CN');
  await page.locator('.bottom-nav [data-go="home"]').click();await page.locator('#flyToolsToggle').click();
  await page.locator('#companionRename input').fill('Waiting');await page.locator('#companionRename button').click();await page.waitForFunction(()=>document.querySelector('#companionName').textContent==='Waiting');
  await page.locator('#pauseMotion').click();await page.getByRole('button',{name:'恢复动画',exact:true}).waitFor();await page.locator('#pauseMotion').click();await page.getByRole('button',{name:'暂停动画',exact:true}).waitFor();
  await page.locator('#flyToolsToggle').click();await page.reload();await page.waitForFunction(()=>!document.querySelector('#chartPoint')?.disabled);
  assert.equal(await page.locator('[data-language-choice]').inputValue(),'zh-CN');assert.equal(await page.locator('#marketTimeframe').inputValue(),'300');
  assert.equal(await page.locator('#companionName').textContent(),'Waiting');
  await mkdir('runtime/reports',{recursive:true});await page.screenshot({path:'runtime/reports/desktop-zh-day.png',fullPage:true});
  for(const language of ['zh-CN','en']){
    await page.locator('[data-language-choice]').selectOption(language);
    for(const width of [320,390,768,1024,1440,1920]){
      await page.setViewportSize({width,height:1000});await page.waitForTimeout(30);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${language} home at ${width}`);
      if(width<1000)assert.equal(await page.locator('.market-toolbar').isVisible(),false);
    }
  }
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelectorAll('#teachChart .market-candle').length===0);assert.equal(await page.locator('.market-candle').count(),0,'phone defaults to its independent line view');
  await page.locator('[data-language-choice]').selectOption('zh-CN');await page.screenshot({path:'runtime/reports/mobile-zh-day.png',fullPage:true});
  await page.locator('#mobileChartToggle').click();await page.locator('[data-chart-style="candles"]').click();assert.ok(await page.locator('.market-candle').count()>30);await page.locator('#mobileChartToggle').click();
  await page.locator('.bottom-nav [data-go="more"]').click();await page.locator('[data-theme-choice]').selectOption('dark');
  for(const target of ['holding','records','analysis','practice','vision','colony','account','technical','experiments']){
    if(target==='holding'){await page.locator('.bottom-nav [data-go="home"]').click();await page.locator('#holdingLink').click();}
    else if(target==='records')await page.locator('.bottom-nav [data-go="records"]').click();
    else {await page.locator('.bottom-nav [data-go="more"]').click();if(['technical','experiments'].includes(target)&&!await page.locator(`[data-page="more"] [data-go="${target}"]`).isVisible())await page.locator('[data-page="more"] details summary').click();await page.locator(`[data-page="more"] [data-go="${target}"]`).click();}
    await page.locator(`[data-page="${target}"]`).waitFor({state:'visible'});
    for(const language of ['zh-CN','en','zh-CN']){
      await page.locator('[data-language-choice]').selectOption(language);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${target} ${language} at 390`);
    }
    copy[target]=await page.locator(`[data-page="${target}"]`).innerText();
    if(target==='colony')assert.deepEqual(await page.locator('#colonyCorrectionAction option').evaluateAll(options=>options.map(o=>o.value)),['LONG','SHORT','HOLD','CLOSE']);
    if(target==='account')await page.getByText('账号登录 / 保存当前果蝇',{exact:true}).waitFor();
  }
  await page.locator('.bottom-nav [data-go="home"]').click();await page.setViewportSize({width:1440,height:1000});await page.locator('[data-language-choice]').selectOption('en');await page.screenshot({path:'runtime/reports/desktop-en-night.png',fullPage:true});
  await writeFile('runtime/reports/locale-visible-copy.json',JSON.stringify(copy,null,2));
  assert.deepEqual(errors,[]);
});
