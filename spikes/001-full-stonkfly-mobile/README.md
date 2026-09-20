# 001: Full Stonkfly kernel and mobile delivery

## Verdict: PARTIAL

The exact upstream kernel is verified locally, but a stock mobile browser is not a credible always-on host. Use the complete native kernel on a persistent server and keep phones as thin clients. A purpose-built native ARM64 app remains an experimental second path.

## Verified upstream

Source: `https://github.com/nftechie/stonkfly`, commit `78ef3e05ab0fa086032098558d893667068944a0`, MIT software license.

Prepared MaleCNS v1.0 data under CC BY 4.0 and verified:

- 166,700 neurons
- 25,582,938 directed edges
- 124,177,617 synaptic contacts
- 3,335 mapped R1-R6 inputs
- 7,835 KC→MBON07/MBON11 plastic edges

Official full-network test:

```text
1 passed in 58.20s
60.09 s wall
856,379,392 bytes maximum RSS
821,436,416 bytes peak memory footprint
```

The test exercises sensory input, PAM11 reward, PPL101 aversive feedback, real plastic-edge changes, checkpoint restore, frozen-memory and no-reward controls.

## Real graph storage

`graph.npz` is 250,157,214 bytes compressed and 250,154,520 bytes uncompressed. Runtime-dominant arrays:

- post int32: 102,331,752 bytes
- weight float32: 102,331,752 bytes
- ptr int64: 1,333,608 bytes
- superclass text: 42,675,200 bytes (not needed in production runtime)

The full 1.1 GB preparation inputs do not need to ship to runtime.

## Real-weight compression results

The baseline weight is exactly signed contact count × 0.275. On the real 25,582,938-edge graph, maximum absolute contact count is 2,591, so signed int16 is safe.

| Encoding | Bytes | Relative RMSE | Exact values | Sign flips |
|---|---:|---:|---:|---:|
| FP32 | 102,331,752 | 0 | 100% | 0 |
| contact-count int16 | 51,165,876 | 0 | 100% | 0 |
| FP16 | 51,165,876 | 0.0002066 | 7.215% | 0 |
| block-256 int8 | 25,982,840 | 0.01813 | 5.625% | 0.4928% |

Recommendation: use lossless int16 signed contact counts for immutable baseline edges and keep the 7,835 mutable efficacy multipliers/traces in FP32/FP64. Do not use block INT8 yet: sign flips in a recurrent threshold network are unacceptable without behavioral equivalence tests.

## Mobile delivery recommendation

### Production web product

- Persistent native Stonkfly runner: Python/C++ initially, then C++ service.
- Cloudflare Worker/D1: identity, queue, paper ledger, published observations and manifests.
- Phone browser: 3D rendering, sensory frame and sampled real telemetry only.
- Every published observation must bind `market_snapshot_hash`, `frame_sha256`, `checkpoint_hash`, `memory_sha256`, decoder values and executed action.

### Experimental native phone path

- Ahead-of-time C++ ARM64 build.
- Memory-mapped compiled graph package.
- Lossless int16 baseline contacts; FP32 dynamic state; FP32/FP64 plastic state.
- Save dynamic state and 7,835 plastic multipliers rather than a complete mutable 25.6M-weight checkpoint.
- Benchmark on physical iOS/Android for latency, RSS, battery and thermal throttling.

### Browser WASM

Plausible as a foreground experiment only. It needs an Emscripten port, custom binary loader and Web Worker. It is not suitable for dependable continuous background trading because mobile browsers suspend heavy/background workers.

## 3D scene licensing

The Stonkfly Python/connectome repository is MIT, but the deployed `stonkfly-three.vercel.app` frontend and procedural `scene.js` are not present in that repository and expose no custom-scene license. Three.js's MIT notice does not license the author's scene composition. Do not copy the deployed bundle without written permission. Either obtain permission or build an original high-fidelity scene.

## Next production requirement

A persistent native compute host is required. Cloudflare Workers cannot run this Python/C++ process, hold the graph/checkpoints, or execute ~60-second full-network observations. Until a host is supplied, DeFly can only publish the current simplified model or locally demonstrated full-kernel evidence; it cannot truthfully claim the public site is driven by the full kernel.
