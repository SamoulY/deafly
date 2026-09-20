# Raising Spec Compliance Review

## Scope and Verdict

Independent source review of the current, concurrently edited raising implementation. No production changes or deployment. This report is the only repository file changed by the reviewer. Line references describe the snapshot inspected and should be rechecked after implementation agents finish.

Sources: `docs/plans/raising-product.md`, `docs/raising-api.md`, `docs/raising-training-api.md`; `worker/src/raising.mjs`, `raising-core.mjs`, `raising-training.mjs`, `raising-training-service.mjs`, relevant `index.mjs` routes; migrations `0004_raising.sql` and `0005_raising_training.sql`; `pages/raising-ui.js`, `session-client.js`, `app.js`, and relevant tests.

No P0 established. Three P1 integration issues should block release of the complete training loop. Findings below are source-grounded; the focused tests do not cover the failure paths. Native G1 execution is explicitly out of scope and remains a compute-host blocker, not a defect attributed to this simplified implementation.

## P1 Findings

### 1. Reserved evaluation intervals are not enforced when teaching or training

- Evidence: `worker/src/raising-training-service.mjs:97` loads all completed human records without consulting `raising_interval_claims`; line 126 calls `trainDecisionHead` without `usedIntervals`. `worker/src/raising.mjs:58` creates sessions without interval claims. `worker/migrations/0005_raising_training.sql:9` only protects inserts into the claim table; the service inserts EVAL claims at line 91 but never TRAIN claims.
- Contract: `docs/raising-training-api.md:14` and line 15 require previously consumed evaluation intervals to stay out of later training and require atomic reservations. The pure trainer implements the check at `raising-training.mjs:91`, but the adapter omits it.
- Failure path: evaluate an unseen recent interval, then start and finish a teaching session whose sliding Kraken history covers it. Its demonstrations enter the next job, including model-selection validation, despite the reserved test interval. Concurrent session creation during evaluation also bypasses the evaluation handler's earlier session-history snapshot.
- Fix: use one authoritative exposure registry for session creation, training snapshots, and evaluation. Reserve teaching/training intervals transactionally with their writes; reject or exclude EVAL-overlapping scenarios; pass the current reserved evaluation intervals to the pure trainer and revalidate at job execution. Preserve full-session boundaries.
- Regression: EVAL then overlapping teaching/train; queued job followed by conflicting claim; racing session creation and evaluation. Assert neither split can contain an exposed evaluation interval and that conflicting transactions roll back.
- Verification: source-inspected. An additional disposable-D1 reproduction command was denied and was not retried; no experimental reproduction is claimed.

### 2. A normal replay can permanently poison the full personal training dataset

- Evidence: `raising-core.mjs:33` sets demonstration eligibility from real/complete provenance, including practice rounds. `raising-training-service.mjs:98` selects every completed session and line 108 forwards every demonstration unchanged. `raising-training.mjs:83` requires globally strictly increasing observation timestamps and line 85 rejects duplicate observation hashes.
- Failure path: finish a round and immediately repeat the same symbol/window with the same choices, or teach BTC and ETH windows with matching minute timestamps. Both are valid product interactions, but the combined dataset contains equal timestamps; same-window replay can also duplicate hashes. Every later job includes the offending immutable records and fails. This is not merely the intended rejection of overlapping train/validation scenarios.
- Fix: establish a deterministic canonical dataset selection policy before queueing. Deduplicate replay evidence, reconcile equal-time observations across symbols without leaking symbol IDs into features, and choose whole sessions with valid split boundaries. Retain excluded records for review with explicit exclusion reasons. Do not fix this by replicating rows or weakening held-out interval separation.
- Regression: generate completed records through the real raising core, repeat a window, add adequate nonoverlapping later history, and prove a valid training job can still complete. Include same-time BTC/ETH sessions.
- Related capacity gap: service line 31 rejects all future training once the accumulated eligible count exceeds 2000, with the misleading error `INSUFFICIENT_ELIGIBLE_HISTORY`. Define a supported retention/selection policy consistent with full parent replay instead of silently reaching a permanent ceiling.

### 3. The current TRAIN button cannot create a training job

- Evidence: `pages/raising-ui.js:72` POSTs `{}`. `worker/src/raising-training-service.mjs:27` requires a nonempty `idempotency_key` and returns 422 `INVALID_IDEMPOTENCY_KEY` otherwise. `pages/session-client.js:7` serializes the body but does not add a key.
- Impact: even a user with sufficient valid demonstrations cannot train through the shipped UI.
- Fix: generate and retain a request key for the pending training attempt, reuse it after an ambiguous transport failure, and reset it only for a deliberate new job. Render the returned job state rather than calling a queued request completed training.
- Regression: exercise the actual click handler against the service contract, including timeout/retry and only one persisted job.
- Status: concrete mismatch in the current snapshot; frontend implementation may still be in progress.

## Other Gaps and Pending Work

### P2: Frozen assignments are only enforced along the selected parent chain

