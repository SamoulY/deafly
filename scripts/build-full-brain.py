import json,os,sys,gzip,hashlib,shutil
from pathlib import Path
import numpy as np
os.environ['STONKFLY_DATA']='/tmp/stonkfly-data';sys.path.insert(0,'/tmp/stonkfly-src')
from stonkfly.neural.common import annotations
root=Path(__file__).resolve().parents[1];out=root/'pages/full-brain';out.mkdir(exist_ok=True)
p=Path('/tmp/stonkfly-full-browser-package');m=json.loads((p/'manifest.json').read_text())
needed=['ptr','post','contact','ids','retina','uv','lamina','sugar','plastic_edges','plastic_pre','plastic_gain','plastic_kc_mask','plastic_dan_index','plastic_dan','plastic_baseline','modulation_mask','r8','r8_uv','r8_channel','r8_corrected_edges']
for name in needed:
 for chunk in m['arrays'][name]['chunks']:shutil.copyfile(p/chunk['file'],out/chunk['file'])
m['arrays']={k:m['arrays'][k] for k in needed}
m['sizes']['decodedBytes']=sum(a['byteLength'] for a in m['arrays'].values())
d=m['arrays']['ids'];ids=np.frombuffer(b''.join(gzip.decompress((p/c['file']).read_bytes()) for c in d['chunks']),dtype=d['dtype'])
a=annotations(ids);m['decoder']={k:np.flatnonzero(mask).tolist() for k,mask in [('left',a.type.eq('DNp20')&a.somaSide.eq('L')),('right',a.type.eq('DNp20')&a.somaSide.eq('R')),('gate',a.type.eq('DNpe017'))]}
m['reinforcement']={k:np.flatnonzero(a.type.eq(t)).tolist() for k,t in [('reward','PAM11'),('aversive','PPL101')]}
m['reinforcement_settings']={'pulse_ms':200,'pulse_current':20,'neural_ms':500,'source':'stonkfly/config.py Settings defaults'}
m['manifest_hash']=hashlib.sha256(Path('/tmp/stonkfly-data/manifest.json').read_bytes()).hexdigest()
(out/'manifest.json').write_text(json.dumps(m))
for name in ['kernel.mjs','kernel.wasm']:shutil.copyfile(root/'spikes/004-quantized-wasm-runtime'/name,out/name)
for name in ['rule.mjs','sensory.mjs']:shutil.copyfile(root/'spikes/005-browser-learning'/name,out/name)
f=json.loads((root/'spikes/004-quantized-wasm-runtime/fixture.json').read_text());(out/'abi.json').write_text(json.dumps({'arrays':f['arrays'],'args':f['frames'][0]['args'],'mutable':f['mutable']}))
print(json.dumps({'arrays':len(needed),'decoder':m['decoder'],'bytes':m['sizes']['decodedBytes']}))
