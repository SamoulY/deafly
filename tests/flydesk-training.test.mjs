import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultCheckpoint,trainDecisionHead,evaluateFrozen,actionMask,hashCheckpoint} from '../worker/src/flydesk-training.mjs';
test('three-class personal model genuinely trains and refuses old four-action checkpoints',async()=>{
 const rows=Array.from({length:240},(_,i)=>({features:[i%2?1:-1,0,0,0,1,0,0],action:i%2?'BUY':'HOLD',time:i+1,session_id:'s'+Math.floor(i/10),observation_hash:'o'+i,training_eligible:true})),cp=createDefaultCheckpoint();
 const result=await trainDecisionHead({rows,parentCheckpoint:cp,maxEpochs:60,learningRate:.15});assert.ok(result.metrics.validation.accuracy>=.9);assert.ok(result.metrics.train.loss<result.metrics.initial_train.loss*.8);assert.notEqual(result.checkpoint_hash,result.parent_hash);assert.equal(result.checkpoint.weights.length,3);assert.equal(await hashCheckpoint(JSON.parse(JSON.stringify(result.checkpoint))),result.checkpoint_hash);
 await assert.rejects(trainDecisionHead({rows,parentCheckpoint:{...cp,backend:'market_only_readout_v1'}}),/schema/);assert.deepEqual(actionMask({position:'FLAT',cash:10000}),[true,false,true]);assert.throws(()=>actionMask({position:'SHORT',cash:10000}),/position/);
});
test('evaluation uses the same exact spot broker and five-minute cadence with both holding budgets',async()=>{
 const cp=createDefaultCheckpoint(),candles=Array.from({length:80},(_,i)=>({time:1000+i*60,open:100,high:101,low:99,close:100,volume:10,closed:true})),input={preCheckpoint:cp,postCheckpoint:cp,trainingManifest:{train:{end:100},validation:{end:200}},candles,usedIntervals:[]};
 const result=await evaluateFrozen(input);assert.equal(result.results.post.decisions,12);assert.equal(result.results.cash.net_pnl,0);assert.equal(result.results.buy_hold.voluntary_trades,1);assert.equal(result.results.buy_hold.forced_trades,1);assert.ok(result.results.buy_hold_full.fees_paid>result.results.buy_hold.fees_paid);assert.equal(result.results.post.final_equity,10000);assert.deepEqual(result,await evaluateFrozen(input));
});

test('inferred BUY eligibility converts normalized cash back to account currency',async()=>{
 const rows=Array.from({length:100},(_,i)=>({features:[0,0,0,0,0.001,0,0],action:i%2?'BUY':'HOLD',time:i+1,session_id:'cash'+i,observation_hash:'cash'+i,training_eligible:true}));
 const result=await trainDecisionHead({rows,maxEpochs:1});
 assert.equal(result.checkpoint.weights.length,3);
 await assert.rejects(trainDecisionHead({rows:rows.map(r=>({...r,features:[0,0,0,0,0,0,0]})),maxEpochs:1}),/masked label/);
});