`raising-training.mjs:96` protects parent checkpoint assignments, but `raising-training-service.mjs:43` permits restoring version zero and line 32 uses that version as the next parent. No global observation split registry exists in migration 0005. With more data, training again from zero can move previously validated rows into training. This does not bypass the pure function's parent contract, but it misses the service's global split-assignment responsibility in `docs/raising-training-api.md:21`. Persist per-user assignments independently of activation, or explicitly version disjoint experiment datasets and forbid claims of a common frozen holdout. Test reset-to-zero after adding history.

### Pending UI: evaluation, restore, and job lifecycle presentation

`pages/raising-ui.js:62` renders the training GET response as raw JSON. There are no evaluation request/results controls or checkpoint activation controls, although service endpoints exist. Treat this as pending implementation under product-plan Tasks 2/4, not a completed feature regression. Acceptance should include queued/running/failed/completed states, explicit candidate activation/restore, frozen pre/post/cash/buy-hold evidence, and the honest improvement status.

### P2: Entering raising through a session callback leaves legacy autonomy enabled

`pages/app.js:60` changes mode and unchecks/hides the lab without calling `stopAuto`; only the explicit opt-out handler at line 541 stops it. Starting or opening a teaching round while the lab is running can leave its server-side scheduled autonomy enabled. `worker/src/index.mjs:595` continues scheduling legacy autonomy. Portfolios are separate, so this is not a demonstrated raising accounting corruption, but UI state no longer represents whether the opted-in lab is still running. Route every lab exit through one explicit stop/transition routine and test server disable as well as timer cleanup.

### Test defect: routing fixture no longer supports the catalog contract

`tests/raising-routing.test.mjs:15` permits only the authentication SQL. The real handler now queries `raising_catalog` at `worker/src/raising.mjs:25`; the mock assertion throws and the Worker returns 502. The isolated rerun confirms this is a stale mock, not evidence that authenticated routing itself is broken. Use the migrated disposable D1 database or a mock that also implements catalog `.all()`.

## Capability Matrix

All rows are specified. Remote deployment was not checked for any row.

| Capability | Implemented | Locally verified | Not implemented / remaining |
| --- | --- | --- | --- |
| Profile, catalog, ownership, equip | Yes | Focused D1 tests pass | Full browser acceptance not run here |
| Atomic points/purchases, family reservation | Yes | Focused cap, duplicate, purchase tests pass | No broad economic-abuse audit claimed |
| Session ownership, visibility, next-open fills, settlement | Yes | Focused D1 tests pass | Browser lifecycle acceptance not run here |
| Immutable human/system evidence | Yes | Focused immutability and settlement tests pass | No replay-to-training end-to-end coverage |
| Core-to-training observation adapter | Yes | Source inspected; service uses its own fixtures | Replay canonicalization and real-core fixture test |
| Pure deterministic training and frozen evaluation | Yes | Focused training tests pass | No profitability or native-model claim |
| Jobs, versions, activation, leases | Yes | Focused service tests pass | Global split registry / exposure enforcement |
| Session-token persistence and recovery | Yes | Focused session-client tests pass | No live browser/API deployment check |
| User-facing training/evaluation/restore | Partial | Controller/view tests pass, not complete workflow | Invalid train payload; evaluation/restore controls pending |
| Native G1 | Explicitly unavailable | Not exercised | Compute host; excluded from release claims |

## Confirmed Contract Alignment

- `raising-core.mjs:33` now stores `visible_bars`; the adapter at `raising-training-service.mjs:104` consumes that exact field. No missing-visible-bars integration defect exists in this snapshot.
- Active session responses slice bars to `30 + step * 5` at `raising-core.mjs:42`; `data_json` is not serialized to clients. Completed review is ownership checked and only available after completion.
- The adapter maps `observation.position.side`, cash, entry price, and timestamp to the seven-feature training schema. It recomputes features from closed visible bars and attaches full scenario intervals, rather than using rewards or cosmetics as model inputs.
- SYSTEM liquidation is not a HUMAN label. Synthetic fixtures fail training provenance eligibility and cannot earn session points.
- Checkpoint creation does not silently activate the candidate. Pure evaluation reports `NO VERIFIED IMPROVEMENT`; the service labels its one-minute reference engine as distinct from core five-minute teaching.
- Saved session tokens are restored before account creation; invalid tokens raise an explicit recovery error rather than silently replacing the identity.
- Database ownership/purchase triggers provide the atomic debit path even though purchase code itself only inserts ownership. This is not a missing-debit bug.

## Verification and Limits

Executed the focused backend, service, training, UI-controller, UI-session, UI-view, and routing suites with Node's dot reporter. All selected tests except the catalog routing fixture passed. Reran routing alone: one passed, one failed, with the exact unexpected catalog SQL assertion shown above. No giant full-suite run, browser screenshots, remote calls, migration deployment, or profitability verification performed.

The additional local-D1 leakage probe was blocked by tool approval; no substitute probe was attempted. This directory has no Git repository, as the product plan explicitly documents; the attempted status command confirmed that, so no diff/commit claims are made. Concurrent edits may supersede findings. Recheck the referenced lines and run end-to-end real-core-to-service tests before closing these issues.