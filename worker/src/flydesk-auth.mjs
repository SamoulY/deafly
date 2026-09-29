import {hash} from './raising-core.mjs';
import {argon2idAsync} from '@noble/hashes/argon2.js';
const hex=bytes=>[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
const bytes=s=>Uint8Array.from(s.match(/../g),x=>parseInt(x,16));
const ITERATIONS=2;
async function derive(password,salt,iterations=ITERATIONS){return hex(await argon2idAsync(new TextEncoder().encode(password),bytes(salt),{t:iterations,m:19456,p:1,dkLen:32,maxmem:24*1024*1024}));}
function equal(a,b){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
const cookieToken=r=>r.headers.get('cookie')?.match(/(?:^|;\s*)flydesk_session=([a-f0-9]{64})(?:;|$)/)?.[1];
export async function cookieUser(request,env){const token=cookieToken(request);if(!token)return null;return env.DB.prepare('SELECT u.* FROM users u JOIN flydesk_auth_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(token),Date.now()).first();}
export function allowedOrigin(request,env){const origin=request.headers.get('origin');if(!origin)return true;const own=new URL(request.url).origin,configured=String(env.ALLOWED_ORIGIN||'').split(',').map(x=>x.trim()).filter(x=>x&&x!=='*');return origin===own||configured.includes(origin)||(env.APP_ENV!=='production'&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));}
export async function handleAccount(request,env,existingUser) {
 const op=new URL(request.url).pathname.split('/').at(-1),db=env.DB;
 const json=(v,status=200,cookie)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store',...(cookie?{'set-cookie':cookie}:{})}});
 if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 if(!allowedOrigin(request,env))return json({error:'ORIGIN_DENIED'},403);
 const secure=new URL(request.url).protocol==='https:',suffix=`Path=/; HttpOnly; SameSite=${secure?'None':'Lax'}${secure?'; Secure':''}`;
 if(op==='logout'){const token=cookieToken(request);if(token)await db.prepare('DELETE FROM flydesk_auth_sessions WHERE token_hash=?').bind(await hash(token)).run();return json({logged_out:true},200,`flydesk_session=; Max-Age=0; ${suffix}`);}
 let b;try{b=await request.json();}catch{return json({error:'INVALID_JSON'},400);}
 const username=String(b?.username||'').trim().toLowerCase(),password=b?.password;
 if(!/^[a-z0-9_.-]{3,40}$/.test(username)||typeof password!=='string'||password.length<12||password.length>256)return json({error:'USERNAME_OR_PASSWORD_INVALID',message:'Username must be 3–40 letters, numbers, or _.-; password must be 12–256 characters'},422);
 const bucket=await hash({ip:request.headers.get('cf-connecting-ip')||'local',window:Math.floor(Date.now()/600000)});
 await db.prepare('INSERT INTO flydesk_auth_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').bind(bucket,Date.now()+600000).run();
 if((await db.prepare('SELECT count FROM flydesk_auth_limits WHERE bucket=?').bind(bucket).first()).count>20)return json({error:'RATE_LIMITED'},429);
 await db.prepare('DELETE FROM flydesk_auth_limits WHERE expires_at<?').bind(Date.now()).run();
 let uid;
 if(op==='register'){
   if(!existingUser)return json({error:'GUEST_SESSION_REQUIRED'},401);
   const salt=hex(crypto.getRandomValues(new Uint8Array(16))),digest=await derive(password,salt);
   try{await db.prepare('INSERT INTO flydesk_credentials VALUES (?,?,?,?,?,?)').bind(username,existingUser.id,salt,digest,ITERATIONS,Date.now()).run();}catch{return json({error:'ACCOUNT_ALREADY_EXISTS'},409);}uid=existingUser.id;
 } else if(op==='login'){
   const c=await db.prepare('SELECT * FROM flydesk_credentials WHERE username=?').bind(username).first(),digest=await derive(password,c?.salt||'00000000000000000000000000000000',c?.iterations||ITERATIONS);
   if(!c||!equal(digest,c.password_hash))return json({error:'INVALID_CREDENTIALS'},401);uid=c.user_id;
 } else return json({error:'NOT_FOUND'},404);
 const token=hex(crypto.getRandomValues(new Uint8Array(32)));await db.prepare('INSERT INTO flydesk_auth_sessions VALUES (?,?,?)').bind(await hash(token),uid,Date.now()+30*86400000).run();
 // Claiming the anonymous profile invalidates its localStorage bearer credential.
 if(op==='register')await db.prepare('UPDATE users SET token_hash=? WHERE id=?').bind(await hash(crypto.randomUUID()),uid).run();
 return json({user_id:uid,username},200,`flydesk_session=${token}; Max-Age=2592000; ${suffix}`);
}
