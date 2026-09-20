const clamp=n=>Math.max(0,Math.min(1,n));
const avg=a=>a.reduce((x,y)=>x+y,0)/Math.max(a.length,1);
export function buildFlyVision(series,width=320,height=180){
 const s=series.length?series:[0];const lo=Math.min(...s),hi=Math.max(...s),span=hi-lo||1;
 const norm=s.map(v=>(v-lo)/span);
 const sample=(count,phase)=>Array.from({length:count},(_,i)=>{const u=(i+.5)/count;const x=u*(s.length-1);const a=norm[Math.floor(x)]||0,b=norm[Math.min(norm.length-1,Math.ceil(x))]||a;const value=a+(b-a)*(x%1);return clamp(.18+.68*value+.1*Math.sin(i*.071+phase));});
 return {width,height,leftEye:sample(3335,0),rightEye:sample(3335,.8),r8:sample(811,1.7),normalized:norm};
}
function hashNoise(i,t){const x=Math.sin(i*12.9898+t*78.233)*43758.5453;return x-Math.floor(x)}
export function buildBrainActivity({trend=0,volatility=0,action='HOLD',tick=0}={}){
 const regions=[{id:'visual',label:'视觉通路',start:0,end:54,color:'#63d6ff'},{id:'memory',label:'蘑菇体 / 记忆',start:54,end:112,color:'#9a8cff'},{id:'dopamine',label:'多巴胺调制',start:112,end:132,color:'#ffc85f'},{id:'descending',label:'下行决策',start:132,end:166,color:'#6ee7a8'}];
 const actionBias=action==='BUY'?.13:action==='SELL'?.08:0;
 const nodes=Array.from({length:166},(_,i)=>{const region=regions.find(r=>i>=r.start&&i<r.end);let base=.12+hashNoise(i,tick)*.18;if(region.id==='visual')base+=Math.min(.45,Math.abs(trend)*14+volatility*3);if(region.id==='memory')base+=Math.min(.3,Math.abs(trend)*8);if(region.id==='dopamine')base+=actionBias;if(region.id==='descending')base+=Math.min(.4,Math.abs(trend)*18);return {id:i,x:hashNoise(i,4)*.9+.05,y:hashNoise(i,9)*.82+.09,activity:clamp(base),region:region.id,color:region.color}});
 const leftHz=Math.max(0,7-trend*160+hashNoise(3,tick)*2),rightHz=Math.max(0,7+trend*160+hashNoise(7,tick)*2);
 return {nodes,regions,decoder:{leftHz:+leftHz.toFixed(1),rightHz:+rightHz.toFixed(1),differenceHz:+(rightHz-leftHz).toFixed(1)},totalSpikes:Math.round(nodes.reduce((a,n)=>a+n.activity,0)*31),simulatedMs:tick*500};
}
export function renderFlyVision(canvas,vision){const x=canvas.getContext('2d'),w=canvas.width,h=canvas.height;x.fillStyle='#e8ebee';x.fillRect(0,0,w,h);x.strokeStyle='#242730';x.lineWidth=2;x.beginPath();vision.normalized.forEach((v,i)=>{const px=20+i*(w-40)/Math.max(1,vision.normalized.length-1),py=h-25-v*(h-50);i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke();x.save();x.globalCompositeOperation='multiply';for(const [cx,arr,tint] of [[w*.35,vision.leftEye,'77,196,255'],[w*.65,vision.rightEye,'143,113,255']]){for(let i=0;i<420;i++){const a=i*2.399,r=Math.sqrt(i/420)*w*.27,px=cx+Math.cos(a)*r,py=h*.5+Math.sin(a)*r*.72,lum=arr[i*7%arr.length];x.fillStyle=`rgba(${tint},${.05+lum*.2})`;x.beginPath();x.arc(px,py,2.5+lum*2,0,Math.PI*2);x.fill()}}x.restore();x.fillStyle='#15171c';x.font='11px ui-monospace';x.fillText('LEFT EYE',14,18);x.fillText('RIGHT EYE',w-82,18)}
export function renderBrainActivity(canvas,data){const x=canvas.getContext('2d'),w=canvas.width,h=canvas.height;x.clearRect(0,0,w,h);x.strokeStyle='rgba(255,255,255,.035)';for(let i=0;i<data.nodes.length;i+=3){const a=data.nodes[i],b=data.nodes[(i*7+19)%data.nodes.length];x.beginPath();x.moveTo(a.x*w,a.y*h);x.lineTo(b.x*w,b.y*h);x.stroke()}for(const n of data.nodes){const r=1.4+n.activity*4;x.globalAlpha=.25+n.activity*.75;x.fillStyle=n.color;x.beginPath();x.arc(n.x*w,n.y*h,r,0,Math.PI*2);x.fill()}x.globalAlpha=1}
