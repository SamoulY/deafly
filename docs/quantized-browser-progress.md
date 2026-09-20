# Browser full-model quantization progress

No numerical attenuation and no graph pruning. Production website unchanged in this phase.

Verified by actual commands:
- spikes/002-full-browser-quantized/verify.mjs /tmp/stonkfly-full-browser-package --direct: complete graph in shared WebAssembly.Memory, 28 array hashes, all baseline FP32 weights reconstructed exactly, corrupt gzip rejected. Loader accepts caller allocator. This transport verification is separate from runtime integration.
- spikes/004-quantized-wasm-runtime/test.mjs and compare.py: 179827660 array bytes, 201326592 heap bytes, all mutable states/plastic weights bit-exact vs FP32 WASM for three fixture windows, native within declared tolerance, restore replay exact. Fixture enables legacy LTD for compatibility testing only.
- scripts/verify-quantized-worker.mjs: actual desktop Chromium module Worker produces 3335/12951/7561 fixture spikes, main thread timer continues. Mobile viewport is not physical phone verification.
- spikes/005-browser-learning/reference.py and test.mjs: original outer Python rule vs JS using all 7835 plastic edges/17 DANs, 12 controlled rate bins; max absolute error4.013903467416091e-14; frozen weights and checkpoint continuation verified.
- spikes/005-browser-learning/integration.mjs: actual full-network kernel counts feed outer rule (kernel LTD disabled),12 bins,7835 weights change, restore replay exact. Controlled stimulation only, not live-market inference and not a full Python-loop parity test.
- spikes/005-browser-learning/sensory-reference.py and sensory-test.mjs: all3335 R1-R6 and811 R8 RGB samples exactly match Python on deterministic64x32 fixture. buildDrive implementation remains unverified.

Pending: sensory current parity; R8 sign exceptions in visual runtime; true model configuration/decoder mapping; end-to-end Python VisualMemoryBrain parity; direct chunk-to-runtime loading; input/checkpoint hashes and worker-backed actual market telemetry; pause/resume and storage checkpoint; long sequences and physical-phone peak memory/thermal tests. Do not promote fixtures as live activity, and do not equate heap size with whole-browser RSS.
