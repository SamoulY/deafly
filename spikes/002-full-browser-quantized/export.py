#!/usr/bin/env python3
"""Lossless, original-order Stonkfly baseline graph transport package."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import numpy as np


def sha(b):
    return hashlib.sha256(b).hexdigest()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--data', default='/tmp/stonkfly-data')
    p.add_argument('--source', default='/tmp/stonkfly-src')
    p.add_argument('--out', default='/tmp/stonkfly-full-browser-package')
    args = p.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    os.environ['STONKFLY_DATA'] = str(Path(args.data).resolve())
    sys.path.insert(0, args.source)
    from stonkfly.neural.circuit import identify
    graph = Path(args.data) / 'graph.npz'
    z = np.load(graph, allow_pickle=False)
    ptr, post, weight, ids = (z[k] for k in ['ptr', 'post', 'weight', 'ids'])
    n, e = len(ids), len(post)
    assert (n, e) == (166700, 25582938), (n, e)
    assert ptr[0] == 0 and ptr[-1] == e and np.all(ptr[1:] >= ptr[:-1])
    assert post.min() >= 0 and post.max() < n
    assert weight.dtype == np.float32 and np.isfinite(weight).all()
    contact = np.rint(weight / np.float32(.275))
    assert contact.min() >= -32768 and contact.max() <= 32767
    contact = contact.astype('<i2')
    restored = contact.astype(np.float32) * np.float32(.275)
    assert np.array_equal(restored.view('u4'), weight.view('u4')), 'not bitwise exact'
    del restored
    circuit = identify(SimpleNamespace(ids=ids, ptr=ptr, post=post, weight=weight, n=n))
    assert len(circuit['edges']) == 7835
    assert np.array_equal(np.searchsorted(ptr, circuit['edges'], side='right') - 1, circuit['pre'])
    manifest = {'format': 'stonkfly-full-csr-v1', 'nodes': n, 'edges': e,
                'plasticEdges': len(circuit['edges']), 'edgeOrder': 'original, unchanged',
                'scaleFloat32': float(np.float32(.275)), 'arrays': {},
                'validation': {'baselineWeightSHA256': sha(memoryview(weight).cast('B')),
                               'weightReconstruction': 'bitwise identical FP32 for every edge',
                               'plasticOriginalInt64SHA256': sha(memoryview(circuit['edges']).cast('B'))},
                'circuitReport': circuit['report']}
    # Each uncompressed chunk <= 8 MiB; gzip overhead cannot approach Pages' 20MB limit.
    chunk_bytes = 8 * 1024 * 1024

    def emit(name, array):
        a = np.ascontiguousarray(array)
        if a.dtype.hasobject:
            raise ValueError(f'Unsafe object array {name}')
        a = a.astype(a.dtype.newbyteorder('<'), copy=False)
        raw = memoryview(a).cast('B')
        desc = {'dtype': a.dtype.str, 'shape': list(a.shape), 'byteLength': len(raw),
                'sha256': sha(raw), 'chunks': []}
        for index, offset in enumerate(range(0, len(raw), chunk_bytes)):
            block = raw[offset:offset + chunk_bytes]
            packed = gzip.compress(block, compresslevel=6, mtime=0)
            assert len(packed) <= 20_000_000
            filename = f'{name}.{index:03d}.bin.gz'
            (out / filename).write_bytes(packed)
            # Verify bytes read from disk, independently of compression input.
            decoded = gzip.decompress((out / filename).read_bytes())
            assert decoded == block
            desc['chunks'].append({'file': filename, 'offset': offset,
                                   'byteLength': len(block), 'compressedBytes': len(packed),
                                   'sha256': sha(block), 'compressedSHA256': sha(packed)})
        manifest['arrays'][name] = desc

    emit('ptr', ptr.astype('<u4'))
    emit('post', post.astype('<u4'))
    emit('contact', contact)
    for key in z.files:
        if key not in ('ptr', 'post', 'weight'):
            emit(key, z[key])
    for key, value in circuit.items():
        if isinstance(value, np.ndarray):
            emit('plastic_' + key, value.astype('<u4') if key == 'edges' else value)
    emit('plastic_baseline', weight[circuit['edges']])
    # Original runtime derives this mask from neurotransmitter annotations.
    import pyarrow.feather as feather
    neurons = feather.read_table(Path(args.data) / 'normalized/neurons.feather').to_pandas().set_index('source_id').loc[ids]
    emit('modulation_mask', neurons.neurotransmitter.isin(['dopamine', 'octopamine', 'serotonin']).to_numpy(dtype=np.uint8))
    # Preserve the visual adapter's derived inputs and explicit sign exceptions too.
    from stonkfly.neural.common import annotations
    from stonkfly.neural.visual import projection
    annotation = annotations(ids)
    visual_brain = SimpleNamespace(ids=ids, ptr=ptr, post=post, weight=weight, n=n,
                                   retina=z['retina'])
    r8, r8_uv, r8_confidence = projection(visual_brain, annotation)
    emit('r8', r8)
    emit('r8_uv', r8_uv)
    emit('r8_confidence', r8_confidence)
    emit('r8_channel', np.where(annotation.type.iloc[r8].eq('R8p'), 2, 1).astype(np.int32))
    corrected = []
    for i in np.flatnonzero(annotation.type.fillna('').str.startswith('R8')):
        edges = np.arange(ptr[i], ptr[i + 1])
        corrected.extend(edges[annotation.type.iloc[post[edges]].eq('aMe12').to_numpy()].tolist())
    emit('r8_corrected_edges', np.asarray(corrected, dtype='<u4'))
    manifest['visualSignRule'] = 'VisualMemoryBrain: abs(weight) only on r8_corrected_edges; contact remains original graph baseline'
    source_manifest = Path(args.data) / 'manifest.json'
    if source_manifest.exists():
        manifest['sourceManifest'] = json.loads(source_manifest.read_text())
    manifest['sourceFiles'] = {}
    for filename in ['circuit.py', 'kernel.cpp', 'state.py', 'brain.py', 'rule.py', 'visual.py']:
        source = Path(args.source) / 'stonkfly/neural' / filename
        if source.exists():
            manifest['sourceFiles'][filename] = sha(source.read_bytes())
    arrays = manifest['arrays'].values()
    manifest['sizes'] = {'decodedBytes': sum(a['byteLength'] for a in arrays),
        'gzipBytes': sum(c['compressedBytes'] for a in arrays for c in a['chunks']),
        'largestFileBytes': max(c['compressedBytes'] for a in arrays for c in a['chunks']),
        'files': sum(len(a['chunks']) for a in arrays)}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'package': str(out), 'nodes': n, 'edges': e,
                      'plasticEdges': manifest['plasticEdges'], 'sizes': manifest['sizes'],
                      'validation': manifest['validation']}, indent=2))


if __name__ == '__main__':
    main()
