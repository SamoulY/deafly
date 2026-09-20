// Run in a Worker on phones. No expanded full-size FP32 weights or JSON edge arrays.
const types = {'<u4': Uint32Array, '<i4': Int32Array, '<i2': Int16Array,
  '|u1': Uint8Array, '|i1': Int8Array, '<f4': Float32Array, '<f8': Float64Array,
  '<i8': BigInt64Array, '<u8': BigUint64Array, '<u2': Uint16Array};
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');

export async function loadGraph(manifestURL, {signal, onProgress = () => {}, allocate} = {}) {
  if (new Uint8Array(new Uint32Array([1]).buffer)[0] !== 1) throw Error('Little-endian host required');
  const response = await fetch(manifestURL, {signal});
  if (!response.ok) throw Error(`Manifest HTTP ${response.status}`);
  const manifest = await response.json();
  if (manifest.format !== 'stonkfly-full-csr-v1') throw Error('Unsupported package');
  const arrays = {};
  let loaded = 0;
  for (const [name, desc] of Object.entries(manifest.arrays)) {
    const Type = types[desc.dtype] ?? (desc.dtype.startsWith('<U') ? Uint32Array : null);
    if (!Type) throw Error(`Unsupported dtype ${desc.dtype}`);
    // A caller may reserve a fixed WASM heap and supply views into it.
    // Growing that heap during loading detaches views and fails closed below.
    const array = allocate ? allocate(name, desc, Type) : new Type(desc.byteLength / Type.BYTES_PER_ELEMENT);
    if (!(array instanceof Type) || array.byteLength !== desc.byteLength) throw Error(`Invalid allocation: ${name}`);
    const destination = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    let end = 0;
    for (const chunk of desc.chunks) {
      if (chunk.offset !== end || end + chunk.byteLength > destination.length) throw Error('Invalid chunk bounds');
      const res = await fetch(new URL(chunk.file, manifestURL), {signal});
      if (!res.ok || !res.body) throw Error(`Chunk HTTP ${res.status}`);
      // Files MUST be served as raw gzip bytes, without Content-Encoding: gzip.
      if (res.headers.get('content-encoding') === 'gzip') throw Error('Serve .bin.gz without Content-Encoding');
      const reader = res.body.pipeThrough(new DecompressionStream('gzip')).getReader();
      let offset = chunk.offset;
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          if (offset + value.byteLength > chunk.offset + chunk.byteLength) throw Error('Oversized chunk');
          destination.set(value, offset);
          offset += value.byteLength;
        }
      } catch (error) {
        await reader.cancel(error).catch(() => {});
        throw error;
      } finally { reader.releaseLock(); }
      if (offset !== chunk.offset + chunk.byteLength) throw Error('Truncated chunk');
      // WebCrypto may internally copy this <=8MiB view; never hash a whole graph copy.
      const actual = hex(await crypto.subtle.digest('SHA-256', destination.subarray(chunk.offset, offset)));
      if (actual !== chunk.sha256) throw Error(`Integrity mismatch: ${chunk.file}`);
      end = offset;
      loaded += chunk.byteLength;
      onProgress({name, loaded, total: manifest.sizes.decodedBytes});
    }
    if (end !== destination.length) throw Error('Incomplete array');
    arrays[name] = array;
  }
  const {ptr, post, contact, plastic_edges: edges, plastic_pre: pre} = arrays;
  if (ptr.length !== manifest.nodes + 1 || ptr[0] !== 0 || ptr[manifest.nodes] !== manifest.edges ||
      post.length !== manifest.edges || contact.length !== manifest.edges || edges.length !== manifest.plasticEdges) throw Error('Graph dimensions mismatch');
  for (let i = 0; i < manifest.nodes; ++i) if (ptr[i] > ptr[i + 1]) throw Error('Nonmonotonic CSR');
  for (let e = 0; e < post.length; ++e) if (post[e] >= manifest.nodes) throw Error('Invalid target');
  for (let p = 0; p < edges.length; ++p) {
    if (pre[p] < 0 || pre[p] >= manifest.nodes || edges[p] < ptr[pre[p]] || edges[p] >= ptr[pre[p] + 1]) throw Error('Plastic edge mapping mismatch');
    if (p && edges[p] <= edges[p - 1]) throw Error('Plastic edge order mismatch');
    if (Math.fround(contact[edges[p]] * manifest.scaleFloat32) !== arrays.plastic_baseline[p]) throw Error('Plastic baseline mismatch');
  }
  return {manifest, arrays};
}

export function baselineWeight(graph, edge) {
  return Math.fround(graph.arrays.contact[edge] * graph.manifest.scaleFloat32);
}

// UTF-32 source strings are retained losslessly, decoded one entry at a time.
export function stringAt(graph, name, index) {
  const desc = graph.manifest.arrays[name];
  if (!desc.dtype.startsWith('<U')) throw Error('Not a UTF-32 array');
  const width = Number(desc.dtype.slice(2));
  const chars = graph.arrays[name].subarray(index * width, (index + 1) * width);
  const end = chars.indexOf(0);
  return String.fromCodePoint(...(end < 0 ? chars : chars.subarray(0, end)));
}
