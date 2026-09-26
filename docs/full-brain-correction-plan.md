# DeFly full-brain correction plan

## Product intent

DeFly is not a small neural demo and not a Google-branded claim. The target is a complete, scientifically sourced fruit-fly connectome/model, quantified and compressed losslessly enough to run in a phone browser, with local mutable state and auditable checkpoint restore.

## Current verified baseline

- Upstream reference currently bundled: Stonkfly commit 78ef3e05ab0fa086032098558d893667068944a0, MIT software.
- Prepared MaleCNS v1.0 data: CC BY 4.0 attribution/terms must remain separate from software license.
- Runtime manifest: 166,700 neurons, 25,582,938 directed edges, 7,835 plastic edges; original edge order retained.
- Browser path uses CSR arrays, compressed chunks, WebAssembly kernel, 16-bit/lossless immutable contact representation and mutable plastic state. Full-browser execution has real local evidence, but mobile performance and scientific equivalence need device-specific gates.
- Existing project files must not state Google/FlyWire provenance unless the exact official source, version and license are verified.

## Correct source strategy

1. Identify the exact Google-related public fruit-fly resource the product wants to build on. Distinguish connectome data, neuron annotations, simulator code and behavioral model.
2. Obtain the official repository/publication, commit/version, data release and license. Preserve provenance in a machine-readable manifest.
3. Compare the candidate data against the current Stonkfly/MaleCNS graph: node count, edge count, neuron IDs, synapse/contact weights, sensory mappings, reward circuits and plastic edge definitions.
4. Do not rename the current model as Google data. Either migrate the full model or label the current one honestly while the migration is evaluated.
5. If the source is only a wiring diagram, document every added dynamical parameter and learning assumption. A connectome alone is not a runnable brain.

## Compression and phone gate

- Prefer lossless int16 contact-count encoding for immutable baseline weights where exact reconstruction is proven.
- Keep mutable efficacy, traces, membrane/state buffers and learning state at the precision needed for parity.
- Never use int8 or prune nodes/edges merely to pass a phone benchmark; any lossy encoding requires trajectory and behavior equivalence tests.
- Test physical iOS and Android browsers: first load bytes, peak memory, inference latency, battery/thermal behavior, background suspension, checkpoint size and restore latency.
- The mobile target is foreground local inference. Do not claim reliable always-on background autonomy.

## Scientific and product gates

- Reference parity: same input, same duration and same initial state produce bounded-equivalent spikes/decoder output against the official/reference implementation.
- Plasticity parity: reward and aversive stimuli change the documented plastic edges; frozen control does not.
- Restore parity: exported mutable state restores and resumes the same trajectory.
- Sensory provenance: chart/vision/model input share the same snapshot and frame hashes.
- Behavioral evaluation: held-out tasks and baselines; a changed weight/hash is not evidence of improvement.
- UI explicitly reports `FULL CONNECTOME`, source/version, precision, backend, device limits and whether telemetry is sampled.

## Incorrect claims to remove

- Google developed the current DeFly brain.
- Stonkfly is the scientific origin of all underlying data.
- A 4,000-node visualization is the full model.
- Hashes prove learning or correct execution.
- A browser full-kernel foreground test proves dependable background trading.

## Scope boundaries

Monad provenance registration, LP plus contract hedging, and Jev-like typed decisions are separate projects/features. They must not determine the scientific source or replace the full-brain workstream.
