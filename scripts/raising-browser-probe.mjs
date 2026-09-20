import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8876/',{waitUntil:'networkidle'});
 await page.screenshot({path:'/tmp/defly-raising-desktop.png',fullPage:true});
 console.log(JSON.stringify({errors,text:await page.locator('body').innerText(),buttons:await page.locator('button').evaluateAll(bs=>bs.map(b=>({id:b.id,text:b.textContent,disabled:b.disabled})))},null,2));
} finally {await browser.close();}
