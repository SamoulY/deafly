# Personal brain and colony acceptance

## Verified locally

- Full suite after review fixes: 231 passing, zero failing or skipped. `npm run check`: 28 modules. `git diff --check`: clean at verification.
- Actual index.html buttons in Chromium and WebKit: session identity persistence, consent refusal, full WASM personal advancement, explicit checkpoint save, reload, actual restored advancement, colony creation/task/vote/finalization and immutable reopen. Scene canvas initializes WebGL; unavailable fallback is hidden. Screenshots and structured evidence: `personal-colony-page-{chromium,webkit}.{json,png}`.
- Separate browser contexts with two actual full brains: enrollment, same task snapshot, independent signed votes, immutable decision; unauthorized read returns 403, duplicate vote and premature finalization return 409. Evidence: `colony-multi-brain-{chromium,webkit}.json`.
- Group voting does not add executed decisions/orders. Personal autonomous flow is paper trading.

## Defects found and addressed

Checkpoint controls previously bypassed the inference busy state. They now use a serialized command queue. Reward/inference can wait behind checkpoint control; overlapping inference remains rejected. Cancellation rejects queued work. Regression `tests/brain-control-queue.test.mjs` failed before the fix and passed after it.

The verification script previously read hidden fallback text without visibility, incorrectly suggesting a 3D failure. It now asserts WebGL initialization and absent visible fallback and records visibility separately. Actual screenshots show the fly scene. Save/restore checks wait for actual autonomous ACTIVITY advancement rather than assuming an enabled button implies completed inference.

## Boundaries

Markets are declared Kraken HTTP fixtures, not production market proof. Databases are disposable Miniflare D1, but routes and inference are actual implementations. Browser contexts are not physical phones. Signed ballots attest owner authorization, not remote computation. Matching votes from identical initial brains do not prove learned diversity or intelligence improvement. No full weights are uploaded or averaged. No live trades, deployment, DNS changes, or remote migration are included in this acceptance.

Local verification does not imply release. Independent review approved the scoped sequence-recovery and phenotype fixes with no blocking security or logic findings; execution evidence is from the main session. Remote deployment/readback remains a separately authorized gate.

## 中文验收摘要

真实整页与双成员完整脑链路已在 Chromium、WebKit 验证；个人保存/刷新恢复、群体同快照签名投票与落库回读均有证据。行情为测试数据，数据库为临时 D1，不冒称线上验收或真机实测。3D 告警此前是读取隐藏提示造成的误报，截图与可见性断言均确认正常。投票不执行交易，不证明智能提升。

## Reproduction

```sh
node --test --test-concurrency=1 tests/*.test.mjs
npm run check
git diff --check
node scripts/verify-personal-colony-page.mjs
BROWSER_ENGINE=webkit node scripts/verify-personal-colony-page.mjs
node scripts/verify-colony-multi-brain.mjs
BROWSER_ENGINE=webkit node scripts/verify-colony-multi-brain.mjs
```
