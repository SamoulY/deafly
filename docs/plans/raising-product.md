# DeFly Raising Product Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Deliver persistent personal flies, historical teaching, honest training/evaluation, cosmetic progression, and a polished original 3D workstation.

**Architecture:** Extend the existing Pages/Worker/D1 application without replacing unrelated arena integration. Isolate raising sessions from legacy autonomous portfolios. Keep cosmetics out of canonical observations and model inputs. Native full-kernel execution remains explicitly unavailable until actually connected and exercised.

**Tech Stack:** ES modules, Cloudflare Worker/D1, Three.js, node:test, Playwright.

## Delivery gates
- PAPER_ONLY throughout; never touch 99x production accounts or database.
- Real historical data, server-side visibility boundary, no future candles in client payloads.
- Persistent session recovery; invalid tokens never silently destroy existing profiles.
- Four-action raising rules versioned separately from original spot-only specification.
- HOLD never penalized or escalated in raising or evaluations.
- Server-authoritative settlement and immutable demonstrations; fees and adverse slippage.
- Points only for eligible complete profitable human rounds; daily cap, unique task eligibility, atomic purchases.
- Real training on eligible personal demonstrations; immutable versions; held-out frozen evaluation. Honest simplified backend label until full native runner is verified.
- Wardrobe changes leave canonical observation and decision output invariant.
- No production deploy before tests and desktop/mobile browser acceptance.

## Task 1: Raising domain and persistence
Files: worker/src/raising-core.mjs, worker/src/raising.mjs, worker/migrations/0004_raising.sql, tests/raising*.test.mjs.
Use sequential RED/GREEN cases for profile isolation, valid actions, next-bar fills, HOLD, settlement, data-quality rejection, reward caps, duplicate awards, atomic purchase and ownership checks. Implement D1 routes behind existing authentication under /api/raising. Publish route contract in docs/raising-api.md. Exercise real SQLite/D1 concurrency and rollback, not only string assertions.

## Task 2: Training and evaluation
Files: worker/src/raising-training.mjs and focused tests; coordinate persistence through raising module owner.
Create an actual deterministic trainable market-only decision head, frozen train/validation/test splits and immutable checkpoint hashes. Enforce minimum data and class support. Compare cash, simple baseline, pre/post model on unseen later data with fixed rules. Persist jobs and evaluation artifacts; never invent improvement or silently activate candidate models.

## Task 3: Original 3D model refinement
Files: pages/scene.js, new scene helper modules, tests/raising-scene*.test.mjs.
Test exports and cosmetic isolation first, then implement segmented silhouette, faceted compound eyes, articulated legs, shaped translucent veined wings and understated materials. Preserve facing direction and synchronized market texture. Expose setOutfit(loadout) without changing chart/vision. Do not copy reference site's custom assets.

## Task 4: Persistent raising UI
Files: pages/app.js, pages/index.html, pages/style.css, pages/raising-ui.js and tests.
Restore session token before creating an account; allow local API configuration without credential leakage. Add profile, teaching, review, training/evaluation and wardrobe surfaces within existing workspace. Use actual backend responses; loading/error/empty states and no fake progress. Keep English public UI and explicit simulation labels.

## Task 5: Integration and release verification
Run npm test and npm run check. Apply migration to disposable local D1; exercise complete round, replay, reload, purchase/equip, cross-user denial, train/evaluate/restore with real data or explicitly labelled test fixtures. Start local Worker and Pages, verify readiness, run Playwright desktop/mobile including screenshots, WebGL pixel checks, interaction and zero unexpected console errors. Review specification first, quality second; fix all important findings. Deploy only this project if gates pass, then read back deployed behavior. Record any genuine native-runtime blocker separately; do not call G1 complete without it.

## Repository safety
This directory has no Git repository. Do not initialize or overwrite unrelated work. Keep changes scoped and record files/test evidence instead of claiming commits.