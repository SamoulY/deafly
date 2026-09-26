import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handleAccount,cookieUser} from '../worker/src/flydesk-auth.mjs';
test('Argon2id registration preserves guest identity; login uses HttpOnly cookies; logout revokes access',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-01-01',d1Databases:['DB']}));t.after(()=>mf.dispose());const DB=await mf.getD1Database('DB');
 await DB.exec("CREATE TABLE users(id TEXT PRIMARY KEY,token_hash TEXT); INSERT INTO users VALUES ('alice','legacy');");await DB.exec(await readFile(new URL('../worker/migrations/0010_flydesk_auth.sql',import.meta.url),'utf8'));
 const env={DB,APP_ENV:'production',ALLOWED_ORIGIN:'https://desk.example'},body={username:'alice',password:'long-test-password-123'};
 const req=(op,body,cookie,origin='https://desk.example')=>new Request('https://api.example/api/account/'+op,{method:'POST',headers:{origin,...(cookie?{cookie}:{})},body:JSON.stringify(body)});
 assert.equal((await handleAccount(req('register',body,null,'https://evil.example'),env,{id:'alice'})).status,403);
 const registered=await handleAccount(req('register',body),env,{id:'alice'});assert.equal(registered.status,200);assert.match(registered.headers.get('set-cookie'),/HttpOnly/);assert.match(registered.headers.get('set-cookie'),/Secure/);assert.equal((await registered.json()).user_id,'alice');
 const credential=await DB.prepare('SELECT * FROM flydesk_credentials').first();assert.notEqual(credential.password_hash,body.password);assert.equal(credential.iterations,2);assert.notEqual((await DB.prepare('SELECT token_hash FROM users').first()).token_hash,'legacy');
 assert.equal((await handleAccount(req('login',{...body,password:'wrong-password-123'}),env,null)).status,401);
 const login=await handleAccount(req('login',body),env,null);assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await cookieUser(req('state',{},cookie),env)).id,'alice');
 await handleAccount(req('logout',{},cookie),env,null);assert.equal(await cookieUser(req('state',{},cookie),env),null);
});
