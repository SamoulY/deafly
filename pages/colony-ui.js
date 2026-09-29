const label = action => ({BUY:'LONG',SELL:'SHORT',HOLD:'HOLD',CLOSE:'CLOSE'})[action] || 'Unavailable';
const action = value => ({LONG:'BUY',SHORT:'SELL',HOLD:'HOLD',CLOSE:'CLOSE'})[value];

export async function mountColonyUI(root, client, {beforeStart=async()=>{}, onRunning=()=>{}, pollMs=15000}={}) {
 root.innerHTML=`<h2>FLY DECISIONS</h2><p>Your fly receives market tasks and decides automatically with its full local brain. No trades are executed. Personal autonomous trading pauses while this is running.</p><label id="colonyConsentLabel"><input id="colonyConsent" type="checkbox"> I agree to publish my fly identity, checkpoint hash and signed decisions, and join persistent public membership. My private key and brain checkpoint stay in this browser. Pausing does not delete public records.</label><div><button id="colonyStart">Start</button><button id="colonyPause" disabled>Pause</button></div><p id="colonyStatus" role="status">Paused</p><p id="colonyDecision">No decision yet.</p><button id="colonyCorrect" disabled>Correct</button><div id="colonyCorrection" hidden><p>Optional feedback for this decision only. The signed decision stays unchanged. Feedback is not brain training.</p><label>Your correction <select id="colonyCorrectionAction"><option>LONG</option><option>SHORT</option><option>HOLD</option><option>CLOSE</option></select></label><button id="colonyCorrectionSave">Save correction</button><button id="colonyCorrectionCancel">Cancel</button></div><p id="colonyCorrectionStatus" role="status"></p><details><summary>Technical details</summary><p>Owner-signed report; not remote inference attestation.</p><pre id="colonyResult" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details>`;
 const $=s=>root.querySelector(s);
 let running=false, busy=false, timer=null, generation=0, failures=0, enrolled=false, disposed=false, last=null, correction=null, correcting=false;
 const status=text=>{$('#colonyStatus').textContent=text;};
 const details=value=>{$('#colonyResult').textContent=JSON.stringify(value,null,2);};
 function controls(){ $('#colonyStart').disabled=running||busy||disposed; $('#colonyPause').disabled=!running; }
 function pause(message='Paused') {running=false;generation++;clearTimeout(timer);timer=null;onRunning(false);status(message);controls();}
 function schedule(delay=pollMs){clearTimeout(timer);timer=null;if(running&&!document.hidden&&!disposed)timer=setTimeout(tick,Math.max(1000,Math.min(60000,delay)));}
 async function tick(){
  timer=null;
  if(!running||busy||document.hidden||disposed)return;
  busy=true;const epoch=generation;const active=()=>running&&epoch===generation&&!document.hidden&&!disposed;
  controls();
  try {
   status('Waiting');
   const assignment=await client.claim();if(!active())return;
   if(assignment.task){
    status('Thinking');
    const result=assignment.my_vote || await client.vote(assignment.task.task_id,{isActive:active});
    if(!active())return;
    last=Object.freeze({...result,task_id:assignment.task.task_id});
    $('#colonyDecision').textContent=`Your fly: ${label(last.action)}`;
    $('#colonyCorrect').disabled=!last.vote_id;
    details(last);status('Submitted');
    await client.acknowledgeVote?.(last.task_id);if(!active())return;
   }
   failures=0;schedule(assignment.retry_after_ms||pollMs);
  } catch(error) {
   if(active()){
    details({error:error.message});failures++;
    if([401,403].includes(error.status)){pause('Paused — please restore your session and try again.');}
    else {status('Waiting — could not complete this task. Retrying shortly.');schedule(pollMs*2**Math.min(failures,3));}
   }
  } finally {busy=false;controls();if(timer===null)schedule();}
 }
 $('#colonyStart').onclick=async()=>{
  if(busy||running||disposed)return;
  if(!enrolled&&!$('#colonyConsent').checked){status('Please agree to public participation before starting.');return;}
  busy=true;controls();const epoch=++generation;
  try {
   await beforeStart();if(epoch!==generation||disposed)return;running=true;onRunning(true);controls();status('Thinking');
   if(!enrolled){await client.enroll({consent:true});enrolled=true;$('#colonyConsentLabel').hidden=true;}
   if(epoch!==generation||disposed)return;
   failures=0;status('Waiting');
  }catch(error){details({error:error.message});pause('Paused — unable to start. Please try again.');}
  finally{busy=false;controls();}
  if(running)await tick();
 };
 $('#colonyPause').onclick=()=>pause();
 $('#colonyCorrect').onclick=()=>{if(!last||correcting)return;correction={task_id:last.task_id,vote_id:last.vote_id,correction_id:crypto.randomUUID()};$('#colonyCorrection').hidden=false;$('#colonyCorrectionStatus').textContent='';};
 $('#colonyCorrectionCancel').onclick=()=>{if(!correcting){correction=null;$('#colonyCorrection').hidden=true;}};
 $('#colonyCorrectionSave').onclick=async()=>{
  if(!correction||correcting)return;correcting=true;$('#colonyCorrectionSave').disabled=true;
  // Freeze the payload for safe retries after an ambiguous network failure.
  correction.action ||= action($('#colonyCorrectionAction').value);
  try{await client.correct({...correction});$('#colonyCorrectionStatus').textContent='Correction saved separately. Your fly’s signed decision is unchanged; no training was performed.';$('#colonyCorrection').hidden=true;correction=null;}
  catch(error){$('#colonyCorrectionStatus').textContent='Correction not confirmed. Retry to safely check the same feedback.';details({error:error.message});}
  finally{correcting=false;$('#colonyCorrectionSave').disabled=false;}
 };
 const visibility=()=>{clearTimeout(timer);timer=null;if(document.hidden&&running){generation++;status('Waiting — paused while this tab is hidden.');}else if(running)schedule(1000);};
 document.addEventListener('visibilitychange',visibility);
 try{const saved=await client.saved();enrolled=saved.auto_consent===true;$('#colonyConsentLabel').hidden=enrolled;}catch{status('Paused — unable to restore preferences.');}
 return {pause,get running(){return running;},dispose(){pause();disposed=true;document.removeEventListener('visibilitychange',visibility);controls();}};
}
