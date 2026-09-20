#!/usr/bin/env python3
"""Export real MaleCNS soma anatomy. Run with /tmp/stonkfly-venv/bin/python.

Coordinates remain in the source somaLocation coordinate frame and units.
No physical unit conversion is inferred. A documented uniform affine display
transform is supplied separately; consumers may apply it exactly once.
"""
from pathlib import Path
from collections import defaultdict
import hashlib
import json
import subprocess
import numpy as np
import pandas as pd

SOURCE = Path('/tmp/stonkfly-data')
OUT = Path(__file__).resolve().parents[1] / 'pages/neural-anatomy.json'
LIMIT = 4000

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def main():
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    lock = json.loads((SOURCE / 'source.lock.json').read_text())
    hashes = {name: sha(SOURCE / name) for name in
              ('annotations.feather', 'graph.npz', 'manifest.json', 'source.lock.json')}
    assert hashes['annotations.feather'] == lock['annotations.feather']['sha256']
    assert hashes['annotations.feather'] == manifest['source_hashes']['annotations.feather']['sha256']
    with np.load(SOURCE / 'graph.npz', allow_pickle=False) as graph:
        ids = [str(int(v)) for v in graph['ids']]
    graph_ids = set(ids)
    assert len(ids) == len(graph_ids) == manifest['neurons'] == 166700
    annotations = pd.read_feather(SOURCE / 'annotations.feather', columns=['bodyId', 'somaLocation'])
    valid = {}
    for body, soma in annotations.itertuples(index=False, name=None):
        ident = str(int(body))
        if ident not in graph_ids or soma is None:
            continue
        xyz = np.asarray(soma, dtype=float)
        if xyz.shape != (3,) or not np.isfinite(xyz).all():
            continue
        assert ident not in valid, 'Duplicate annotated graph ID'
        valid[ident] = xyz
    assert valid
    xyz_all = np.stack(list(valid.values()))
    lo, hi = xyz_all.min(axis=0), xyz_all.max(axis=0)
    center = (lo + hi) / 2
    scale = 2.0 / float(np.max(hi - lo))
    # Spatial strata retain sparse anatomy, with stable hash ordering within each
    # occupied cell. Round-robin samples all occupied cells before denser cells.
    bins = defaultdict(list)
    for ident, xyz in valid.items():
        cell = tuple(np.minimum(11, ((xyz - lo) / np.maximum(hi-lo, 1) * 12).astype(int)))
        bins[cell].append(ident)
    for members in bins.values():
        members.sort(key=lambda ident: hashlib.sha256(('soma-v1:' + ident).encode()).digest())
    chosen = []
    level = 0
    keys = sorted(bins)
    while len(chosen) < min(LIMIT, len(valid)):
        for cell in keys:
            if level < len(bins[cell]):
                chosen.append(bins[cell][level])
                if len(chosen) == min(LIMIT, len(valid)):
                    break
        level += 1
    nodes = [dict(id=ident, x=float(valid[ident][0]), y=float(valid[ident][1]), z=float(valid[ident][2])) for ident in chosen]
    asset = {
        'schema_version': 1,
        'source': 'MaleCNS v1.0 body annotations: somaLocation, restricted to Stonkfly graph.npz ids',
        'truth_status': 'real_anatomy',
        'manifest_hash': hashes['manifest.json'],
        'total_model_count': len(ids),
        'coordinate_count': len(valid),
        'rendered_sample_count': len(nodes),
        'missing_coordinate_count': len(ids) - len(valid),
        'coordinate_system': {
            'stored': 'raw source somaLocation [x,y,z]; no axis swaps, jitter, synthesis, or unit conversion',
            'units': 'source coordinate units; physical voxel size not established by supplied manifest',
            'bounds_min': lo.tolist(), 'bounds_max': hi.tolist(),
            'display_transform': {'formula': 'display_xyz = (raw_xyz - center) * scale',
                                  'center': center.tolist(), 'scale': scale,
                                  'applied_to_nodes': False,
                                  'description': 'Uniform affine normalization; longest full-data axis spans [-1,1], aspect ratio preserved.'}
        },
        'sampling': {'method': '12x12x12 spatial strata over all eligible somata; lexicographic cell round-robin; SHA-256(soma-v1:<id>) order within cell',
                     'maximum_nodes': LIMIT, 'occupied_cells': len(bins),
                     'scope': 'All graph neurons with finite somaLocation, including brain and ventral nerve cord; spatially stratified, not a population-density estimate.'},
        'provenance': {
            'source_files': {name: {'sha256': digest, 'bytes': (SOURCE/name).stat().st_size} for name, digest in hashes.items()},
            'annotations_url': lock['annotations.feather']['url'],
            'id_join': 'annotations.bodyId equals graph.npz ids, exact integer identity',
            'attribution': [
                {'work': 'MaleCNS v1.0 connectome and body annotations', 'creator': 'MaleCNS / FlyEM data contributors',
                 'url': 'https://www.janelia.org/project-team/flyem', 'license': 'CC-BY-4.0',
                 'license_url': 'https://creativecommons.org/licenses/by/4.0/',
                 'changes': 'Restricted to model graph IDs, omitted absent/nonfinite somata, deterministic spatial subsampling; raw soma coordinates preserved.'},
                {'work': 'Stonkfly connectome preparation software', 'creator': 'nftechie / Stonkfly contributors',
                 'url': 'https://github.com/nftechie/stonkfly', 'license': 'MIT',
                 'revision': '78ef3e05ab0fa086032098558d893667068944a0'}
            ]
        },
        'nodes': nodes
    }
    asset['nodes_hash'] = subprocess.check_output(
        ['node', '-e', "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(require('crypto').createHash('sha256').update(JSON.stringify(JSON.parse(s))).digest('hex')));"],
        input=json.dumps(nodes, separators=(',', ':'), allow_nan=False).encode()
    ).decode()
    assert len(asset['nodes_hash']) == len(asset['manifest_hash']) == 64
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(asset, separators=(',', ':'), allow_nan=False) + '\n')
    # Re-open serialized output and verify membership and exact raw coordinates.
    result = json.loads(OUT.read_text())
    assert len({n['id'] for n in result['nodes']}) == len(result['nodes']) <= LIMIT
    for node in result['nodes']:
        assert node['id'] in graph_ids
        coords = np.array([node[k] for k in ('x','y','z')])
        assert np.isfinite(coords).all()
        assert np.array_equal(coords, valid[node['id']])
    assert all(sha(SOURCE / name) == digest for name, digest in hashes.items())
    print(json.dumps({'output': str(OUT), 'total_model_count': len(ids), 'coordinate_count': len(valid),
                      'rendered_sample_count': len(nodes), 'occupied_cells': len(bins),
                      'bytes': OUT.stat().st_size, 'asset_sha256': sha(OUT),
                      'manifest_hash': result['manifest_hash'], 'validation': 'PASS: unique graph IDs, exact finite source coordinates, source hashes'}, indent=2))

if __name__ == '__main__':
    main()
