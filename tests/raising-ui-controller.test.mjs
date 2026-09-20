import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../pages/raising-ui.js').catch(() => ({}));
test('fresh load prepares historical bars without decisions', async () => {
  const calls=[];
  const ui=module.createRaisingController({api:async(path,opt)=>{
    calls.push([path,opt]);
    if(path.endsWith('/profile')) return {profile:{loadout:{}},active_session_id:null};
    if(path.endsWith('/catalog')) return {items:[]};
    if(path.endsWith('/sessions')) return {id:'initial',status:'ACTIVE',step:0,bars:[{close:10}]};
    throw Error('Unexpected mutation '+path);
  }});
  await ui.load();
  assert.equal(ui.state.session?.id,'initial');
  assert.equal(ui.state.session.step,0);
  assert.equal(calls.filter(([,o])=>o?.method==='POST').length,1);
});
test('training retries reuse the uncertain request key and new attempts rotate it', async () => {
  const keys=[]; let fail=true;
  const ui=module.createRaisingController({api:async (path,opt)=>{
    assert.equal(path,'/api/raising/training');
    keys.push(opt.body.idempotency_key);
    if(fail) { fail=false; throw Error('timeout'); }
    return {job:{id:'job',status:'QUEUED'}};
  }});
  await assert.rejects(ui.train(),/timeout/);
  await ui.train();
  await ui.train();
  assert.equal(keys[0],keys[1]);
  assert.notEqual(keys[1],keys[2]);
});
test('evaluation presents baseline and frozen model metrics without claiming improvement', () => {
  const metrics={net_pnl:12,max_drawdown:0.02,direction_accuracy:null,forced_trade_rate:0.1,voluntary_trade_rate:0.2};
  const html=module.renderEvaluation({status:'COMPLETED',result:{status:'NO VERIFIED IMPROVEMENT',results:{cash:metrics,buy_hold:metrics,pre:metrics,post:metrics}}});
  for(const label of ['NO VERIFIED IMPROVEMENT','CASH BASELINE','BUY &amp; HOLD','PRE-TRAINING','POST-TRAINING','2.0%','$12.00','REFERENCE ENGINE']) assert.ok(html.includes(label),label);
  assert.ok(!html.includes('[object Object]'));
});
test('complete round refreshes earned points; failed retry preserves idempotency and wardrobe uses catalog IDs', async () => {
  const calls=[]; let fail=true;
  const profile={profile:{name:'Fly',loadout:{}},points:9,owned:[]};
  const api=async (path,opt)=>{
    calls.push([path,opt]);
    if(path.endsWith('/actions')) { if(fail){ fail=false; throw Error('offline'); } return {id:'r',status:'COMPLETED',step:12,bars:[]}; }
    if(path.endsWith('/sessions')) return {id:'r',status:'ACTIVE',step:11,observation:{action_mask:['HOLD']}};
    if(path.endsWith('/review')) return {demonstrations:[],equity_curve:[]};
    return profile;
  };
  const ui=module.createRaisingController({api});
  await ui.start('BTCUSD');
  await assert.rejects(ui.act('HOLD'), /offline/);
  const key=calls.at(-1)[1].body.idempotency_key;
  await ui.act('HOLD');
  assert.equal(calls.filter(x=>x[0].endsWith('/actions')).at(-1)[1].body.idempotency_key,key);
  assert.equal(ui.state.profile.points,9);
  await ui.purchase('head-crown');
  assert.deepEqual(calls.at(-1)[1].body,{item_id:'head-crown'});
  await ui.equip('head-crown');
  assert.deepEqual(calls.at(-1)[1].body,{item_id:'head-crown'});
  await ui.rename('Ada');
  assert.deepEqual(calls.at(-1)[1].body,{name:'Ada'});
});
test('restores profile outfit and active round; HOLD submits explicit human action and idempotency', async () => {
  assert.equal(typeof module.createRaisingController, 'function');
  const calls = [], observations = [], outfits = [];
  const active = {id:'round-1',status:'ACTIVE',step:0,bars:[{close:10}],observation:{action_mask:['HOLD']}};
  const profile = {profile:{name:'Ada',loadout:{head:'head-cap'}},points:4,owned:['head-cap'],active_session_id:'round-1'};
  const api = async (path,opt) => {
    calls.push([path,opt]);
    if(path.endsWith('/profile')) return profile;
    if(path.endsWith('/catalog')) return {items:[]};
    if(path.endsWith('/actions')) return {...active,step:1};
    return active;
  };
  const ui = module.createRaisingController({api,onObservation:s=>observations.push(s),onOutfit:o=>outfits.push(o)});
  await ui.load();
  assert.equal(ui.state.session.id,'round-1');
  assert.deepEqual(outfits,[profile.profile.loadout]);
  assert.equal(observations[0],active);
  await ui.act('HOLD');
  const payload = calls.at(-1)[1].body;
  assert.equal(payload.action,'HOLD');
  assert.equal(payload.step,0);
  assert.ok(payload.idempotency_key);
  assert.equal(ui.state.session.step,1);
});
