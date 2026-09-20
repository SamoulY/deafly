from pathlib import Path
import numpy as np
import json
p=Path(__file__).resolve().parent
old=p.parent/'003-full-wasm-runtime'
s=Path('/tmp/stonkfly-src/stonkfly/neural/kernel.cpp').read_text().replace('#include <vector>','#include <vector>\n#include <algorithm>')
s=s.replace('const int64_t* ptr,const int32_t* post,float* weight','const uint32_t* ptr,const int32_t* post,const int16_t* contact').replace('const int64_t* plastic_edge','const uint32_t* plastic_edge')
s=s.replace('float adaptation_tau) {','float adaptation_tau,float* plastic_weight) {\n auto first_plastic=[&](uint32_t edge){return std::lower_bound(plastic_edge,plastic_edge+nplastic,edge)-plastic_edge;};\n auto read_weight=[&](uint32_t edge, std::ptrdiff_t& p){\n   if(p<nplastic && plastic_edge[p]==edge)return plastic_weight[p++];\n   return static_cast<float>(contact[edge])*.275f;\n };')
s=s.replace('for(int64_t e=ptr[i];e<ptr[i+1];e++){','auto plastic_cursor=first_plastic(ptr[i]);\n       for(uint32_t e=ptr[i];e<ptr[i+1];e++){')
s=s.replace('std::abs(weight[e])','std::abs(read_weight(e,plastic_cursor))').replace('const int64_t edge=plastic_edge[p];','').replace('weight[edge]','plastic_weight[p]')
s=s.replace('const int j=post[e];evolve(j,*clock,drive[j]);','const float edge_weight=read_weight(e,plastic_cursor);\n       const int j=post[e];evolve(j,*clock,drive[j]);').replace('g[j]+=weight[e]','g[j]+=edge_weight')
(p/'kernel.cpp').write_text(s)
b=(old/'build.sh').read_text().replace('/tmp/stonkfly-src/stonkfly/neural/kernel.cpp','kernel.cpp').replace('268435456','201326592')
(p/'build.sh').write_text(b)
meta=json.loads((old/'fixture.json').read_text()); (p/'fixture').mkdir(exist_ok=True)
for name,spec in list(meta['arrays'].items()):
 src=old/'fixture'/f'{name}.bin'; dst=p/'fixture'/f'{name}.bin'
 if name in ['ptr','plastic_edge','weight']:
  a=np.fromfile(src,dtype=spec['dtype'])
  if name=='weight':
   q=np.rint(a/np.float32(.275)).astype('<i2'); assert np.array_equal((q.astype('f4')*np.float32(.275)).view('u4'),a.view('u4')); a=q
  else: a=a.astype('<u4')
  a.tofile(dst); spec.update(dtype=a.dtype.str,bytes=a.nbytes)
 else:
  if not dst.exists(): dst.symlink_to(src)
edge=np.fromfile(old/'fixture/plastic_edge.bin',dtype='<i8'); assert np.all(np.diff(edge)>0)
a=np.fromfile(old/'fixture/weight.bin',dtype='<f4')[edge]; a.tofile(p/'fixture/plastic_weight.bin')
meta['arrays']['plastic_weight']={'dtype':'<f4','shape':[len(a)],'bytes':a.nbytes}
meta['mutable']=[k for k in meta['mutable'] if k!='weight']+['plastic_weight']
for i,f in enumerate(meta['frames']):
 f['args'].append({'array':'plastic_weight'})
 dst=p/'fixture'/f'drive-{i}.bin'
 if not dst.exists(): dst.symlink_to(old/'fixture'/dst.name)
(p/'fixture.json').write_text(json.dumps(meta,indent=2))
print('prepared',sum(s['bytes'] for s in meta['arrays'].values()),'array bytes')
