import sys,json,gzip
from pathlib import Path
import numpy as np
sys.path.insert(0,'/tmp/stonkfly-src')
from stonkfly.neural.sensory import retinal_samples
root=Path(__file__).resolve().parent;pack=Path('/tmp/stonkfly-full-browser-package');m=json.loads((pack/'manifest.json').read_text())
def load(name):
 d=m['arrays'][name];return np.frombuffer(b''.join(gzip.decompress((pack/c['file']).read_bytes()) for c in d['chunks']),dtype=d['dtype']).reshape(d['shape'])
w,h=64,32
rgb=((np.arange(w*h*3)*37)%256).astype('u1').reshape(h,w,3)
rgb.tofile(root/'fixture/rgb.bin');uv=load('uv');r8uv=load('r8_uv');ch=load('r8_channel')
for name,a in [('uv',uv),('r8uv',r8uv),('r8channel',ch),('samples',retinal_samples(rgb,uv))]:a.tofile(root/f'fixture/{name}.bin')
x=np.minimum((r8uv[:,0]*(w-1)).astype(int),w-1);y=np.minimum((r8uv[:,1]*(h-1)).astype(int),h-1)
v=rgb[y,x,ch].astype(np.float32)/255
np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4).tofile(root/'fixture/r8samples.bin')
print(json.dumps(dict(retina=len(uv),r8=len(r8uv))))
