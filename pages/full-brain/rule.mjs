// Direct port of stonkfly/neural/rule.py. Float64 traces and memory;
// anatomical gain and effective weights remain Float32. No amplitude rescaling.
export function advance(s,kc,dan,gain,h,eta,{learning=true,frozen=false}={}) {
 if(!Number.isFinite(h)||h<=0||h>0.0100001)throw Error('Rate bins must be 0--10 ms');
 const n=s.u.length,d=s.yDan.length;
 if(kc.length!==n||dan.length!==d||gain.length!==n*d||s.yKc.length!==n||s.w.length!==n||!Number.isFinite(eta))throw Error('Invalid rule shape');
 const a=Math.exp(-h),mid=Math.sqrt(a),dm=new Float64Array(d);
 for(let j=0;j<d;j++){dm[j]=s.yDan[j]*mid+dan[j]*(1-mid);s.yDan[j]=s.yDan[j]*a+dan[j]*(1-a);}
 const tu=1800,tw=.05,eu=Math.exp(-h/tu),ew=Math.exp(-h/tw),c=tu/(tu-tw)*(eu-ew);
 for(let i=0;i<n;i++){
  const km=s.yKc[i]*mid+kc[i]*(1-mid);s.yKc[i]=s.yKc[i]*a+kc[i]*(1-a);
  if(frozen)continue;
  let gmid=0,grate=0;
  if(learning)for(let j=0;j<d;j++){gmid+=gain[j*n+i]*dm[j];grate+=gain[j*n+i]*dan[j];}
  const drive=learning?eta*(kc[i]*gmid-grate*km):0,old=s.u[i];
  s.u[i]=Math.max(-.9,Math.min(1,old*eu+drive*tu*(-Math.expm1(-h/tu))));
  s.w[i]=Math.max(-.9,Math.min(1,s.w[i]*ew+old*c+drive*tu*(-Math.expm1(-h/tw)-c)));
 }
}
export function createState(n,d){return {yKc:new Float64Array(n),yDan:new Float64Array(d),u:new Float64Array(n),w:new Float64Array(n)};}
export function checkpoint(s){return Object.fromEntries(Object.entries(s).map(([k,v])=>[k,v.slice()]));}
export function effectiveWeights(s,baseline,out,{frozen=false}={}){if(baseline.length!==s.w.length||out.length!==s.w.length)throw Error('Invalid weights shape');if(!frozen)for(let i=0;i<out.length;i++)out[i]=baseline[i]*(1+s.w[i]);}
