import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: {width, height:900} });
    const errors = [], fonts = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if(m.type()==='error') errors.push(m.text()); });
    page.on('response', r => { if(r.url().includes('pixel-ui.ttf')) fonts.push(r.status()); });
    await page.goto(process.env.UI_URL || 'http://127.0.0.1:8876/', {waitUntil:'domcontentloaded'});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2200);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const {root} = await cdp.send('DOM.getDocument');
    const {nodeId} = await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.wordmark strong'});
    const actualFonts = await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
    const state = await page.evaluate(() => ({
      width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
      family:getComputedStyle(document.querySelector('.wordmark strong')).fontFamily,
      loaded:document.fonts.check('16px Pixel'),
      runtimeInsideBar:!!document.querySelector('.brain-bar #brainRuntimeStatus'),
      cancelInsideBar:!!document.querySelector('.brain-bar #brainCancel'),
      retryInsideBar:!!document.querySelector('.brain-bar #brainRetry'),
      neurons:document.querySelector('#neurons').textContent,
      sample:document.querySelector('#displaySample').textContent,
    }));
    assert.equal(state.scrollWidth,width,'page must not overflow');
    assert.ok(state.loaded && state.runtimeInsideBar && state.cancelInsideBar && state.retryInsideBar);
    assert.ok(fonts.includes(200));
    assert.ok(actualFonts.fonts.some(f=>f.isCustomFont && f.familyName==='Pixelify Sans'));
    await page.screenshot({path:`/tmp/defly-pixel-${width}.png`,fullPage:true});
    for (const view of ['vision','brain','fly']) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.waitForTimeout(150);
      assert.deepEqual(await page.locator('.scene-wrap canvas:visible').evaluateAll(x=>x.map(c=>c.id)),[`${view}Scene`]);
    }
    console.log(JSON.stringify({state,actualFonts,fonts,errors}));
    assert.deepEqual(errors,[]);
    await page.close();
  }
} finally { await browser.close(); }
