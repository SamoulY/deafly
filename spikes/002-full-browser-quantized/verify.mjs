// Executes the actual browser loader over HTTP using Node's Web APIs.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, sep} from 'node:path';
import {performance} from 'node:perf_hooks';
import {loadGraph, baselineWeight} from './loader.mjs';
const root = resolve(process.argv[2] || '/tmp/stonkfly-full-browser-package');
let corrupt = false;
const server = createServer((req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  if (corrupt && path.endsWith('.gz')) { res.end(Buffer.from('corrupt gzip')); return; }
  const stream = createReadStream(path);
  stream.on('error', () => res.destroy());
  res.setHeader('Content-Type', path.endsWith('.json') ? 'application/json' : 'application/octet-stream');
  stream.pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
try {
  const start = performance.now();
  const url = `http://127.0.0.1:${server.address().port}/manifest.json`;
  let heap, cursor = 0;
  const direct = process.argv.includes('--direct');
  if (direct) {
    const manifest = await fetch(url).then(r => r.json());
    const bytes = manifest.sizes.decodedBytes + Object.keys(manifest.arrays).length * 8;
    heap = new WebAssembly.Memory({initial: Math.ceil(bytes / 65536)});
  }
  const graph = await loadGraph(url, direct ? {allocate(name, desc, Type) {
    cursor = Math.ceil(cursor / 8) * 8;
    const array = new Type(heap.buffer, cursor, desc.byteLength / Type.BYTES_PER_ELEMENT);
    cursor += desc.byteLength;
    return array;
  }} : {});
  if (direct && !Object.values(graph.arrays).every(a => a.buffer === heap.buffer)) throw Error('Not direct WASM allocation');
  const seconds = (performance.now() - start) / 1000;
  for (const [name, array] of Object.entries(graph.arrays)) {
    const hash = createHash('sha256').update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
    if (hash !== graph.manifest.arrays[name].sha256) throw Error(`Array mismatch ${name}`);
  }
  const hash = createHash('sha256');
  const scratch = new Float32Array(65536);
  for (let base = 0; base < graph.manifest.edges; base += scratch.length) {
    const n = Math.min(scratch.length, graph.manifest.edges - base);
    for (let j = 0; j < n; ++j) scratch[j] = baselineWeight(graph, base + j);
    hash.update(new Uint8Array(scratch.buffer, 0, n * 4));
  }
  const weightSHA256 = hash.digest('hex');
  if (weightSHA256 !== graph.manifest.validation.baselineWeightSHA256) throw Error('Full JS FP32 reconstruction mismatch');
  const plastic = new BigInt64Array(graph.arrays.plastic_edges.length);
  graph.arrays.plastic_edges.forEach((e, i) => plastic[i] = BigInt(e));
  const plasticSHA256 = createHash('sha256').update(new Uint8Array(plastic.buffer)).digest('hex');
  if (plasticSHA256 !== graph.manifest.validation.plasticOriginalInt64SHA256) throw Error('Plastic mapping hash mismatch');
  corrupt = true;
  let rejected = false;
  try { await loadGraph(url); } catch { rejected = true; }
  if (!rejected) throw Error('Corrupt chunk accepted');
  console.log(JSON.stringify({environment: 'Node Web APIs over local HTTP; not a phone benchmark',
    nodes: graph.manifest.nodes, edges: graph.manifest.edges, plasticEdges: plastic.length,
    arrayHashesVerified: Object.keys(graph.arrays).length, weightSHA256, plasticSHA256,
    corruptGzipRejected: rejected, loadSeconds: seconds, sizes: graph.manifest.sizes}, null, 2));
} finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
