# DeFly

## 中文

DeFly｜浏览器里的数字果蝇与去中心化蝇群智能

无需安装，即可在浏览器本地运行完整的果蝇大脑神经模型。通过养成与演化，在你的教学下，成长为最适合你的数字员工。而且你并不孤单，我们正在构建联邦宇宙中的去中心化蝇群智能，让你一键加入或建立蝇群，在 Avalanche C-Chain 上，与伙伴共建独属于你们的经济模型世界！

Project URL: https://defly.99x.meme
GitHub: https://github.com/SamoulY/deafly

## English

DeFly | Browser-Based Digital Fruit Flies & Decentralized Swarm Intelligence

No installation needed. Run a full fruit-fly brain neural model locally in your browser. Through nurturing and evolution under your guidance, it grows into a digital worker tailored to you. And you’re not alone: we’re building decentralized swarm intelligence in a federated universe, letting you join or create a colony in one click and build your own economic world with your partners on Avalanche C-Chain!

Project URL: https://defly.99x.meme
GitHub: https://github.com/SamoulY/deafly

---

## Technical documentation / 技术文档

# DeFly raising trial

Cloudflare Pages + Worker + D1. PAPER_ONLY: no real orders, deposits, wallets or withdrawals.

Implemented locally:
- Persistent browser session and user-isolated fly profile.
- Kraken closed-minute historical teaching: 12 decisions, next-open adverse fills, fees, collateralized long/short, separate final liquidation, immutable replay records.
- Append-only bounded reward points, atomic cosmetic purchases, ownership, preview and persistent outfit.
- Per-user supervised market-only decision head, queued training, immutable checkpoints, explicit activation and restoration, frozen evaluation with cash/buy-hold/pre/post comparisons.
- Exposure registry prevents evaluation history reuse; replay canonicalization and global split assignments survive version resets.
- Original cosmetic 3D fly, synchronized monitor/retina, mobile chart and action controls. Legacy autonomous lab is explicit opt-in and separate from teaching.

Limits:
- `market_only_readout_v1` is a separate simplified training backend, not the full neural kernel. The project also contains a local browser WASM full-network runtime under `pages/full-brain/`; a persistent server is not the target architecture. Physical-phone performance and reference-model trajectory parity require separate evidence.
- Browser anatomy displays a sample of MaleCNS soma coordinates; rendering coverage is not computational network coverage. Browser activity must match the input frame and market snapshot hashes. Parameter changes do not establish predictive improvement.
- Evaluation uses a next-minute reference engine, distinct from five-minute teaching decisions; one evaluation reports NO VERIFIED IMPROVEMENT regardless of positive deltas.
- Training requires adequate chronological, nonoverlapping history and varied labels; capacity is 2000 canonical rows with explicit refusal rather than truncation.
- Session recovery currently uses this browser's local storage, not a cross-device login system.
- Prediction-market final settlement and the full original design's chart-tool/live-round scope are not complete.

Verification:
```
npm test
npm run check
node scripts/raising-live-round.mjs
node scripts/raising-browser-roundtrip.mjs
node tests/raising-ui-live-probe.mjs
```
Local database initialization: apply worker/schema.sql, then migrations/0004_raising.sql and 0005_raising_training.sql. Do not reapply 0003 to the consolidated schema (columns already exist). Never apply the full base schema destructively to production.

API contracts: docs/raising-api.md, docs/raising-training-api.md, docs/raising-service-api.md.
