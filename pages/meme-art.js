import {memeItems} from './meme-items.js?v=1';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The same vector primitives power cards, room textures and the fly-view mirror.
export function artShapes(item){
 const a=[],ink='#263d39',c=item.color,h=item.accent;
 const path=(d,fill=c,stroke=ink)=>a.push({kind:'path',d,fill,stroke});
 const rect=(x,y,w,height,fill=c)=>a.push({kind:'rect',x,y,w,h:height,fill,stroke:ink});
 const oval=(x,y,rx,ry,fill=c)=>a.push({kind:'ellipse',x,y,rx,ry,fill,stroke:ink});
 const text=(value,x=32,y=54,size=8,fill=ink)=>a.push({kind:'text',value,x,y,size,fill});
 const eye=(x,y)=>oval(x,y,1.2,1.5,ink);
 switch(item.shape){
 case 'horns':path('M20 40C5 35 4 13 10 9c0 16 8 15 15 17h14c7-2 15-1 15-17 6 4 5 26-10 31Z');rect(20,36,24,10,h);break;
 case 'foil':path('M10 47 19 25 30 8 43 32 55 47Z');path('M30 8 27 35 10 47M27 35 43 32 55 47','none',h);break;
 case 'helmet':oval(32,30,23,24);rect(10,25,7,14,h);rect(47,25,7,14,h);oval(32,29,15,16,'#35545f');path('M23 21 30 16 37 16','none',h);rect(20,48,24,6,h);break;
 case 'diamond':path('M9 23 20 10h24l11 13-23 29Z');path('M9 23h46M20 10l-1 13 13 29 13-29-1-13M19 23 32 10l13 13','none',h);break;
 case 'capy':oval(32,35,23,16);oval(19,19,6,7);oval(42,19,6,7);oval(32,31,21,16);oval(32,38,14,7,h);eye(23,30);eye(41,30);path('M29 38h6M32 39v3','none');if(item.slot==='head')path('M7 47h50l-6 7H13Z',h);break;
 case 'halo':oval(32,24,24,10,h);oval(32,24,15,5,'#f2eddf');path('M32 38v8M12 8l3 6M52 8l-3 6M7 34l5-2M57 34l-5-2','none');break;
 case 'mushroom':path('M25 30h14l5 26H20Z',h);path('M6 34C7 1 57 1 58 34Z');oval(23,20,4,4,h);oval(40,24,5,4,h);oval(32,11,3,3,h);break;
 case 'party':path('M12 50 32 7l20 43Z');path('m20 33 21-5M15 45l31-6','none',h);oval(32,9,4,4,h);text('6 7',32,43,12);break;
 case 'pixels':path('M5 24h54v7h-5v10H36V31h-8v10H10V31H5Z');path('m12 26 10 9M17 26l8 7M38 26l10 9M43 26l8 7','none',h);break;
 case 'laser':oval(19,30,11,9);oval(45,30,11,9);path('M3 28h58M3 33h58','none',h);oval(19,30,4,4,h);oval(45,30,4,4,h);break;
 case 'sleep':path('M5 23q27-10 54 0v15q-9 14-21-1H26Q14 52 5 38Z');path('m13 30 4 4 5-4m20 0 4 4 5-4','none',h);text('Zzz',46,16,10);break;
 case 'wow':case 'tears':oval(19,28,12,13,h);oval(45,28,12,13,h);oval(19,28,4,6,ink);oval(45,28,4,6,ink);if(item.shape==='tears'){path('M10 40q-9 13 0 13t0-13Z');path('M54 40q-9 13 0 13t0-13Z');}else oval(32,49,6,7);break;
 case 'spiral':for(const x of [18,46]){oval(x,30,13,14,h);path(`M${x-8} 32q-4-14 8-13t7 19q-13 9-15-4t11-5q2 9-6 7`,'none');}break;
 case 'visor':path('M5 23h54v18q-26 16-54 0Z');path('M12 29h9m4 0h4m5 0h4m5 0h9M12 35h17m5 0h18','none',h);break;
 case 'moustache':path('M32 32C14 13 14 48 5 32c-3 23 24 21 27 9 3 12 30 14 27-9-9 16-9-19-27 0Z');break;
 case 'bib':path('M20 12q12 13 24 0l6 16-6 25H20l-6-25Z');path('m25 30 7-5 7 5-7 14Z',h);break;
 case 'hoodie':case 'sweater':case 'vest':path('M20 13 9 23l7 13 4-3v22h24V33l4 3 7-13-11-10-12 9Z');if(item.shape==='hoodie')path('M21 13q11-18 22 0L32 25Z',h);else if(item.shape==='vest')path('M32 22v33','none',h);else path('M20 30h24M20 37h24M20 44h24','none',h);text(item.tag,32,46,7);break;
 case 'cape':case 'poncho':path('M24 12h16l16 43-24-7L8 55Z');path('M24 12q8 10 16 0','none',h);text(item.tag,32,39,9,h);break;
 case 'badge':path('M22 7v12l10 7 10-7V7','none');rect(17,24,30,32);oval(26,34,4,4,h);path('M34 32h8m-8 5h8M22 45h20','none',h);text('AFK',32,54,7);break;
 case 'scarf':path('M12 18q20-10 40 0l-4 13-12-2 4 26-12 2-5-29-11 2Z');path('m15 20 31 7M27 37l9-2M28 46l10-2','none',h);break;
 case 'stars':case 'chart':case 'flames':case 'grass':case 'liminal':case 'sunset':case 'pond':case 'code':
  rect(5,7,54,48);
  if(item.shape==='stars'){oval(42,21,9,9,h);for(const [x,y]of [[13,17],[22,28],[16,45],[43,43],[51,34]])path(`M${x-2} ${y}h4m-2-2v4`,'none',h);}
  if(item.shape==='chart'){path('M12 15v31h40M13 40l11-8 8 5 17-21m-9 0h10v10','none',h);}
  if(item.shape==='flames'){for(let i=0;i<4;i++)path(`M${9+i*12} 49q-6-10 1-20 7 9 8-4 10 20-1 24Z`,h);}
  if(item.shape==='grass'){oval(43,19,7,7,h);path('M6 46q17-20 28-4t24-3v15H6Z',h);path('m13 40 2 8 3-9m22 1 2 7 3-10','none');}
  if(item.shape==='liminal'){rect(22,16,20,31,h);rect(27,23,10,24);path('M6 8 22 16M59 8 42 16M6 54l16-7m37 7-17-7','none',h);}
  if(item.shape==='sunset'){oval(32,28,16,16,h);for(let y=29;y<51;y+=6)path(`M8 ${y}h48`,'none');path('M5 55 27 39m32 16L37 39','none',h);}
  if(item.shape==='pond'){oval(32,40,22,9,h);path('M23 13q-5 6 0 10m10-13q-5 6 0 10m9-7q-5 6 0 10','none',h);oval(32,36,9,6);eye(29,35);eye(35,35);}
  if(item.shape==='code'){for(let y=18;y<49;y+=8)path(`M12 ${y}h${y%3===0?26:13}m5 0h8`,'none',h);}
  break;
 case 'note':rect(10,10,44,44);path('M44 54V43h10Z',h);text(item.tag,32,35,11);break;
 case 'peak':path('M7 48 27 11l13 20 17 17Z');path('m18 27 9-16 9 14-8-3Z',h);path('M30 11V6h17l-8 7h-9',h);text('OOPS',34,45,9,h);break;
 case 'numbers':text('6',21,42,36);text('7',44,42,36,h);break;
 case 'spark':path('m32 7 6 17 18 8-18 7-6 18-7-18-17-7 17-8Z');text('+999',32,36,10,h);break;
 case 'fish':oval(29,32,20,13);path('M47 32 59 20v24Z',h);eye(17,29);path('m27 21 7 10-7 12','none',h);break;
 case 'heart':path('M32 53 9 30C-1 7 28 5 32 19 36 5 65 7 55 30Z');path('M20 29h7l3-6 4 15 4-9h8','none',h);break;
 case 'cat':path('M14 35V9l13 9h10L50 9v26q-3 17-18 17T14 35Z');eye(24,30);eye(40,30);path('m29 35 3 3 3-3M6 31l14 4M6 40l14-2m24-3 14-4m-14 7 14 2','none');rect(8,47,48,10,h);for(let x=15;x<55;x+=7)path(`M${x} 48v8`,'none');break;
 case 'banana':path('M13 8C4 41 37 66 55 37 35 45 18 33 19 9Z');path('M16 13q-1 32 31 33','none',h);rect(12,5,8,6,ink);break;
 case 'rock':path('M9 44 16 20 39 11 56 30 49 52 22 54Z');path('m16 20 13 15 10-24m-10 24 20 17','none',h);eye(31,36);eye(43,33);path('m34 43 9-2','none');break;
 case 'mug':rect(10,26,32,28,h);oval(45,37,11,10);oval(45,37,6,5,h);rect(10,26,32,28,h);path('m18 21-3-8 7-8m10 15-3-6 5-7','none');text('FINE',26,45,9);break;
 case 'noodles':path('M12 23h40l-5 32H17Z');oval(32,23,20,5,h);path('M19 22q0-12 5-3t7 0 7 0 6 0M41 5 31 29m20-22-14 23','none',h);text('BRB',32,43,10,h);break;
 case 'duck':oval(31,41,23,15);oval(39,23,12,13);path('m48 23 13 5-14 5Z',h);eye(42,21);path('M16 40q11 12 23 1','none',h);break;
 case 'tank':rect(8,15,48,39);rect(8,12,48,5,ink);rect(9,25,46,28,h);oval(29,36,11,6);path('m39 36 9-7v14Z');eye(24,35);oval(46,23,2,2,h);oval(40,19,2,2,h);break;
 default:throw Error('Unknown shop art '+item.shape);
 }
 return a;
}
export function memeArt(id){
 const item=memeItems[id];if(!item)return null;
 const shapes=artShapes(item).map(p=>{const style=`fill="${p.fill||'none'}" stroke="${p.stroke||'none'}"`;if(p.kind==='path')return `<path d="${p.d}" ${style}/>`;if(p.kind==='rect')return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="2" ${style}/>`;if(p.kind==='ellipse')return `<ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx}" ry="${p.ry}" ${style}/>`;return `<text x="${p.x}" y="${p.y}" fill="${p.fill}" stroke="none" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="${p.size}">${escape(p.value)}</text>`;}).join('');
 return `<svg viewBox="0 0 64 64" aria-hidden="true" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`;
}
export function drawMemeArt(ctx,id,x=0,y=0,size=64){
 const item=memeItems[id];if(!item)return;
 ctx.save();ctx.translate(x,y);ctx.scale(size/64,size/64);ctx.lineWidth=1.6;ctx.lineJoin='round';ctx.lineCap='round';
 for(const p of artShapes(item)){
  if(p.kind==='text'){ctx.fillStyle=p.fill;ctx.font=`bold ${p.size}px sans-serif`;ctx.textAlign='center';ctx.fillText(p.value,p.x,p.y);continue;}
  const path=new Path2D();if(p.kind==='path')path.addPath(new Path2D(p.d));else if(p.kind==='rect')path.rect(p.x,p.y,p.w,p.h);else path.ellipse(p.x,p.y,p.rx,p.ry,0,0,Math.PI*2);
  if(p.fill&&p.fill!=='none'){ctx.fillStyle=p.fill;ctx.fill(path);}if(p.stroke&&p.stroke!=='none'){ctx.strokeStyle=p.stroke;ctx.stroke(path);}
 }
 ctx.restore();
}
