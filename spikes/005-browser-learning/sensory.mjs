// Source-compatible display proxy, not calibrated insect photoreception.
const f=Math.fround;
function linear(value){const x=f(value/255);return x<=.04045?f(x/f(12.92)):f(Math.pow(f(f(x+f(.055))/f(1.055)),f(2.4)));}
export function sampleRGB(rgb,width,height,uv,channels=null){
 if(!(rgb instanceof Uint8Array)||rgb.length!==width*height*3||uv.length%2)throw Error('Invalid RGB input');
 const result=new Float32Array(uv.length/2);
 for(let i=0;i<result.length;i++){
  const x=Math.min(width-1,Math.max(0,Math.trunc(f(uv[i*2]*(width-1))))),y=Math.min(height-1,Math.max(0,Math.trunc(f(uv[i*2+1]*(height-1))))),p=(y*width+x)*3;
  if(channels)result[i]=linear(rgb[p+channels[i]]);
  else result[i]=f(f(f(linear(rgb[p])*f(.2126))+f(linear(rgb[p+1])*f(.7152)))+f(linear(rgb[p+2])*f(.0722)));
 }
 return result;
}
export function buildDrive(graph,state,rgb,width,height,ms,{laminaBias=12,tonic,stimulation=[]}={}){
 if(!Number.isFinite(ms)||ms<=0||ms>10)throw Error('Sensory bins must be 0--10 ms');
 const n=graph.nodes,drive=new Float32Array(n),rate=1-Math.exp(-Math.round(ms/.1)*.1/10);
 const light=sampleRGB(rgb,width,height,graph.uv),r8=sampleRGB(rgb,width,height,graph.r8_uv,graph.r8_channel);
 for(const i of graph.lamina)drive[i]=laminaBias;
 for(let j=0;j<light.length;j++){state.luminance[j]=f(state.luminance[j]+f(f(rate)*f(light[j]-state.luminance[j])));drive[graph.retina[j]]=f(f(30*state.luminance[j])/f(f(.02)+state.luminance[j]));}
 if(tonic)for(let i=0;i<n;i++)drive[i]=f(drive[i]+tonic[i]);
 for(const {indices,current} of stimulation)for(let j=0;j<indices.length;j++)drive[indices[j]]=f(drive[indices[j]]+f(typeof current==='number'?current:current[j]));
 for(let j=0;j<r8.length;j++){state.r8Light[j]=f(state.r8Light[j]+f(f(rate)*f(r8[j]-state.r8Light[j])));const i=graph.r8[j];drive[i]=f(drive[i]+f(f(30*state.r8Light[j])/f(f(.02)+state.r8Light[j])));}
 return drive;
}
