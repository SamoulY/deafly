# Full retained connectome in mobile browsers

User requirement: full model, no pruning or reduced network. Low-poly visuals independent of inference fidelity.

Acceptance gates:
1. Exactly 166700 nodes, 25582938 directed edges, original order and receptor/readout mapping.
2. Quantized immutable baseline weights reconstruct bit-identical FP32 from signed int16 contact count * float32(0.275); preserve 7835 mutable plastic edges and precision of learning traces.
3. Runtime reads contacts directly; do not advertise runtime memory savings if weights expand back into full FP32 buffers.
4. WASM native-kernel parity: identical input/time schedule; compare per-neuron spikes, voltage, conductance, adaptation, plastic updates, restore and frozen/no-reward controls. Float math differences require explicit measured tolerance, not assumed equivalence.
5. Web Worker off main thread, chunked hash-checked loading with progress/cancel/error, no full-graph JSON or per-edge JS objects, IndexedDB cache only after validation.
6. On phone hidden tab pause, bounded work slices, no background persistence promise. Resume same checkpoint or disclose restart.
7. Record download bytes, WASM heap, JS allocations, peak RSS where measurable, inference wall/simulated time, input/checkpoint/manifest hashes. Desktop emulation does not prove physical-phone thermal/memory viability.
8. Connect live counters and 3D sample only to actual matching runtime output. Sampled renderer is not a pruned simulation.

No arbitrary weight amplitude reduction: it changes excitation and learning but does not reduce edge count or storage by itself. Safe work skipping already present in upstream kernel is distinct from dropping weak edges.

Current empirical baseline: scripts in spikes/001-full-stonkfly-mobile, rerun complete weights int16 roundtrip zero error. Browser implementation experiments isolated in spikes/002 and spikes/003; no production promotion until actual execution validated.
