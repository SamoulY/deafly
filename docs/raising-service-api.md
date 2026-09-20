# Raising Service API

All endpoints require the existing authenticated session. All responses are JSON. Paper-only, market-only reference readout, not native G1.

## Training

`GET /api/raising/training` returns `{jobs,versions,active_version,eligibility,backend,paper_only}`.
- `jobs`: newest-first, up to 50 objects `{id,status,created_at,completed_at,parent_version_id,result,error}`. Status: QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED. `result` is null until completion, then includes `checkpoint_hash,parent_hash,data_hash,split_manifest,metrics`.
- `versions`: `{id,checkpoint_hash,training_id,created_at}`. `active_version` is one such object.
- `eligibility`: `{eligible_count,min_train:64,min_validation:16,capacity:2000,capacity_exceeded,excluded_sessions,exclusion_counts}`. Counts describe canonical whole-session evidence, not all stored demonstrations. Exclusions retain original review evidence. Reason codes: `EVAL_EXPOSED`, `OVERLAPPING_SESSION`, `DUPLICATE_OBSERVATION`, `INVALID_EVIDENCE`. `excluded_sessions` entries are `{session_id,reason}`; `exclusion_counts` maps reason to excluded session count.

`POST /api/raising/training` body `{idempotency_key:"unique-per-deliberate-attempt"}`. Reuse the key after timeout. Returns 202 `{job:{id,status}}`; repeated key returns 200 same shape. No candidate is automatically activated. Poll GET. 422 `INVALID_IDEMPOTENCY_KEY`; 409 `INSUFFICIENT_ELIGIBLE_HISTORY` or `DATASET_CAPACITY_EXCEEDED`. Capacity policy preserves complete replay; no silent truncation. Beyond 2000 canonical rows, no new job is created.

## Evaluation

`POST /api/raising/evaluations` body `{training_id:"completed-job-id"}`. Returns 201 `{evaluation:{id,training_id,status:"COMPLETED",result}}`. Returns 409 for insufficient unseen history or exposure conflict, 503 `HISTORY_UNAVAILABLE` for upstream failure. Evaluation is synchronous and reserves unseen closed candles atomically. `GET /api/raising/evaluations` returns `{evaluations:[{id,training_id,status,result,created_at,error}]}` newest first, max 50. Render the honest result status, pre/post and baseline metrics. `result.evaluator_scope` is `REFERENCE_ENGINE_NEXT_MINUTE_NOT_CORE_FIVE_MINUTE`.

## Activation

`POST /api/raising/versions/:id/activate` body `{}` returns `{active_version:{id,checkpoint_hash,backend}}`. URL-encode version IDs. ID `0` restores this user's default version. 404 for absent/foreign versions; 409 `CHECKPOINT_CORRUPT`. Restoring zero does not reset global holdout assignments or exposure claims.
