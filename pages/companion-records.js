import {locale} from './i18n.js?v=5';
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = seconds => new Date(seconds*1000).toLocaleString(locale(),{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const actions={BUY:'Buy Bitcoin',SELL:'Open a short',HOLD:'Wait',CLOSE:'Close the position'};
const verbs={BUY:'buying',SELL:'selling',HOLD:'waiting'};
export const effectLabels={changed:'Teaching changed this choice',same_choice:'Same choice with teaching',inactive:'Waiting for a signal',no_examples:'Before learning from you',unavailable:'Comparison unavailable'};
export function lessonLearningText(lesson) {
  if(!lesson.training_applied)return 'Your example is saved. Learning is still pending and will retry automatically.';
  const before=lesson.probability_before,after=lesson.probability_after,verb=verbs[lesson.action]||'this choice';
  if(![before,after].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))return `It practiced ${verb}. A before-and-after comparison was not saved for this example.`;
  const change=after-before;
  if(change>0.000001)return `In the scene you showed, it became more inclined to choose ${verb}.`;
  if(change<-.000001)return `It practiced ${verb}, but its preference for that choice decreased in this scene.`;
  return `It practiced ${verb}. Its preference for that choice stayed about the same.`;
}
export function lessonScene(lesson) {
  const bars=lesson.context?.market?.candles?.slice(-20)||[],first=bars[0],last=bars.at(-1),side=lesson.context?.portfolio?.position_side;
  if(!first||!last||!(first.close>0)||!Number.isFinite(last.close))return 'The market snapshot is unavailable.';
  const change=(last.close/first.close-1)*100,minutes=Math.round((last.time-first.time)/60);
  const movement=Math.abs(change)<.005?'was nearly flat':`had ${change>0?'risen':'fallen'} ${Math.abs(change).toFixed(2)}%`;
  if(lesson.context?.kind==='historical')return `Historical scene · ${date(last.time)} · Bitcoin ${movement} over ${minutes} minutes.`;
  return `At ${date(last.time)}, Bitcoin ${movement} over ${minutes} minutes. ${side==='LONG'?'Your fly held Bitcoin':side==='SHORT'?'Your fly held a short position':'Your fly had no open position'} when you taught it.`;
}
const link = row => `<button class="record-link" data-open-record="${escape(row.id)}"><span>${escape(row.title)}</span><time>${escape(date(row.created_at))} ›</time></button>`;
export function recordBody(row, rows) {
  if(row.kind==='teaching'){
    const later=rows.filter(r=>r.kind==='decision'&&row.training_applied&&r.teaching_evidence?.examples_learned>=row.model_version&&['changed','same_choice'].includes(r.teaching_evidence.effect));
    return `<div class="record-detail"><h3>What you showed</h3><p>${escape(lessonScene(row))}</p><h3>What it learned</h3><p>${escape(lessonLearningText(row))}</p>${row.action==='SELL'?'<p>A sell signal can close a Bitcoin holding or open a short. A short benefits when the price falls.</p>':''}<h3>Later choices using this learning</h3>${later.length?`<p>These choices used learning that included this example. Your fly considers your examples together.</p>${later.slice(0,4).map(link).join('')}<p class="record-note">Showing ${Math.min(4,later.length)} of ${later.length} matches in the latest 100 decisions.</p>`:'<p>No later choices using this example appear in the latest 100 decisions yet.</p>'}</div>`;
  }
  if(row.kind!=='decision')return `<div class="record-detail"><p>${escape(row.detail)}</p></div>`;
  const evidence=row.teaching_evidence||{effect:'unavailable'},effect=evidence.effect;
  const examples=rows.filter(r=>r.kind==='teaching'&&r.training_applied&&r.model_version<=evidence.examples_learned).sort((a,b)=>b.model_version-a.model_version).slice(0,3);
  const explanation={changed:'Your examples changed what it chose in this scene.',same_choice:'It considered your examples and kept the same choice.',inactive:'It had learned from you, but its brain was not sending an active trading signal.',no_examples:'This choice happened before it had learned any of your examples.',unavailable:'This older record has no reliable comparison. We cannot tell whether teaching changed it.'}[effect]||'A teaching comparison is unavailable.';
  const compare=['changed','same_choice'].includes(effect)&&actions[evidence.without_teaching]&&actions[evidence.with_teaching];
  return `<div class="record-detail"><p>${escape(row.detail)}</p><h3>${escape(effectLabels[effect]||effectLabels.unavailable)}</h3><p>${escape(explanation)}</p>${compare?`<div class="choice-comparison"><div><small>Without your examples</small><strong>${escape(actions[evidence.without_teaching])}</strong></div><span aria-hidden="true">→</span><div><small>With your examples</small><strong>${escape(actions[evidence.with_teaching])}</strong></div></div><p class="record-note">A replay of the same scene, with the same holdings and brain signal. Only the final choice became a paper decision.</p><h3>Examples it had learned</h3>${examples.length?examples.map(link).join(''):'<p>Those examples are outside the latest 100 shown here.</p>'}<p class="record-note">${evidence.examples_learned} example${evidence.examples_learned===1?'':'s'} learned by this point. This comparison shows their combined effect.</p>`:''}</div>`;
}
export function renderRecord(row, rows, open=false) {
  const badge=row.kind==='decision'?effectLabels[row.teaching_evidence?.effect]||effectLabels.unavailable:row.kind==='teaching'?(row.context?.kind==='historical'?'Historical practice · ':'')+(row.training_applied?'Learned':'Learning pending'):'';
  return `<details class="record" data-record-id="${escape(row.id)}" ${open?'open':''}><summary><span><small>${row.kind==='decision'?'Fly decision':row.kind==='teaching'?'Your teaching':row.kind==='beginning'?'Starting balance':'Together'}</small><strong>${escape(row.title)}</strong>${badge?`<span class="record-badge ${row.teaching_evidence?.effect==='changed'?'changed':''}">${escape(badge)}</span>`:''}</span><time>${escape(date(row.created_at))}</time></summary>${recordBody(row,rows)}</details>`;
}
