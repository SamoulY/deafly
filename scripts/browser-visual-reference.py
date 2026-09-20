"""Independent native VisualMemoryBrain reference for browser integration."""
import os,sys,json
from pathlib import Path
import numpy as np
os.environ['STONKFLY_DATA']='/tmp/stonkfly-data'
sys.path.insert(0,'/tmp/stonkfly-src')
from stonkfly.neural.visual import VisualMemoryBrain
out=Path('/tmp/defly-visual-reference');out.mkdir(exist_ok=True)
b=VisualMemoryBrain();rgb=((np.arange(64*32*3)*37)%256).astype('u1').reshape(32,64,3);rgb.tofile(out/'rgb.bin')
records=[]
for i in range(3):
 counts,wall=b.rgb_step(rgb,10,learning=True)
 counts.tofile(out/f'{i}-counts.bin');b.weight[b.circuit['edges']].tofile(out/f'{i}-plastic.bin')
 b.drive.tofile(out/f'{i}-drive.bin')
 records.append(dict(spikes=int(counts.sum()),wall=wall,brain_ms=b.sim_ms))
(out/'results.json').write_text(json.dumps(records,indent=2));print(json.dumps(records))
