# Colony API v2 — implemented contract

All endpoints below require the existing `X-Session-Token`. `/api/state` returns `{user:{id,nickname},portfolio:…}`; use `user.id`, never the bearer token, as `owner_user_id`. Apply migration `0009_colony_tasks.sql` after existing migrations. Colony data is local to this router's D1; this is not cross-router task replication.

## Signed identity

First POST `/api/federation/fly-manifest` with `signManifest(identity,{owner_user_id,checkpoint_hash,sequence})`. Identity comes from the browser's existing session-scoped personal fly (real manifest genesis hash). `checkpoint_hash` is the SHA-256 returned by the full brain's `saveCheckpoint()`, not an invented hash. Sequence is a nonnegative integer strictly greater than the registered sequence. Returns 201 `{accepted:true,authority:"OWNER_SIGNED",fly_id,sequence}`; stale sequence returns 409 `SEQUENCE_CONFLICT` (current sequence in response).

Proofs use `defly-federation-v1`: P-256 ECDSA SHA-256, base64url signature over `signed_payload`, canonical recursively sorted JSON. Signed fields include fly identity, public key, genesis hash, nonce, owner ID, sequence, checkpoint hash and the operation fields below. Private keys never leave the browser. Ownership/public key and member fly identity are pinned. Signatures establish owner authorship, **not remote inference attestation**.

## Automatic user workflow

The English-only FLY DECISIONS panel replaces manual colony/task ID entry. After explicit public-participation consent, Start enrolls the registered fly and automatically claims server snapshots. Pause stops subsequent claims/submissions; personal autonomy and automatic decisions use exclusive local-brain ownership. Human corrections are separate append-only feedback, not replacement ballots or verified training.

Apply `0010_colony_auto.sql` after `0009_colony_tasks.sql` before deploying this workflow. `POST /api/colony/auto/enroll` accepts a signed `{proof}` with purpose `colony-auto-enroll` and `consent:true`. `POST /api/colony/auto/next` accepts `{}` or `{recover_task_id}` for an ambiguous submission. Recovery is restricted to the caller's frozen membership and returns an existing own ballot even after finalization. Normal dispatch retains frozen membership, a 0.5 quorum, five-minute deadline, and bounded generation attempts. A late member waits for a future round.

`POST /api/colony/tasks/:id/corrections` accepts `{vote_id,action,correction_id,note?}`; only the original ballot owner can append feedback. Idempotent retries use the same correction ID. The response explicitly includes `learning_applied:false`. No orders are executed by this workflow.

## Routes

| Method/path | Body | Result |
|---|---|---|
| POST `/api/colony` | `{quorum,proof}` where proof purpose=`colony-create`, signed quorum equals body quorum | 201 `{colony_id}`; creates colony and joins creator |
| POST `/api/colony/:colony_id/join` | `{proof}` purpose=`colony-join`, signed `colony_id` | 201 `{colony_id,fly_id}`; same membership returns 200 |
| GET `/api/colony/:colony_id` | — | Member-only colony row, owner ID, quorum, members `{member_user_id,fly_id}` |
| POST `/api/colony/:colony_id/tasks` | **only** `{symbol,duration_ms}` | Owner-only; 201 task view. Server fetches market and freezes snapshot/membership/quorum |
| GET `/api/colony/tasks/:task_id` | — | Frozen-member-only task view |
| POST `/api/colony/tasks/:task_id/votes` | **signed manifest itself**, not `{proof}`; purpose=`colony-vote`, `task_id`, `snapshot_hash`, `checkpoint_hash`, `action` | 201 `{accepted:true,vote_id,task_id,authority:"OWNER_SIGNED_REPORT"}` |
| POST `/api/colony/tasks/:task_id/finalize` | `{}` | Frozen-member-only; task view with immutable result/hash |

`quorum` is finite, >0 and <=1. `duration_ms` is a safe integer 1000–3600000. Market symbols must be supported by the server market adapter (demo uses `BTCUSD`). Clients cannot supply snapshot/bars. Task view: `task_id,colony_id,snapshot,snapshot_hash,members,quorum,required,deadline,created_at,status,result,result_hash,rule_version,authority,paper_only`. Deadline is epoch milliseconds; status is `OPEN` or `FINALIZED`. Snapshot contains `bars`. Its hash is SHA-256 of **canonical sorted JSON**, not insertion-order JSON.

## Vote lifecycle and aggregation

UI requires explicit consent before registration/create/join. Share colony ID, enroll members, then create a task: later joins cannot vote on earlier tasks. Share task ID for members to open. The browser stops individual auto-run, drains in-flight work, restores the actual owner checkpoint in the existing full WASM brain, saves its pre-inference checkpoint, rasterizes the frozen task bars using `encodeMarketObservation({candles:snapshot.bars,snapshot_hash})`, infers, and signs the returned decoder action. No missing-action HOLD fallback. The saved hash identifies the state **before** inference. Colony inference is not a reinforcement step and its transient state is discarded; individual auto-run does not restart automatically.

Actions: `BUY`, `SELL`, `HOLD`, `CLOSE`. One append-only ballot per frozen member/task. Duplicate/closed ballots return 409; nonmembers/owner mismatch 403; malformed signatures/bindings 422. Missing colony/task 404. Before deadline, finalize requires **all** frozen members to vote (not merely quorum); otherwise 409 `TASK_NOT_READY`. After deadline any frozen member can finalize. Late votes are rejected.

Required participation = ceil(member_count × quorum). Below it gives action `HOLD`, result status `NO_QUORUM`. Otherwise only strict majority of submitted ballots wins; tie/no majority gives `HOLD`. Result includes counts, total, participation, required, agreement_rate, checkpoint_diversity, rule_version=`colony-v2`, task_id, snapshot_hash, quorum, member_count, authority=`OWNER_SIGNED_REPORT`, paper_only=true. A HOLD action's result status is `HOLD`; other winning actions have result status `FINALIZED`. Task status is always `FINALIZED` after successful finalization. Result hash is canonical JSON SHA-256. Repeated finalize/read returns the same immutable result. No orders are executed.

Legacy POST `/api/colony/submissions` and `/api/colony/vote` remain disabled (503 `COLONY_V2_NOT_READY`); they are not v2 APIs. There is no vote-list endpoint or automatic group execution endpoint.

## Demo / 演示

1. Open two independent browser profiles on the same router. / 两个独立浏览器配置访问同一路由。
2. A checks consent and CREATE + JOIN; share colony ID. B checks consent and JOIN. / A 同意并创建，B 输入群体 ID 同意加入。
3. A CREATE SERVER TASK after B joins; share task ID. / 成员加入后由创建者生成服务器任务，分享任务 ID。
4. Each opens task, clicks RUN MY FULL BRAIN + SIGN VOTE. Keep tab visible; real model load needs memory/time. / 各成员打开任务运行真实完整本地脑并签名；保持页面可见。
5. After all votes or deadline, FINALIZE / FETCH RESULT. Review immutable counts/hash; no trade is sent. / 全票或到期后汇总，核对不可变结果；不发送交易。

Colony/task IDs and manifest sequence are saved per owner + fly locally. Clearing storage loses private identity/checkpoints; no cloud recovery. Concurrent tabs registering the same identity can yield sequence conflicts; do not silently switch identities. Automated client tests use real signatures and D1 service with explicitly fixture inference; UI tests use a clearly fixture backend, not evidence of a full-model browser run.
