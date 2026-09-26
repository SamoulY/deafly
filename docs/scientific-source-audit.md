# Scientific source audit — DeFly full-brain target

Date: 2026-09-26

## Confirmed Google-associated source

Google Research's official article, “A connectomics milestone: Mapping the complete male fruit fly brain” (2026-09-03), states that Google partnered with HHMI Janelia and collaborators to release a complete male Drosophila brain and central-nervous-system wiring diagram. It reports over 166,000 neurons and 125 million synaptic connections, and links the Male CNS Connectome dataset and Neuroglancer resources.

- Official article: https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/
- Dataset portal: https://male-cns.janelia.org/
- Google-linked project page: https://www.janelia.org/project-team/flyem/male-cns-connectome
- Stonkfly reference implementation: https://github.com/nftechie/stonkfly

This confirms the intended scientific lineage: MaleCNS is not merely an unrelated Stonkfly dataset. Google’s connectomics team is credited as a collaborator on the MaleCNS connectome. It does not mean Google authored DeFly, Stonkfly, or the browser runtime.

## What is and is not the brain

- MaleCNS is a connectome/wiring dataset, not by itself a complete executable physiological brain.
- Stonkfly supplies a reference implementation of dynamics, input adapters, decoder and engineered plasticity rules. Its own model documentation explicitly labels those dynamics and learning assumptions as coarse/engineered and reports no demonstrated profitable learning.
- Google DeepMind/HHMI `flybody` is a separate anatomically detailed body and MuJoCo physics model. It is relevant as an embodiment reference, not a replacement for the MaleCNS neural wiring.
- DeFly’s present graph package retains 166,700 nodes, 25,582,938 directed edges and 7,835 plastic edges in original order. The graph is much larger than the UI activity sample; sample rendering is not model pruning.

## Decision

Do not replace the current MaleCNS graph with FlyBody. Do not relabel DeFly as a Google product. Keep the current MaleCNS-based full graph as the correct foundation, cite Google/HHMI/Janelia as the scientific connectomics lineage, and make DeFly’s added dynamics, sensory encoding, decoder and plasticity assumptions explicit.

The requested implementation target is therefore:

1. Preserve the complete retained MaleCNS graph and all 25.58M edges.
2. Preserve the local browser WASM execution path rather than substitute a server or a small circuit.
3. Use lossless contact-count/int16 representation where exact reconstruction is proven; keep mutable efficacy and runtime state at required precision.
4. Separate scientific source provenance from DeFly engineering choices.
5. Validate the quantized browser trajectory against the Stonkfly/reference kernel and use Chromium/WebKit emulation plus explicit iOS/Android resource budgets; physical-phone testing is optional for this milestone, not a blocker.

## Claims DeFly may use after attribution is added

> Based on the Google/HHMI Janelia-associated MaleCNS connectome, DeFly compresses and runs the retained fruit-fly central-nervous-system network locally in a browser.

Qualify this with:

> The connectome is a wiring map. Neural dynamics, visual encoding, action decoder and reward-modulated plasticity are computational modeling choices, not a claim that the browser reproduces all biological physiology or that trading behavior is profitable.

## Open gates

- Confirm the exact MaleCNS release/version and data license in the provenance manifest shipped with the graph.
- Add the official source URLs and citations to `THIRD_PARTY_NOTICES.md` and the public technical documentation.
- Complete native/reference trajectory parity and plasticity parity tests.
- Benchmark Chromium and WebKit emulation with iOS/Android resource budgets for cold load, peak memory, foreground inference, checkpoint restore, suspension and thermal-risk heuristics. Physical-device measurements are not required for this milestone.
- Emulation establishes engine compatibility only, not measured physical-device thermal/battery behavior. Neither browser parity nor emulation establishes biological equivalence or profitable learning; those require independent scientific/behavioral evidence.
