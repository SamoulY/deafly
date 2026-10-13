import test from 'node:test';
import assert from 'node:assert/strict';
import {compareTeaching,recordedTeachingEvidence} from '../worker/src/companion-evidence.mjs';
import {initialTeachingModel,trainTeachingExample,TEACHING_BACKEND} from '../worker/src/companion-learning.mjs';
import {recordBody,lessonLearningText,renderRecord} from '../pages/companion-records.js';

const features=[0,0,0,1,0,0,0],flat={cash:10000,position_side:'FLAT'};
const decoder={gate_spikes:1,difference_hz:0,proposed_action:'HOLD'};
let model=initialTeachingModel();for(let i=0;i<3;i++)model=trainTeachingExample(model,features,'BUY').model;
test('comparison distinguishes changed choices, unchanged choices, constraints, and inactive brains',()=>{
  assert.equal(compareTeaching(model,features,decoder,flat).effect,'changed');
  assert.equal(compareTeaching(model,features,decoder,{...flat,position_side:'LONG'}).effect,'same_choice');
  assert.equal(compareTeaching(model,features,decoder,{...flat,cash:0}).effect,'same_choice');
  assert.equal(compareTeaching(model,features,{...decoder,gate_spikes:0},flat).effect,'inactive');
  assert.equal(compareTeaching(initialTeachingModel(),features,decoder,flat).effect,'no_examples');
});
test('legacy replay uses the frozen model and validates the recorded final action',()=>{
  const decision={action:'BUY',portfolio:{provenance:{decoder,teaching:{backend:TEACHING_BACKEND,model_version:3,model_hash:'saved'}}}};
  const frozen={checkpoint_json:JSON.stringify(model),features_json:JSON.stringify(features),model_hash:'saved'};
  assert.equal(recordedTeachingEvidence(decision,frozen).effect,'changed');
  assert.equal(recordedTeachingEvidence({...decision,action:'SELL'},frozen).effect,'unavailable');
  assert.equal(recordedTeachingEvidence(decision,{...frozen,model_hash:'later'}).effect,'unavailable');
  assert.equal(recordedTeachingEvidence(decision,{...frozen,features_json:'bad'}).effect,'unavailable');
  assert.equal(recordedTeachingEvidence({action:'BUY'},frozen).effect,'unavailable');
});
test('records describe measured learning, combined influence, missing evidence and safe cross-links',()=>{
  const lesson={id:'a',kind:'teaching',title:'You showed: buy',created_at:1,action:'BUY',training_applied:true,model_version:1,probability_before:.3,probability_after:.6};
  const future={...lesson,id:'future',model_version:4};
  const decision={id:'d',kind:'decision',title:'Bought Bitcoin',created_at:2,detail:'Paper decision',teaching_evidence:compareTeaching(model,features,decoder,flat)};
  const body=recordBody(decision,[lesson,future,decision]);
  assert.match(body,/Without your examples/);assert.match(body,/With your examples/);assert.match(body,/combined effect/);
  assert.match(body,/data-open-record="a"/);assert.doesNotMatch(body,/data-open-record="future"/);
  assert.match(recordBody(lesson,[lesson,decision]),/included this example/);
  assert.match(lessonLearningText(lesson),/more inclined/);
  assert.match(lessonLearningText({...lesson,probability_after:null}),/not saved/);
  assert.match(lessonLearningText({...lesson,training_applied:false}),/pending/);
  const html=renderRecord({...lesson,id:'"><script>',title:'<img onerror=bad>'},[]);
  assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;img/);
});
