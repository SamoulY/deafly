import sys,json,gzip
from pathlib import Path
import numpy as np
sys.path.insert(0,'/tmp/stonkfly-src')
from stonkfly.neural.rule import advance
root=Path(__file__).resolve().parent
pack=Path('/tmp/stonkfly-full-browser-package')
m=json.loads((pack/'manifest.json').read_text())
def load(name):
 d=m['arrays'][name]
 return np.frombuffer(b''.join(gzip.decompress((pack/c['file']).read_bytes()) for c in d['chunks']),dtype=d['dtype']).reshape(d['shape'])
gain=load('plastic_gain');base=load('plastic_baseline');d,n=gain.shape
assert n==7835
out=root/'fixture';out.mkdir(exist_ok=True)
gain.tofile(out/'gain.bin');base.tofile(out/'baseline.bin')
s=[np.zeros(n),np.zeros(d),np.zeros(n),np.zeros(n)];frames=[]
for i in range(12):
 kc=((np.arange(n)*7+i*31)%170).astype(float)
 dan=((np.arange(d)*3+i*19)%65-25).astype(float)
 if i==6:dan.fill(0)
 learning=i not in [7,8];frozen=i in [9,10];h=.01 if i%2 else .005
 kc.tofile(out/f'{i}-kc.bin');dan.tofile(out/f'{i}-dan.bin')
 advance(*s,kc,dan,gain,h,.001,learning=learning,frozen=frozen)
 for name,a in zip(['yKc','yDan','u','w'],s):a.tofile(out/f'{i}-{name}.bin')
 frames.append(dict(h=h,learning=learning,frozen=frozen))
(root/'fixture.json').write_text(json.dumps(dict(n=n,d=d,frames=frames)))
print(json.dumps(dict(n=n,d=d,frames=len(frames),changed=int(np.count_nonzero(s[3])))))
