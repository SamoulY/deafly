# Full-brain browser hash optimization verification

Executed with `node scripts/full-brain-hash-verify.mjs` on desktop Chromium, using the local `pages/full-brain` assets.

- Nodes: 166,700
- Directed edges: 25,582,938
- Plastic edges: 7,835
- Browser WASM heap: 201,326,592 bytes in this run
- Immutable contact array: 51,165,876 bytes
- Phases checked: initial, observation, reward, checkpoint restore
- Old state-hash algorithm vs cached-alias algorithm: matched in every phase
- Contact-array digest: unchanged in every phase
- Checkpoint restore: matched both hash algorithms and preserved the contact digest
- Observation compute time in this desktop run: approximately 38 ms per 10 ms observation

Evidence JSON: `docs/full-brain-hash-evidence.json`

This is desktop Chromium evidence only. It does not establish iPhone Safari or Android Chrome memory, thermal, battery, background-suspension, or long-session performance.
