import * as THREE from './vendor-three.js';
import {memeItems} from './meme-items.js?v=1';
export function buildMemeAccessory(group,id){
 const item=memeItems[id];if(!item)return false;
 const material=color=>new THREE.MeshStandardMaterial({color,roughness:.7,flatShading:true});
 const c=material(item.color),h=material(item.accent),ink=material('#263d39');
 const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);group.add(m);return m;};
 const ball=(x,y,z,sx,sy,sz,mat=c)=>{const m=add(new THREE.IcosahedronGeometry(1,1),mat,x,y,z);m.scale.set(sx,sy,sz);return m;};
 const box=(x,y,z,w,height,d,mat=c)=>add(new THREE.BoxGeometry(w,height,d),mat,x,y,z);
 const cone=(x,y,z,r,height,mat=c,n=8)=>add(new THREE.ConeGeometry(r,height,n),mat,x,y,z);
 if(item.slot==='head'){
  switch(item.shape){
   case 'horns':ball(0,.52,.94,.44,.10,.36);for(const side of[-1,1]){const horn=cone(side*.43,.78,.94,.14,.62,h);horn.rotation.z=-side*.5;}break;
   case 'foil':cone(0,.76,.94,.54,.62,c,5);cone(.1,1.03,.94,.1,.28,h,4);break;
   case 'helmet':ball(0,.54,.94,.55,.35,.51);ball(0,.56,1.3,.39,.19,.15,ink);for(const side of[-1,1])box(side*.53,.51,.96,.13,.24,.25,h);break;
   case 'diamond':add(new THREE.CylinderGeometry(.36,.41,.14,8),h,0,.53,.94);add(new THREE.OctahedronGeometry(.3),c,0,.84,1.02);break;
   case 'capy':ball(0,.64,.94,.51,.25,.43);for(const side of[-1,1]){ball(side*.34,.85,.98,.12,.12,.1,h);ball(side*.19,.7,1.34,.035,.04,.02,ink);}ball(0,.59,1.34,.22,.1,.08,h);break;
   case 'halo':{const ring=add(new THREE.TorusGeometry(.49,.045,5,20),h,0,.93,.94);ring.rotation.x=Math.PI/2;for(const side of[-1,1])add(new THREE.OctahedronGeometry(.08),c,side*.57,.94,.94);break;}
   case 'mushroom':add(new THREE.CylinderGeometry(.19,.23,.25,8),h,0,.62,.94);ball(0,.84,.94,.63,.24,.54);for(let i=0;i<5;i++)ball(Math.cos(i*2)*.38,.99,.94+Math.sin(i*2)*.28,.08,.025,.07,h);break;
   case 'party':cone(0,.83,.94,.4,.8);ball(0,1.25,.94,.075,.075,.075,h);for(let i=0;i<3;i++)ball(.02,.58+i*.19,1.25-i*.08,.08,.05,.035,h);break;
  }
 }else if(item.slot==='face'){
  if(item.shape==='moustache'){for(const side of[-1,1]){ball(side*.2,-.08,1.51,.26,.08,.07);ball(side*.4,-.01,1.49,.1,.09,.06);}h.dispose();ink.dispose();return true;}
  for(const side of[-1,1]){
   const x=side*.35;
   if(item.shape==='pixels'){box(x,.19,1.48,.52,.26,.09,ink);for(let i=0;i<3;i++)box(x-.15+i*.1,.27-i*.055,1.535,.08,.06,.02,h);}
   else if(item.shape==='laser'){ball(x,.18,1.46,.29,.25,.10,ink);const beam=add(new THREE.CylinderGeometry(.027,.04,.48,6),c,x,.18,1.72);beam.rotation.x=Math.PI/2;ball(x,.18,1.49,.10,.10,.04,h);}
   else if(item.shape==='sleep'){ball(x,.20,1.47,.32,.23,.07);box(x,.20,1.55,.22,.025,.02,h);}
   else if(item.shape==='wow'||item.shape==='tears'){ball(x,.2,1.48,.30,.30,.06,h);ball(x,.2,1.55,.10,.15,.02,ink);if(item.shape==='tears')ball(x+side*.13,-.15,1.49,.07,.19,.035);}
   else if(item.shape==='spiral'){for(const r of[.1,.2,.28])add(new THREE.TorusGeometry(r,.022,4,14),r===.2?h:c,x,.2,1.49);}
   else {box(x,.2,1.48,.55,.3,.08);for(let i=0;i<3;i++)box(x-.18+i*.16,.24,1.53,.08,.05,.015,h);}
  }
  box(0,.23,1.47,.17,.045,.05,ink);
 }else if(item.slot==='body'){
  if(['cape','poncho'].includes(item.shape)){const cape=cone(0,.06,-.51,.69,1.08,c,4);cape.rotation.x=Math.PI/2;box(0,.16,.86,.18,.12,.06,h);}
  else if(item.shape==='scarf'){const ring=add(new THREE.TorusGeometry(.3,.07,5,12),c,0,-.13,1.03);ring.rotation.x=Math.PI/2;box(.17,-.45,1.12,.13,.52,.07,h);}
  else if(item.shape==='badge'){box(0,-.4,1.27,.32,.42,.06);box(0,-.14,1.21,.025,.24,.025,ink);box(0,-.35,1.31,.23,.045,.01,h);}
  else if(item.shape==='bib'){ball(0,-.3,1.12,.28,.3,.08);add(new THREE.OctahedronGeometry(.14),h,0,-.28,1.24);}
  else {for(const side of[-1,1])ball(side*.5,-.02,.16,.18,.38,.5);if(item.shape==='hoodie')ball(0,.45,.53,.47,.19,.24,h);if(item.shape==='sweater')for(let i=0;i<3;i++)box(0,-.13+i*.13,.84,.42,.035,.04,h);else for(let i=0;i<3;i++)ball(0,-.13+i*.15,.82,.035,.035,.03,h);}
 }
 const used=new Set();group.traverse(o=>{if(o.material)used.add(o.material);});for(const m of[c,h,ink])if(!used.has(m))m.dispose();
 return true;
}
