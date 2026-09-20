import numpy as np, json, hashlib
rng=np.random.default_rng(7)
# Heavy-tailed signed synthetic contact-derived weights, representative of Stonkfly storage range.
w=(rng.lognormal(mean=.2,sigma=1.15,size=2_000_000)*rng.choice([-1,1],2_000_000)).astype(np.float32)
scale=max(abs(w.min()),abs(w.max()))/127
q=np.clip(np.rint(w/scale),-127,127).astype(np.int8)
r=q.astype(np.float32)*scale
rmse=float(np.sqrt(np.mean((w-r)**2)));rel=float(rmse/np.sqrt(np.mean(w**2)))
# Per-block 256 quantization
blocks=w.reshape(-1,256) if len(w)%256==0 else w[:len(w)//256*256].reshape(-1,256)
sc=np.max(np.abs(blocks),axis=1)/127;qb=np.clip(np.rint(blocks/sc[:,None]),-127,127).astype(np.int8);rb=qb.astype(np.float32)*sc[:,None]
br=float(np.sqrt(np.mean((blocks-rb)**2))/np.sqrt(np.mean(blocks**2)))
print(json.dumps({'n':len(w),'fp32_bytes':w.nbytes,'int8_bytes':q.nbytes+4,'global_relative_rmse':rel,'block256_bytes':qb.nbytes+sc.nbytes,'block256_relative_rmse':br},indent=2))
