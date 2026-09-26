# Third-party attribution

The neural data export and reference implementation use Stonkfly: https://github.com/nftechie/stonkfly (reference revision 78ef3e05ab0fa086032098558d893667068944a0). Its MIT software notice is preserved in THIRD_PARTY_STONKFLY_LICENSE.txt. Underlying scientific datasets may have separate attribution or usage terms; the software license is not a blanket license for all datasets.

Pixelify Sans notice: pages/pixel-ui-OFL.txt. Dependencies such as Three.js retain their upstream licenses. This repository does not assign a new blanket license to all bundled assets.

Browser-runtime adaptation, application, and coordination logic must be distinguished from authorship of the underlying neural model.

## MaleCNS scientific provenance

The graph derives from the MaleCNS connectome, a collaboration involving HHMI Janelia, Google Research and other institutions. Google Research explicitly describes this collaboration in “A connectomics milestone: Mapping the complete male fruit fly brain” (September 3, 2026): https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/ . Dataset portal: https://male-cns.janelia.org/ . See docs/scientific-source-audit.md for evidence and remaining release/license verification gates.

Google's participation in reconstruction does not imply Google authored or endorsed DeFly's simulator, sensory adapter, action decoder or learning rules. The connectome is anatomical data, not a complete executable biological brain. FlyBody is a separate body/physics model and is not a substitute for this graph.
