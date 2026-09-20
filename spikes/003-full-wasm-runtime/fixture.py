"""Export a complete MemoryBrain kernel fixture and execute native reference."""
import os, sys, json, time, hashlib
from pathlib import Path
os.environ['STONKFLY_DATA']='/tmp/stonkfly-data'
sys.path.insert(0,'/tmp/stonkfly-src')
import numpy as np
from stonkfly.neural.brain import MemoryBrain, SOURCE
ROOT=Path(__file__).resolve().parent
DATA=ROOT/'fixture'; DATA.mkdir(exist_ok=True)
b=MemoryBrain()
c=b.circuit
arrays={k:getattr(b,k) for k in ['ptr','post','weight','v','g','refractory','drive','previous_drive','queue','queue_count','counts','active','nactive','last','eligibility','eligibility_last','modulation','modulation_last','modulation_mask','rest','adaptation']}
arrays.update(clock=np.array([0],dtype=np.int64),flags=b.active_flag,kc_mask=c['kc_mask'],dan_index=c['dan_index'],plastic_edge=c['edges'],plastic_pre=c['pre'],baseline_weight=b.baseline_plastic,dan_gain=c['gain'])
mutable=['weight','v','g','refractory','previous_drive','queue','queue_count','clock','counts','active','flags','nactive','last','eligibility','eligibility_last','modulation','modulation_last','adaptation']
meta={'n':b.n,'edges':len(b.post),'nplastic':len(c['edges']),'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'arrays':{},'frames':[],'mutable':mutable}
for k,a in arrays.items():
 a.tofile(DATA/(k+'.bin')); meta['arrays'][k]={'dtype':a.dtype.str,'shape':a.shape,'bytes':a.nbytes}
real=b.advance
frame=0
def capture(*args):
 global frame
 arrays['clock'][0]=b.cursor
 b.drive.tofile(DATA/f'drive-{frame}.bin')
 # Kernel pointer argument order captured directly from production MemoryBrain.
 byptr={a.ctypes.data:k for k,a in arrays.items()}; byptr[args[11]]='clock'
 pointer_positions=set(list(range(1,12))+list(range(14,23))+list(range(24,28))+list(range(32,37)))
 encoded=[{'array':byptr[x]} if i in pointer_positions else x for i,x in enumerate(args)]
 t=time.perf_counter(); real(*args); elapsed=time.perf_counter()-t
 arrays['clock'][0]=b.cursor+args[12]
 for k in mutable: arrays[k].tofile(DATA/f'native-{frame}-{k}.bin')
 meta['frames'].append({'args':encoded,'native_seconds':elapsed,'spikes':int(b.counts.sum()),'changed_plastic':int(np.count_nonzero(b.weight[c['edges']] != b.baseline_plastic))})
 frame+=1
b.advance=capture
# Controlled external currents, through the actual API; no invented spikes or changed topology.
for light,stim,learn in [(0.5,[(c['kc'],35.0)],False),(0.8,[(c['kc'],35.0),(c['dan'],40.0)],True),(0.0,None,False)]:
 b._neural_step(np.full(len(b.retina),light,dtype=np.float32),10.0,learning=learn,stimulation=stim)
(ROOT/'fixture.json').write_text(json.dumps(meta,indent=2))
print(json.dumps({'n':b.n,'edges':len(b.post),'nplastic':len(c['edges']),'array_bytes':sum(x['bytes'] for x in meta['arrays'].values()),'frames':[{k:v for k,v in f.items() if k!='args'} for f in meta['frames']]},indent=2))
