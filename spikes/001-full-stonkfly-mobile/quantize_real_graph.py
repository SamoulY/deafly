import numpy as np,json,os,tempfile
a=np.load('/tmp/stonkfly-data/graph.npz');w=a['weight'].astype(np.float32)
q16=np.rint(w/.275).astype(np.int16);r16=q16.astype(np.float32)*np.float32(.275)
f16=w.astype(np.float16).astype(np.float32)
# blockwise int8, 256 weights/block with zero padding
n=len(w);pad=(-n)%256;wp=np.pad(w,(0,pad)).reshape(-1,256);sc=np.max(np.abs(wp),axis=1)/127;sc[sc==0]=1;qi=np.clip(np.rint(wp/sc[:,None]),-127,127).astype(np.int8);ri=(qi.astype(np.float32)*sc[:,None]).reshape(-1)[:n]
def metric(r):
 d=w-r;return{'relative_rmse':float(np.sqrt(np.mean(d*d))/np.sqrt(np.mean(w*w))),'max_abs_error':float(np.max(np.abs(d))),'exact_fraction':float(np.mean(d==0)),'sign_flip_fraction':float(np.mean(np.signbit(w)!=np.signbit(r)))}
print(json.dumps({'fp32_bytes':w.nbytes,'contact_int16':{'bytes':q16.nbytes,'metric':metric(r16)},'fp16':{'bytes':w.astype(np.float16).nbytes,'metric':metric(f16)},'block_int8_256':{'bytes':qi.nbytes+sc.nbytes,'metric':metric(ri)}},indent=2))
