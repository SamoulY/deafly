import * as THREE from './vendor-three.js';
import {memeItems} from './meme-items.js?v=1';
import {drawMemeArt} from './meme-art.js?v=1';
export function memeCanvas(id,background=false){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
 if(background){ctx.fillStyle=memeItems[id].color;ctx.fillRect(0,0,256,256);}
 drawMemeArt(ctx,id,0,0,256);return canvas;
}
export function buildMemeRoom(group,loadout){
 const wall=memeItems[loadout?.background];
 if(wall){const texture=new THREE.CanvasTexture(memeCanvas(wall.id,true));texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.18,1.18),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.position.set(2.37,.35,2.15);mesh.rotation.y=-Math.PI/2;mesh.name=wall.id;group.add(mesh);}
 const item=memeItems[loadout?.desk];if(!item)return;
 const mount=new THREE.Group();mount.name=item.id;mount.position.set(.5,-1.7,1.85);group.add(mount);
 const mat=color=>new THREE.MeshStandardMaterial({color,roughness:.8});const c=mat(item.color),h=mat(item.accent),ink=mat('#283d38');
 const add=(geo,m,x,y,z)=>{const object=new THREE.Mesh(geo,m);object.position.set(x,y,z);mount.add(object);return object;};
 const ball=(x,y,z,sx,sy,sz,m=c)=>{const o=add(new THREE.IcosahedronGeometry(1,1),m,x,y,z);o.scale.set(sx,sy,sz);return o;};
 const box=(x,y,z,w,height,d,m=c)=>add(new THREE.BoxGeometry(w,height,d),m,x,y,z);
 switch(item.shape){
 case 'capy':ball(0,.22,0,.3,.23,.37);ball(-.1,.48,.07,.25,.21,.22);for(const z of[-.09,.21]){ball(-.13,.65,z,.065,.065,.055,h);ball(-.3,.51,z,.025,.025,.025,ink);}ball(-.32,.42,.06,.09,.08,.16,h);break;
 case 'cat':ball(0,.2,0,.22,.22,.25);ball(0,.49,0,.25,.2,.23);for(const z of[-.17,.17]){add(new THREE.ConeGeometry(.11,.2,3),c,0,.69,z);ball(-.22,.52,z*.7,.025,.035,.035,ink);}box(-.22,.04,0,.26,.08,.62,h);for(let i=0;i<6;i++)box(-.27,.087,-.25+i*.1,.12,.014,.045,ink);break;
 case 'banana':{const banana=add(new THREE.TorusGeometry(.25,.085,6,12,Math.PI*1.35),c,0,.12,0);banana.rotation.x=Math.PI/2;box(.25,.13,0,.09,.08,.08,ink);break;}
 case 'rock':ball(0,.22,0,.32,.26,.26);for(const z of[-.09,.09])ball(-.28,.29,z,.03,.03,.028,ink);break;
 case 'mug':add(new THREE.CylinderGeometry(.22,.19,.36,12),c,0,.18,0);add(new THREE.CylinderGeometry(.19,.19,.01,12),ink,0,.363,0);add(new THREE.TorusGeometry(.15,.045,6,12),h,0,.20,.25);for(let i=0;i<2;i++){const steam=add(new THREE.TorusGeometry(.09,.012,4,8,Math.PI),h,0,.51+i*.18,i*.06);steam.rotation.y=Math.PI/2;}break;
 case 'noodles':add(new THREE.CylinderGeometry(.25,.19,.40,10),c,0,.2,0);add(new THREE.CylinderGeometry(.23,.23,.015,12),h,0,.406,0);for(const z of[-.06,.06]){const stick=add(new THREE.CylinderGeometry(.015,.015,.65,5),ink,.14,.57,z);stick.rotation.z=-.45;}break;
 case 'duck':ball(0,.22,0,.32,.23,.29);ball(-.16,.49,0,.19,.2,.19);ball(-.34,.46,0,.14,.05,.1,h);for(const z of[-.14,.14])ball(-.25,.54,z,.025,.025,.02,ink);break;
 case 'tank':box(0,.24,0,.5,.46,.6);box(-.256,.26,0,.012,.34,.48,h);ball(-.27,.25,0,.025,.06,.13,c);for(let i=0;i<3;i++)ball(-.27,.35+i*.065,.14,.012,.025,.025,h);box(0,.48,0,.53,.045,.63,ink);break;
 }
 // Face the workstation viewer; this label matches the card's distinctive art.
 const texture=new THREE.CanvasTexture(memeCanvas(item.id));const plaque=new THREE.Mesh(new THREE.PlaneGeometry(.27,.27),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));plaque.position.set(-.36,.12,.3);plaque.rotation.y=-Math.PI/2;mount.add(plaque);
 const used=new Set();mount.traverse(o=>{if(o.material)used.add(o.material);});for(const m of[c,h,ink])if(!used.has(m))m.dispose();
}
