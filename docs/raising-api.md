# Raising API Contract

Integration: import `handleRaising` from `worker/src/raising.mjs`; call `await handleRaising(request, env, user)` after authentication. `user.id` is mandatory. Requires `env.DB` and migration `0004_raising.sql`. Returns JSON Response for known raising routes, null for other routes (including training). Responses use `{ error: CODE, message }` on errors. All data is PAPER_ONLY. Times are epoch milliseconds except OHLC bar `time` (epoch seconds).

## Profile and wardrobe
- GET `/api/raising/profile` -> `{profile:{fly_id,user_id,name,created_at,loadout:{head,face,body,background}},points:number,owned:string[],active_session_id:string|null}`. Creates a free default profile if absent. Loadout values are catalog IDs.
- POST `/api/raising/profile` `{name:string}` (trimmed, 1..40 chars) -> same response.
- GET `/api/raising/catalog` -> `{items:[{id,slot,name,cost}],cosmetic_only:true}`. Four slots, three items each, one free default per slot.
- POST `/api/raising/purchase` `{item_id:string}` -> same profile response. Already owned is an idempotent success. Insufficient balance 409. Debit and ownership atomic.
- POST `/api/raising/equip` `{item_id:string}` -> same profile response. Unowned item 409.

## Historical teaching
- GET `/api/raising/sessions` -> `{sessions:[{id,status,created_at,completed_at,step,symbol,scenario_family,reward_points}],active_session_id}` newest first, max 50.
- POST `/api/raising/sessions` `{symbol?:"BTCUSD"|"ETHUSD"}` -> session response (201 new, 200 existing active). Fetches Kraken public one-minute closed OHLC. Failure returns 503 `HISTORY_UNAVAILABLE`; insufficient/gapped/bad data returns 422 `HISTORY_INCOMPLETE`. Never falls back to generated data. One active session/user.
- GET `/api/raising/sessions/:id` -> session response. Other users see 404.
- POST `/api/raising/sessions/:id/actions` `{action:"BUY"|"SELL"|"HOLD"|"CLOSE",step:integer,idempotency_key:string}` -> updated session response. Key length 1..100. Retries with same key/body return current session, conflicting key reuse or stale step returns 409. BUY opens long; SELL opens collateralized short, only while FLAT; CLOSE only while positioned; HOLD always available. Invalid mask action 422.
- GET `/api/raising/sessions/:id/review` -> `{session:<session response>,demonstrations:[...],system_actions:[...],equity_curve:[...]}`. Only completed rounds (409 otherwise). Review contains full historical data through `session.bars`, immutable records, fees and fills.

Session response: `{id,status:"ACTIVE"|"COMPLETED",symbol,scenario_family,step,total_steps:12,decision_interval_minutes:5,bars:[{time,open,high,low,close,volume}],observation:{version,time,features:{return_1,return_5,volatility_5},position:{side,quantity,entry_price},cash,equity,action_mask:string[]},observation_hash,account:{cash,side,quantity,entry_price,equity,max_drawdown},reward_points,reward_eligible,provenance:{provider,synthetic,data_complete},created_at,completed_at}`. `bars` contains ONLY already visible closed bars while active. Future bars stay in D1. Decision fills occur at next minute open, with adverse slippage (5bps) and fee (10bps). Initial cash 10000; fixed maximum allocation 1000, no leverage. Each action reveals five further minutes. Final liquidation is a separate SYSTEM action, not a human demonstration.

Demonstrations: `{session_id,step,observation,observation_hash,market_snapshot_hash,action_mask,human_action,proposal:null,executed_action,source:"HUMAN",fill,fees,equity_before,equity_after,reward,eligible,features,label,created_at}`. Labels are explicit human choices, never inferred from final profit. Canonical features exclude cosmetics and future bars. System actions are not eligible labels. `equity_curve` records every revealed minute plus final settlement, tracking peak-to-trough MDD.

Eligibility is reserved at start per user and stable scenario family (symbol + UTC date + rules version). Replaying the same family is practice, never a second reward. Only fully complete real-data HUMAN rounds with at least eight explicit valid decisions, positive net return and MDD <=20% can earn `ceil(1000 * fractional_return)`, capped at 50/round and 100/UTC day. Synthetic test fixtures NEVER earn points. No inactivity penalties.

## Training integration
Training routes are intentionally not handled here. Tables: `raising_profiles`, `raising_catalog`, `raising_ownership`, `raising_points`, `raising_sessions`, `raising_reservations`, `raising_demonstrations`, `raising_system_actions`. Training may query completed session records and immutable demonstration `record_json`; eligible records expose features and human label. `raising_sessions.data_json` is SERVER-ONLY and includes full bars. `state_json` stores account and minute curve. No training schema is reserved by this migration; training module owns its persistence.

For deterministic LOCAL TESTS ONLY, `env.RAISING_TEST_HISTORY` may hold `{bars,symbol}` when `env.RAISING_TEST_MODE === 'local-only'`; provenance is forcibly synthetic and rewards disabled. Never configure these production bindings.
