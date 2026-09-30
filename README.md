# DeFly

> Project identity: **DeFly**. “FlyDesk” is the historical teaching/workbench module inside DeFly, not the project name.

## DeFly — FlyDesk integration branch

The default historical desk now uses `/api/flydesk` and **long-only BUY / SELL / HOLD**, with SKIP separate from a human label. Old `/api/raising` short/CLOSE sessions and models remain separate; fly profiles, earned points and cosmetics are shared.

New functionality includes an exact 8-decimal paper broker, recoverable committed intents, candlesticks and server-calculated indicators, chart annotations and per-decision review, Argon2id account registration/login with HttpOnly sessions, historical dataset import, JSONL replay export, and a separate three-output personal baseline with matching five-minute evaluation rules. The browser brain observes with frozen plastic weights; its activity is not yet an input to the personal training head.


Local setup (Node 22+):

```powershell
npm ci
npx playwright install chromium webkit
npm run dev
```

Open http://127.0.0.1:8876. This serves the UI and Worker, applies the local schema/migrations once and persists local data under `.wrangler/`. `npm run dev:fixture` instead starts a disposable, visibly synthetic teaching environment; fixtures cannot earn rewards or enter personal training. Nothing in these commands deploys to Cloudflare.

```powershell
npm run test:flydesk
npm test
npm run check
npm run worker:build
```

For an existing deployed database, apply only the new migrations `0009_flydesk.sql`, `0010_flydesk_auth.sql`, and `0011_flydesk_datasets.sql` after confirming earlier migrations. Do not reapply the base schema. Configure the D1 ID, `FLYDESK_LIVE` Durable Object binding/migration, and an explicit comma-separated `ALLOWED_ORIGIN` list matching the frontend. Account cookies require credentialed CORS; `*` is not an authenticated production origin policy. `ADMIN_USER_IDS` controls dataset administration; locally set `FLYDESK_ADMIN_USER_IDS` before starting the dev server. `PAPER_ONLY` must be `true`.

Historical importer:

```powershell
node scripts/import-flydesk-history.mjs BTC-USD 2026-08-01T00:00:00Z 2026-08-31T00:00:00Z
```

The importer paginates Coinbase public candles, rejects gaps and saves a local JSON dataset under `runtime/datasets/`. An authorized admin can upload it in the UI. Optional `FLYDESK_API` and `FLYDESK_SESSION_COOKIE` environment variables enable authenticated import; never commit or print their credentials. Dataset declarations remain operator-provided provenance, not cryptographic source attestation. Dataset chunks avoid D1's single-value size limit. Real data availability depends on the public provider; the importer does not interpolate gaps.

The sections below describe the earlier DeFly direction and legacy experimental domain. They are not a claim that every FlyDesk v1 requirement is finished.




Project URL: https://defly.99x.meme
GitHub: https://github.com/SamoulY/deafly

## English

DeFly | Browser-Based Digital Fruit Flies & Decentralized Swarm Intelligence

No installation needed. Run a full fruit-fly brain neural model locally in your browser. Through nurturing and evolution under your guidance, it grows into a digital worker tailored to you. And you’re not alone: we’re building decentralized swarm intelligence in a federated universe, letting you join or create a colony in one click and build your own economic world with your partners on Avalanche C-Chain!

Project URL: https://defly.99x.meme
GitHub: https://github.com/SamoulY/deafly

---


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

## Automatic fly decisions

The product panel is English-only: consent once, Start/Pause, and optional Correct. Server tasks are distributed automatically; users no longer enter colony IDs, task IDs, quorum or deadlines. Corrections are recorded separately and do not overwrite signed decisions or imply training. Migration `0010_colony_auto.sql` is required. Browser visibility recovery and owner-scoped recovery of accepted ballots after lost responses are regression-tested.

Demo (EN): Agree to public participation → Start → wait for the fly's decision → optionally Correct → Pause. No real orders.



Local implementation (not a deployment claim): session-scoped identity and cosmetic phenotype; IndexedDB full-brain checkpoints; explicit colony enrollment; server-frozen task membership and market snapshot; owner-signed ballots and immutable D1 results. No full brain weights are uploaded or averaged. Ballots are owner-signed reports, not remote neural-execution attestation. Colony results are paper-only recommendations and do not execute trades.


Verification commands:
```sh
node scripts/verify-checkpoint-lifecycle.mjs
node scripts/verify-colony-real-brain.mjs
node scripts/verify-colony-multi-brain.mjs
BROWSER_ENGINE=webkit node scripts/verify-colony-multi-brain.mjs
```
The colony scripts run real full-browser WASM, the production Worker entrypoint and disposable D1. Market HTTP is fixture-backed, NOT live market evidence. Multi-member checks use separate browser contexts and actual inference; they reject nonmembers, duplicate votes and premature finalization. Identical initial brains can naturally produce identical votes; this does not demonstrate independent learned diversity or improved intelligence. These scripts are client-chain verification, not whole-page button verification or physical-phone testing.


Colony deployment requires `0008_federation.sql`, `0009_colony_tasks.sql`, and `0010_colony_auto.sql`, in addition to the FlyDesk migrations described above. Check the actual production schema before applying anything: the recorded deployment has existing tables but no D1 migration history. See the [deployment runbook](docs/cloudflare-deployment.md) and [Colony API and English demo](docs/colony-api-v2.md).

Personal checkpoints use an atomic comparison against the last loaded/saved hash. If another tab has saved a newer branch of brain state, the stale tab is rejected; restart its brain to restore the latest checkpoint. Colony's ephemeral inference continues to leave personal checkpoints unchanged. This protects storage across tabs without changing the checkpoint file format.
