import json
from pathlib import Path
import numpy as np
p=Path(__file__).resolve().parent
meta=json.loads((p/'fixture.json').read_text())
results=[]
for i in range(len(meta['frames'])):
 fields={}
 for k in meta['mutable']:
  dtype=np.dtype(meta['arrays'][k]['dtype'])
  a=np.fromfile(p/'fixture'/f'native-{i}-{k}.bin',dtype=dtype)
  b=np.fromfile(p/'fixture'/f'wasm-{i}-{k}.bin',dtype=dtype)
  delta=np.abs(a.astype(np.float64)-b.astype(np.float64))
  fields[k]={'exact':bool(np.array_equal(a,b)),'different':int(np.count_nonzero(a!=b)),'max_absolute_error':float(delta.max(initial=0))}
  if dtype.kind not in 'fc': assert np.array_equal(a,b),(i,k,fields[k])
  else: assert np.allclose(a,b,atol=2e-4,rtol=2e-5),(i,k,fields[k])
 results.append({'frame':i,'fields':fields})
report={'status':'PASS','float_tolerance':{'atol':2e-4,'rtol':2e-5},'integer_states_exact':True,'frames':results}
(p/'parity-results.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
