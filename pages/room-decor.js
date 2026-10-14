import * as THREE from './vendor-three.js';
import {memeItems} from './meme-items.js?v=1';
import {drawMemeArt} from './meme-art.js?v=1';
import {memeCanvas,buildMemeRoom} from './meme-room.js?v=1';
export const wallColors={'background-mint':'#244e43','background-rose':'#60434b','background-graphite':'#303b4a'};
for(const i of Object.values(memeItems))if(i.slot==='background')wallColors[i.id]=i.color;
export function clearDecor(group){group.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});group.clear();}
export function stickerCanvas(id){if(memeItems[id])return memeCanvas(id);const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');x.fillStyle='#f5de93';x.beginPath();x.arc(48,48,40,0,Math.PI*2);x.fill();x.fillStyle='#304838';x.font='bold 60px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(id==='sticker-bitcoin'?'₿':id==='sticker-moon'?'☾':'★',48,51);return c;}
export function buildRoomDecor(group,loadout){
  clearDecor(group);
  buildMemeRoom(group,loadout);
  const add=(geometry,color,x,y,z)=>{const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.7}));mesh.position.set(x,y,z);group.add(mesh);return mesh;};
  if(loadout?.background)add(new THREE.BoxGeometry(.12,4.6,7),wallColors[loadout.background]||'#303b4a',2.45,.1,-.65).name='room-wall';
  if(loadout?.sticker){const texture=new THREE.CanvasTexture(stickerCanvas(loadout.sticker));const sticker=new THREE.Mesh(new THREE.PlaneGeometry(.45,.45),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));sticker.position.set(1.86,.94,1.27);sticker.rotation.y=-Math.PI/2;sticker.name=loadout.sticker;group.add(sticker);}
  if(loadout?.desk==='desk-plant'){add(new THREE.CylinderGeometry(.25,.19,.42,10),'#cc977d',.5,-1.52,1.85);for(let i=0;i<5;i++){const leaf=add(new THREE.SphereGeometry(.22,8,6),'#64a576',.5+Math.sin(i*2)*.15,-1.13+i*.04,1.85+Math.cos(i*2)*.12);leaf.scale.set(.6,1.4,.45);leaf.rotation.z=Math.sin(i)*.6;}}
  if(loadout?.desk==='desk-coffee'){add(new THREE.CylinderGeometry(.22,.19,.35,12),'#e8debf',.5,-1.54,1.85);const coffee=add(new THREE.CylinderGeometry(.19,.19,.01,12),'#443023',.5,-1.36,1.85);coffee.name='coffee';const handle=add(new THREE.TorusGeometry(.15,.045,6,12),'#e8debf',.78,-1.5,1.85);handle.rotation.y=Math.PI/2;}
  if(loadout?.desk==='desk-lamp'){add(new THREE.CylinderGeometry(.3,.3,.06,12),'#d7bd80',.5,-1.70,1.85);add(new THREE.CylinderGeometry(.045,.045,.72,8),'#a18f63',.5,-1.31,1.85);add(new THREE.ConeGeometry(.38,.35,12,1,true),'#e5c786',.5,-.9,1.85);add(new THREE.SphereGeometry(.1,8,6),'#fff1bd',.5,-1.02,1.85);}
}
// A visual room overlay only. The model's market encoder receives its original data.
export function drawVisionRoom(canvas,loadout,drawMarket){
  const chart=document.createElement('canvas');drawMarket(chart);
  const x=canvas.getContext('2d');canvas.width=640;canvas.height=360;
  x.fillStyle=wallColors[loadout?.background]||'#131e25';x.fillRect(0,0,640,360);
  if(memeItems[loadout?.background])drawMemeArt(x,loadout.background,0,0,360);
  x.fillStyle='#26312e';x.fillRect(0,300,640,60);x.drawImage(chart,50,24,500,280);
  if(loadout?.sticker)x.drawImage(stickerCanvas(loadout.sticker),500,30,40,40);
  if(loadout?.desk){x.save();x.translate(590,284);if(memeItems[loadout.desk]){drawMemeArt(x,loadout.desk,-30,-38,64);}else if(loadout.desk==='desk-plant'){x.fillStyle='#c9977d';x.fillRect(-15,0,30,28);x.fillStyle='#6fa977';for(let i=0;i<4;i++){x.beginPath();x.ellipse(Math.sin(i*2)*12,-15+i*3,8,23,Math.sin(i),0,Math.PI*2);x.fill();}}else if(loadout.desk==='desk-coffee'){x.fillStyle='#e8debf';x.fillRect(-15,2,30,27);x.strokeStyle='#e8debf';x.lineWidth=5;x.strokeRect(15,6,9,14);x.fillStyle='#493326';x.fillRect(-12,3,24,5);}else{x.fillStyle='#d7bd80';x.fillRect(-2,-26,4,52);x.beginPath();x.moveTo(-25,-24);x.lineTo(0,-52);x.lineTo(25,-24);x.fill();x.fillRect(-20,23,40,5);}x.restore();}
  // The side mirror shows the fly's clothes, which cannot otherwise be seen from its eyes.
  x.fillStyle='#9aa8a3';x.fillRect(5,120,47,102);x.fillStyle='#31433c';x.fillRect(8,123,41,96);x.fillStyle='#ad9166';x.beginPath();x.ellipse(29,183,12,22,0,0,Math.PI*2);x.fill();x.fillStyle='#bbafa2';x.beginPath();x.arc(29,155,13,0,Math.PI*2);x.fill();x.fillStyle='#ab3e40';x.fillRect(17,150,8,10);x.fillRect(34,150,8,10);
  if(memeItems[loadout?.head])drawMemeArt(x,loadout.head,12,122,34);
  else if(loadout?.head){x.fillStyle=loadout.head==='head-crown'?'#ecd28e':'#588da6';x.fillRect(16,138,26,9);if(loadout.head==='head-crown'){for(let i=0;i<3;i++)x.fillRect(17+i*10,132,5,10);}else if(loadout.head==='head-beanie'){x.beginPath();x.arc(29,138,12,Math.PI,Math.PI*2);x.fill();}else x.fillRect(29,145,17,3);}
  if(memeItems[loadout?.face])drawMemeArt(x,loadout.face,12,138,34);
  else if(loadout?.face){x.strokeStyle=loadout.face==='face-monocle'?'#e5c786':'#99d4da';x.lineWidth=2;x.strokeRect(16,148,12,12);if(loadout.face!=='face-monocle')x.strokeRect(30,148,12,12);}
  if(memeItems[loadout?.body])drawMemeArt(x,loadout.body,13,162,32);
  else if(loadout?.body){x.fillStyle=loadout.body==='body-vest'?'#467084':'#e5c786';if(loadout.body==='body-vest')x.fillRect(18,173,22,17);else if(loadout.body==='body-tie')x.fillRect(27,171,5,21);else{x.fillRect(20,171,18,6);}}
}
