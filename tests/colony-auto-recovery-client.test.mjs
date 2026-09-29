import test from 'node:test';
import assert from 'node:assert/strict';
import {createColonyClient} from '../pages/colony-client.js';

test('pending recovery is owner/fly scoped and unrelated responses do not acknowledge it',async()=>{
 const records=new Map();const storage={getItem:k=>records.get(k)||null,setItem:(k,v)=>records.set(k,v)};
 storage.setItem('defly.colony:alice:fly-a',JSON.stringify({pending_vote_task_id:'pending'}));
 const calls=[];
 const make=(owner,fly)=>createColonyClient({identity:{fly_id:fly},storage,withBrain:()=>{throw Error('unexpected inference');},api:async(path,o)=>{
 if(path==='/api/state')return {user:{id:owner}};
 calls.push(o.body);return {task:{task_id:'other'},my_vote:{vote_id:'other-vote',action:'BUY'}};
 }});
 const alice=make('alice','fly-a');await alice.claim();assert.deepEqual(calls.pop(),{recover_task_id:'pending'});
 await alice.acknowledgeVote('other');assert.equal((await alice.saved()).pending_vote_task_id,'pending');
 await make('bob','fly-a').claim();assert.deepEqual(calls.pop(),{});
 await make('alice','fly-b').claim();assert.deepEqual(calls.pop(),{});
 await alice.acknowledgeVote('pending');await alice.claim();assert.deepEqual(calls.pop(),{});
});
