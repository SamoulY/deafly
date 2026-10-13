import {readFile} from 'node:fs/promises';

// Serve real module URLs so view tests exercise the same relative imports as
// the application, while all API calls remain controlled by each test.
export async function loadRaisingView(page){
  const modules=new Set(['/raising-ui.js','/i18n.js','/locales/zh-CN.js']);
  await page.route('https://raising.test/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><body><div id="raisingRoot"></div></body></html>'});
    if(!modules.has(path))return route.abort();
    return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../../pages'+path,import.meta.url),'utf8')});
  });
  await page.goto('https://raising.test/');
}
