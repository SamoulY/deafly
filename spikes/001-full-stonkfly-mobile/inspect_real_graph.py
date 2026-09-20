import numpy as np,json
a=np.load('/tmp/stonkfly-data/graph.npz')
w=a['weight'];q=np.rint(w/.275).astype(np.int32)
print(json.dumps({'arrays':{k:{'shape':list(a[k].shape),'dtype':str(a[k].dtype),'bytes':int(a[k].nbytes)} for k in a.files},'total_uncompressed_bytes':int(sum(a[k].nbytes for k in a.files)),'weight_min':float(w.min()),'weight_max':float(w.max()),'contact_abs_max':int(np.abs(q).max()),'contact_int16_safe':bool(np.abs(q).max()<=32767),'weight_unique':int(len(np.unique(w)))},indent=2))
