# Raising Backend Quality Review

## Verdict and Scope

Approve the reviewed round-accounting and wardrobe paths with the limitations below. No concrete P0/P1 accounting, authorization, purchase, or idempotency defect was established. This is not approval of the separate training implementation, production deployment, or economic resistance to users consulting public historical prices.

Reviewed `worker/src/raising-core.mjs`, `worker/src/raising.mjs`, migration `0004_raising.sql`, `tests/raising-backend.test.mjs`, the API contract, and the Worker routing/error boundary. Existing training findings in `docs/raising-spec-review.md` are deliberately not duplicated. References describe this working-tree snapshot; concurrent edits may supersede them.

## Confirmed Properties

- Purchase atomicity: `0004_raising.sql:8` checks the current ledger balance within the ownership insertion, and line 9 writes the debit in its AFTER INSERT trigger. Ownership has a composite primary key; already-owned retries skip the balance check and do not fire a second successful insert/debit. The handler's insert-only purchase implementation is intentional, not a missing debit (`raising.mjs:32`).
- Units are separate: account cash/equity and allocation are simulated USD-like quote amounts; catalog costs and ledger amounts are integer cosmetic points. No real-money settlement was reviewed.
- Action concurrency: `raising.mjs:82` compares persisted step/status and assigns a fresh token. Demonstration, settlement, and reward writes require that token within the same D1 batch. Losing concurrent actions cannot independently append evidence or award points. Canonical action/step plus the per-session unique request key enforce retry semantics. A successful retry returns current state, as documented, not an original response snapshot.
- Reward limits: `raising.mjs:86` gates on final, post-liquidation net equity and maximum drawdown. The ledger INSERT computes the remaining UTC-day REWARD allowance inside the write, independent of purchase debits, with an immutable `reward:<session>` key. Scenario reservations and one-active-session constraints prevent a second reward for the same user/family. Synthetic sessions cannot earn points.
- Short accounting: `raising-core.mjs:23` caps entry notional at 1000 and reserves entry notional plus fee. Mark-to-market restores locked collateral plus signed P&L; closing returns collateral plus signed realized P&L less closing fees. Opening short does not incorrectly add sale proceeds to spendable cash. Both entry and exit use adverse slippage and fees. This is an allocation cap, not a guaranteed maximum short loss; no liquidation/limited-loss guarantee is established.
- Future visibility and ownership: active responses slice the stored history at the decision boundary (`raising-core.mjs:42`); full data JSON is not serialized. Actions fill at the next unseen open, not the already-visible close. Review is owner-scoped and completed-only. Public historical prices remain externally discoverable; this is not a secure hidden-price competition.
- Evidence: explicit HUMAN labels, visible bars, observation/snapshot hashes, fills, and fees are persisted separately from final SYSTEM settlement. SQL triggers reject UPDATE/DELETE of demonstrations, system actions, and points. This protects those tables through ordinary SQL but is not cryptographic protection against a privileged database operator; session data/state themselves are mutable.
- External availability: Kraken HTTP errors, JSON failures, provider errors, and fetch timeout return unavailable rather than synthetic fallback. Closed history is checked for count, continuity, numeric finiteness, and OHLC consistency.

## Nonblocking Error-Handling Gap

`raising.mjs:110` indexes each provider row before validating its structure. A null row throws a TypeError; the session creation catch at line 56 returns its message as the error code with status 503 rather than the documented 422 `HISTORY_INCOMPLETE`. This fails closed before session insertion, so it is not an accounting corruption. Validate provider row arrays before indexing and map exceptions to stable public error codes. This edge is source-inspected, not experimentally reproduced.

## Verification and Limits

Executed `node --test tests/raising-backend.test.mjs`: 5 tests passed, 0 failed. This covers malformed missing OHLC data, short entry/exit fees and collateral, unavailable/gapped history, concurrent session creation, daily cap clipping from 98 to 100, family reservation, concurrent identical action retries, future slicing, next-open execution, separate settlement, user isolation, concurrent same-item purchases, and selected immutable-table checks.

An additional disposable-Miniflare probe for distinct-item overspend races, distinct-action races, rollback on evidence insertion failure, and malformed null provider rows was denied by tool approval. It was not retried and produced no execution evidence. These additional concurrency/rollback paths remain source-inspected only. No broad full-suite, production load/concurrency, midnight-boundary, provider-shape matrix, or privileged-tampering test was performed here.

The parent reported a successful actual Kraken integration round; this review does not claim to have independently rerun it. No production calls, production writes, deployments, native-model execution, or model-quality claims were made. The directory is not a Git repository, confirmed by `git status`; no diff or commit verification is claimed.

Only this review document was created by this reviewer. Application code, tests, and migrations were not changed.
