import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlySync} from '../pages/fly-sync.js';
const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
const profile=name=>({profile:{name,fly_id:'website-id',loadout:{}},points:42,owned:[]});
const room=(loadout={},inventory=[{item_id:'desk-lamp',slot:'desk',equipped:0}])=>({loadout,inventory,cash:123,history:[],items:[]});

test('fly name uses local choices, retries failed sync, and never writes account or brain data',async()=>{
  const storage=memory(),calls=[],statuses=[];let online=true;
  storage.setItem('defly.fly.identity.v1:alice','private identity');storage.setItem('brain','brain bytes');
  const sync=createFlySync({storage,key:'alice',onStatus:s=>statuses.push(s),api:async(path,options)=>{calls.push([path,options.body]);if(!online)throw Error('offline');return profile(options.body.name);}});
  assert.equal((await sync.profile(profile('Website Fly'))).profile.name,'Website Fly');assert.equal(calls.length,0);
  online=false;assert.equal((await sync.rename('Local Fly',profile('Website Fly'))).profile.name,'Local Fly');assert.match(statuses.at(-1),/retry/);
  online=true;assert.equal((await sync.profile(profile('Different website name'))).profile.name,'Local Fly');assert.deepEqual(calls.at(-1),['/api/flydesk/profile',{name:'Local Fly'}]);
  assert.equal(storage.getItem('defly.fly.identity.v1:alice'),'private identity');assert.equal(storage.getItem('brain'),'brain bytes');
  const other=createFlySync({storage,key:'bob',api:async()=>{throw Error('must not write');}});
  assert.equal((await other.profile(profile('Bob'))).profile.name,'Bob');
});

test('room preference wins conflicts but server ownership and cash win over stale or forged local values',async()=>{
  const storage=memory();let sent;
  const sync=createFlySync({storage,key:'alice',api:async(path,options)=>{sent={path,body:options.body};return room(options.body.loadout);}});
  await sync.room(room({desk:'desk-lamp'}));
  const reconciled=await sync.room(room());assert.equal(reconciled.loadout.desk,'desk-lamp');assert.equal(reconciled.cash,123);assert.deepEqual(sent.body,{loadout:{desk:'desk-lamp'}});
  const key='defly.fly.preferences.v1:alice';storage.setItem(key,JSON.stringify({version:1,loadout:{desk:'desk-lamp',head:'unowned-gold'},cash:999999}));
  const sold=await sync.room(room({},[]));assert.deepEqual(sold.loadout,{});assert.equal(sold.cash,123);assert.deepEqual(JSON.parse(storage.getItem(key)).loadout,{});
  await sync.chooseItem({slot:'desk',item_id:'desk-lamp'},true,room());
  assert.equal((await sync.room(room())).loadout.desk,'desk-lamp');
  await sync.chooseItem({slot:'desk',item_id:'desk-lamp'},false,room({desk:'desk-lamp'}));
  assert.deepEqual((await sync.room(room({desk:'desk-lamp'}))).loadout,{},'explicitly removing every item survives a refresh');
});

test('corrupt local preferences are preserved and overlapping sync cannot erase a newer choice',async()=>{
  const storage=memory(),key='defly.fly.preferences.v1:alice';storage.setItem(key,'not json');
  const sync=createFlySync({storage,key:'alice',api:async()=>{throw Error('must not write');}});
  await assert.rejects(sync.profile(profile('Cloud')),/kept unchanged/);assert.equal(storage.getItem(key),'not json');
  storage.setItem(key,JSON.stringify({version:1,loadout:{desk:'desk-lamp'}}));
  let unblock;const wait=new Promise(resolve=>unblock=resolve);let first=true;
  const ordered=createFlySync({storage,key:'alice',api:async(path,{body})=>{if(first){first=false;await wait;}return room(body.loadout);}});
  const old=ordered.room(room()),newer=ordered.chooseItem({slot:'desk',item_id:'desk-lamp'},false,room({desk:'desk-lamp'}));unblock();await Promise.all([old,newer]);
  assert.deepEqual(JSON.parse(storage.getItem(key)).loadout,{});
});
