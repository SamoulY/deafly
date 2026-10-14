export async function mockTurnstile(page){
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*',r=>r.fulfill({contentType:'text/javascript',body:`window.turnstile={render(el,options){el.textContent='Isolated test security check';setTimeout(()=>options.callback('test-pass'),20);return 'test';},remove(){},reset(){}};`}));
}
