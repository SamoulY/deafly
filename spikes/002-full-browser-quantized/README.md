# Full graph lossless browser package

## Verdict: PARTIAL

Full graph transport and exact baseline reconstruction are verified. Phone runtime speed, browser peak memory, and neural trajectory parity are NOT established by this packaging spike. No deployment was performed.

## Reproduce

From the project root:

```sh
/tmp/stonkfly-venv/bin/python spikes/002-full-browser-quantized/export.py
node spikes/002-full-browser-quantized/verify.mjs
```

Exporter options: `--data`, `--source`, `--out`. Default output is `/tmp/stonkfly-full-browser-package`, outside the repository and Pages public files. Source imports require the existing Stonkfly environment (NumPy, pandas, pyarrow). The manifest is published last, after all file roundtrips succeed; use a fresh output directory for production builds.

## Real Execution Evidence

- 166,700 nodes and 25,582,938 directed edges, none removed or reordered.
- All 7,835 original plastic edge indices and presynaptic mappings retained.
- Original `circuit.identify()` supplies all masks, gains, compartment memberships, and support mappings. Gains and plastic baseline weights remain FP32.
- All other graph.npz arrays retained losslessly, including IDs, sensory anchors, original UTF-32 superclass strings, confidence, and hex coordinates.
- Original neurotransmitter modulation mask retained. Original `visual.projection()` provides R8 mappings; explicit R8-to-aMe12 sign-correction indices are included separately without changing baseline contact values.
- 199,482,936 decoded bytes across 28 arrays.
- 72,977,690 compressed payload bytes across 51 gzip files, plus manifest JSON.
- Largest compressed file: 5,762,286 bytes, below the requested 20MB ceiling.
- Every compressed file was read back, decompressed, and compared to original bytes by exporter.
- Actual JS loader exercised via local HTTP using Node Web APIs: all 28 array SHA256s verified, all edge weights reconstructed and hashed, original int64 plastic-index hash reproduced, corrupt gzip rejected.
- Latest local Node load took 3.168986254 seconds. This is NOT a phone/browser performance claim and excludes subsequent whole-weight verification.

Baseline FP32 weights SHA256:
`d95171c2d59cfe3ebef2e5bd52be779b8f74754d718fc8941a93b8f2921c632b`

Original int64 plastic indices SHA256:
`153a1a6192bc7056b90bbfc757b56cb9580ca786a187583cc2cc652e1e3abe8f`

## Format And Browser Use

`manifest.json` describes dtype, original shape, decoded size, whole-array hash, and ordered chunk hashes/offsets. Numeric arrays use little endian. Original fixed-width Unicode arrays use UTF-32; `stringAt()` decodes entries individually without allocating a graph-size strings list.

`ptr` and `post` are uint32, with original CSR order. `contact` is signed int16. Every weight is reconstructed with **Math.fround(contact * Math.fround(0.275))**; using JS decimal `0.275` directly is not the specified operation. Export rejects any out-of-range count or any bitwise reconstruction mismatch. Baseline is unmodified graph.npz, before the documented visual sign exceptions.

```js
import {loadGraph, baselineWeight} from './loader.mjs';
const graph = await loadGraph(new URL('/package/manifest.json', location.href), {
  signal: abortController.signal,
  onProgress: ({loaded, total}) => postMessage({loaded, total}),
});
const originalWeight = baselineWeight(graph, edgeIndex);
```

Use inside a Worker; transferable array buffers permit handoff without copying. `loadGraph` allocates each final typed-array buffer once and streams sequential gzip chunks directly into it. No expanded edge-weight buffer or JSON edge list is allocated. Decompression and SHA256 have implementation-defined temporary memory; hashing is bounded to <=8MiB views, not whole-array copies. The decoded 199MB is a lower bound for asset memory, not total runtime memory. UTF-32 metadata accounts for additional memory; it is deliberately retained, not pruned.

Serve `.bin.gz` as raw `application/octet-stream` bytes with **no Content-Encoding header**. The loader uses DecompressionStream itself and rejects `Content-Encoding: gzip` to avoid silent HTTP auto-decompression. Secure context/localhost is needed for WebCrypto; browsers must support streaming fetch, DecompressionStream, BigInt typed arrays, and SHA256. Trust/authenticate the manifest separately: per-chunk hashes establish integrity against this manifest, not publisher authenticity.

## Runtime Integration Constraints

This is not a replacement neural integrator. The original C++ ABI takes int64 ptr, int32 post and mutable FP32 weights; do not pass compact buffers into that ABI unchanged. A compact-aware kernel must reconstruct baseline weights on demand and retain FP32 mutable plastic weights, using original edge indices for lookup. Original trace/state precision must remain unchanged, including float64 eligibility/rate memory and int64 timestamps. Runtime must apply the exported R8 sign exceptions for VisualMemoryBrain and preserve original accumulation order. No checkpoint or trained mutable state is included: this package is the complete baseline graph plus support mappings.

The original kernel, state, brain, rule, circuit, and visual source hashes are recorded for provenance. Baseline bitwise parity is necessary but does not establish complete trajectory parity: integration math, scheduling, plastic update rules, visual sign exceptions, and mutable state still require reference comparisons in the runtime workstream.
