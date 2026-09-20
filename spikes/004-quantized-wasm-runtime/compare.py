import json
from pathlib import Path
import numpy as np
p=Path(__file__).resolve().parent; old=p.parent/'003-full-wasm-runtime'
m=json.loads((p/'fixture.json').read_text()); edges=np.fromfile(p/'fixture/plastic_edge.bin',dtype='<u4'); results=[]
for i in range(len(m['frames'])):
 fields={}
 for k in m['mutable']:
  dtype=np.dtype(m['arrays'][k]['dtype']); b=np.fromfile(p/'fixture'/f'wasm-{i}-{k}.bin',dtype=dtype)
  source='weight' if k=='plastic_weight' else k
  a=np.fromfile(old/'fixture'/f'wasm-{i}-{source}.bin',dtype=dtype)
  native=np.fromfile(old/'fixture'/f'native-{i}-{source}.bin',dtype=dtype)
  if k=='plastic_weight':a=a[edges];native=native[edges]
  fields[k]={'fp32_wasm_exact':bool(np.array_equal(a,b)),'native_exact':bool(np.array_equal(native,b)),'native_max_abs_error':float(np.abs(native.astype('f8')-b.astype('f8')).max(initial=0))}
  assert np.array_equal(a,b),(i,k,'WASM mismatch')
  if dtype.kind=='f':assert np.allclose(native,b,atol=2e-4,rtol=2e-5),(i,k,'native mismatch')
  else: assert np.array_equal(native,b),(i,k,'native integer mismatch')
 results.append({'frame':i,'fields':fields})
report={'status':'PASS','all_state_and_plastic_vs_fp32_wasm_bit_exact':True,'native_tolerance':{'atol':2e-4,'rtol':2e-5},'frames':results}
(p/'parity-results.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='frames'},indent=2))
