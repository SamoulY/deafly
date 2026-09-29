import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {federation,verifyManifest} from '../worker/src/federation.mjs';
import {createFlyIdentity,signManifest} from '../pages/fly-identity.js';
import {createSessionClient} from '../pages/session-client.js';
import {createColonyClient} from '../pages/colony-client.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
async function fixture(t){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-01-01',d1Databases:['DB']}));t.after(()=>mf.dispose());
 const DB=await mf.getD1Database('DB');
 for(const file of ['schema.sql','migrations/0008_federation.sql','migrations/0009_colony_tasks.sql'])await DB.exec((await readFile(new URL('../worker/'+file,import.meta.url),'utf8')).replace(/\n/g,' '));
 await DB.prepare('INSERT INTO users(id,nickname,token_hash,created_at,last_seen_at) VALUES(?,?,?,?,?)').bind('alice','alice','alice',1,1).run();
 const identity=await createFlyIdentity(storage(),{genesis_model_hash:'a'.repeat(64)});
 const sent=[];let lost=false,mode='',saves=0;
 const request=async(url,options)=>{
  const path=new URL(url).pathname;if(path==='/api/state')return Response.json({user:{id:'alice'}});
  if(path.endsWith('/fly-manifest')){
   const body=JSON.parse(options.body);sent.push(body);assert.equal(await verifyManifest(body),null);
   if(mode==='conflict')return Response.json({error:'SEQUENCE_CONFLICT',current:{sequence:body.sequence+1,owner_user_id:'alice'}},{status:409});
   if(mode==='denied')return Response.json({error:'OWNER_MISMATCH'},{status:403});
  }
  const response=await federation(new Request(url,options),{DB},{id:'alice'},path);
  if(lost&&path.endsWith('/fly-manifest')&&response.ok){lost=false;throw Error('RESPONSE_LOST');}return response;
 };
 const client=(store=storage())=>createColonyClient({api:createSessionClient({origin:'https://test',storage:store,fetch:request}).api,identity,storage:store,withBrain:fn=>fn({saveCheckpoint:async()=>({hash:(++saves).toString(16).padStart(64,'0')})})});
 return {DB,identity,sent,client,set lost(v){lost=v},set mode(v){mode=v},get saves(){return saves}};
}
test('lost committed manifest response: next user retry recovers using real session client and D1',async t=>{
 const x=await fixture(t),c=x.client();x.lost=true;
 await assert.rejects(c.create({consent:true}),/RESPONSE_LOST/);
 assert.equal((await x.DB.prepare('SELECT COUNT(*) AS n FROM federation_fly_manifests').first()).n,1);
 const made=await c.create({consent:true});assert.ok(made.colony_id);
 assert.equal((await x.DB.prepare('SELECT MAX(sequence) AS n FROM federation_fly_manifests').first()).n,1);
});
test('two cached clients resync stale sequence with fresh checkpoint and signature',async t=>{
 const x=await fixture(t),a=x.client(),b=x.client();await Promise.all([a.init(),b.init()]);
 const made=await a.create({consent:true});await b.join(made.colony_id,{consent:true});
 assert.deepEqual(x.sent.map(m=>m.sequence),[0,0,1]);assert.notEqual(x.sent[1].checkpoint_hash,x.sent[2].checkpoint_hash);assert.notEqual(x.sent[1].signature,x.sent[2].signature);
});
test('simultaneous cached clients sharing storage both recover and persist next sequence',async t=>{
 const x=await fixture(t),store=storage(),a=x.client(store),b=x.client(store);
 await Promise.all([a.init(),b.init()]);
 const results=await Promise.all([a.create({consent:true}),b.create({consent:true})]);
 assert.ok(results.every(r=>r.colony_id));
 const rows=(await x.DB.prepare('SELECT sequence FROM federation_fly_manifests ORDER BY sequence').all()).results;
 assert.equal(rows.length,2);assert.ok(rows[1].sequence>rows[0].sequence);
 assert.ok(Number(store.getItem(`defly.colony.sequence:alice:${x.identity.fly_id}`))>rows[1].sequence);
});
test('sequence conflict retry is bounded and unrelated failures are never retried',async t=>{
 const x=await fixture(t);x.mode='conflict';await assert.rejects(x.client().create({consent:true}),e=>e.status===409&&e.code==='SEQUENCE_CONFLICT'&&Number.isSafeInteger(e.current.sequence));
 assert.equal(x.sent.length,3);assert.equal(x.saves,3);
 x.mode='denied';await assert.rejects(x.client().create({consent:true}),e=>e.status===403);assert.equal(x.sent.length,4);
});

test('concurrent manifest inserts return structured conflict, not D1 uniqueness failure',async t=>{
 const x=await fixture(t);let reads=0,release;const gate=new Promise(r=>release=r);
 const DB={prepare(sql){const stmt=x.DB.prepare(sql);return {bind(...args){const bound=stmt.bind(...args);if(!sql.startsWith('SELECT sequence'))return bound;return {async first(){const row=await bound.first();if(++reads<=2){if(reads===2)release();await gate;}return row;}};}};}};
 const body=await signManifest(x.identity,{owner_user_id:'alice',checkpoint_hash:'b'.repeat(64),sequence:0});
 const call=()=>federation(new Request('https://test/api/federation/fly-manifest',{method:'POST',body:JSON.stringify(body)}),{DB},{id:'alice'},'/api/federation/fly-manifest');
 const responses=await Promise.all([call(),call()]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
 const conflict=await responses.find(r=>r.status===409).json();assert.equal(conflict.error,'SEQUENCE_CONFLICT');assert.equal(conflict.current.sequence,0);assert.equal(conflict.current.owner_user_id,'alice');
});
