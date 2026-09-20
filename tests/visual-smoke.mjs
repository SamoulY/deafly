import { chromium } from 'playwright';
const url=process.argv[2]||'https://flydesk-v2-trial.pages.dev';
const browser=await chromium.launch({headless:true});
for(const [name,w,h] of [['desktop',1440,900],['mobile',390,844]]){
 const page=await browser.newPage({viewport:{width:w,height:h}});
 const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'networkidle',timeout:60000});
 await page.screenshot({path:`artifacts/${name}.png`,fullPage:true});
 const title=await page.title();const cash=await page.locator('#cash').textContent();
 await page.locator('[data-tab="predict"]').click();await page.waitForTimeout(1500);
 const cards=await page.locator('.market').count();
 console.log(JSON.stringify({name,title,cash,cards,errors}));
 await page.close();
}
await browser.close();
