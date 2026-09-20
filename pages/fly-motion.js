import * as THREE from './vendor-three.js';
export const ACTION_KEYS = ['BUY','SELL','HOLD','CLOSE'];
export function createMotion(fly,keys,canvas){
 const legs=fly.children.filter(o=>o.userData.part==='leg');
 const antenna=fly.children.filter(o=>o.userData.part==='antenna');
 const wings=fly.children.filter(o=>o.userData.part==='wing');
 const rest=legs.map(l=>l.children.map(b=>({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()})));
 const seen=new Set();let active=null;const queue=[];
 function bone(mesh,a,b){const delta=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());mesh.scale.y=delta.length()/mesh.geometry.parameters.height;}
 function restore(){legs.forEach((l,i)=>l.children.forEach((b,j)=>{b.position.copy(rest[i][j].p);b.quaternion.copy(rest[i][j].q);b.scale.copy(rest[i][j].s);}));keys.forEach(k=>{k.position.y=k.userData.restY;k.material.emissive.setHex(0);});}
 return {playAction(action,id){if(!ACTION_KEYS.includes(action)||!id||seen.has(id))return false;seen.add(id);if(seen.size>256)seen.delete(seen.values().next().value);queue.push({action,id});return true;},update(t){
 restore();antenna.forEach((a,i)=>a.rotation.z=Math.sin(t*.002+i)*.07);wings.forEach((w,i)=>w.rotation.x=Math.PI/2+Math.sin(t*.0017+i*.4)*.024);
 const thorax=fly.children.find(o=>o.name==='thorax');thorax.scale.y=.57*(1+Math.sin(t*.002)*.018);
 if(!active&&queue.length){active={...queue.shift(),start:t};canvas.dataset.action=active.action;canvas.dataset.actionEvent=active.id;}
 if(!active)return;
 const u=(t-active.start)/950;if(u>=1){active=null;canvas.dataset.motionPhase='idle';return;}
 const key=keys[ACTION_KEYS.indexOf(active.action)];const reach=u<.35?u/.35:u<.65?1:(1-u)/.35;
 key.position.y=key.userData.restY-(u>.35&&u<.65?.055:0);key.material.emissive.setHex(0x303030);
 const side=key.position.z<.2?1:-1;const index=legs.findIndex(l=>l.name===`leg-${side}-0`);const leg=legs[index];
 fly.updateWorldMatrix(true,false);key.updateWorldMatrix(true,false);
 const target=fly.worldToLocal(key.localToWorld(new THREE.Vector3(0,.045,0)));
 const foot=new THREE.Vector3(...leg.userData.contact).lerp(target,Math.max(0,reach));foot.y+=Math.sin(Math.PI*Math.max(0,reach))*.15;
 const hip=new THREE.Vector3(side*.42,-.17,.46);const knee=hip.clone().lerp(foot,.5);knee.y+=.35;
 const ankle=foot.clone().add(new THREE.Vector3(0,.055,-.08));bone(leg.children[0],hip,knee);bone(leg.children[1],knee,ankle);bone(leg.children[2],ankle,foot);
 canvas.dataset.motionPhase=u<.35?'reach':u<.65?'press':'release';
 }};
}
