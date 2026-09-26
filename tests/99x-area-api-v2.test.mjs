import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/src/index.mjs';
const html=readFileSync(new URL('../pages/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../pages/app.js',import.meta.url),'utf8');
test('99x trading area is a separate closable view',()=>{for(const x of ['id="open99x"','id="arena99x"','id="close99x"','99x.meme TRADING AREA','id="ninexUsername"'])assert.ok(html.includes(x),x);assert.match(app,/arena99x/);});
test('unbound optional arena fails closed for all supported routes',async()=>{
 for(const path of ['markets','leaderboard','session']){
 const response=await worker.fetch(new Request('https://local/api/99x/'+path,path==='session'?{method:'POST',body:JSON.stringify({nickname:'test'})}:{}),{},{});
 assert.equal(response.status,503);assert.equal((await response.json()).error,'ARENA_UNAVAILABLE');
 }
});
test('bound arena forwards exact route, method, session header and sanitized body',async()=>{
 for(const [route,target] of [['markets','/api/arena/markets'],['leaderboard','/api/arena/leaderboard'],['session','/api/session']]){
 let calls=0;const session=route==='session';const response=await worker.fetch(new Request('https://local/api/99x/'+route,{method:session?'POST':'GET',headers:{'X-99X-Session-Token':'test-token'},...(session?{body:JSON.stringify({nickname:'x'.repeat(40),unexpected:'drop'})}:{})}),{ARENA:{async fetch(request){calls++;assert.equal(new URL(request.url).pathname,target);assert.equal(request.method,session?'POST':'GET');assert.equal(request.headers.get('X-Session-Token'),'test-token');if(session)assert.deepEqual(await request.json(),{nickname:'x'.repeat(24)});return Response.json({upstream:true},{status:201});}}},{});
 assert.equal(calls,1);assert.equal(response.status,201);assert.deepEqual(await response.json(),{upstream:true});
 }
});
