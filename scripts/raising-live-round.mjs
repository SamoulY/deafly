import assert from 'node:assert/strict';
const base='http://127.0.0.1:8787';
let token;
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{'X-Session-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(`${path}: ${r.status} ${JSON.stringify(d)}`);return d;}
const session=await api('/api/session',{nickname:'Local raising verifier'});token=session.token;
const profile=await api('/api/raising/profile');
let round=await api('/api/raising/sessions',{symbol:'BTCUSD'});
assert.equal(round.provenance.synthetic,false);
const id=round.id; const firstHash=round.observation_hash; const startBars=round.bars.length;
while(round.status==='ACTIVE'){
 const action=round.step===0?'BUY':round.step===10?'CLOSE':'HOLD';
 const body={action,step:round.step,idempotency_key:`verify-${id}-${round.step}`};
 round=await api(`/api/raising/sessions/${id}/actions`,body);
 const retry=await api(`/api/raising/sessions/${id}/actions`,body);
 assert.equal(retry.step,round.step);
}
const review=await api(`/api/raising/sessions/${id}/review`);
assert.equal(review.demonstrations.length,12);
const restored=await api('/api/raising/profile');assert.equal(restored.profile.fly_id,profile.profile.fly_id);
console.log(JSON.stringify({status:round.status,first_hash:firstHash,visible_bars_at_start:startBars,review_bars:round.bars.length,demonstrations:review.demonstrations.length,points:restored.points,account:round.account,provenance:round.provenance},null,2));
