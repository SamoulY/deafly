# Colony API and verification

This describes the current implementation. Colony publishes owner-signed decisions; it does not execute trades, attest remote neural computation, or train from human corrections.

## Automatic product flow

Agree to public participation → Start → wait for a decision → optionally Correct → Pause. Membership and signed decisions remain stored after pausing. Personal autonomous trading is paused while automatic Colony decisions are running.

All routes below require the current user session. Register the signed identity using `POST /api/federation/fly-manifest` first. Proofs bind the authenticated owner, fly identity, checkpoint hash and operation-specific fields; public keys and signatures are validated by the server.

| Method / route | Request and result |
| --- | --- |
| `POST /api/colony/auto/enroll` | `{proof}` with purpose `colony-auto-enroll` and `consent: true`; enrolls in `defly-default-v1`. |
| `POST /api/colony/auto/next` | `{}` or `{recover_task_id}`; returns a task, claim, existing personal vote, or a waiting reason. Recovery of an accepted vote avoids repeating inference after an ambiguous response. |
| `GET /api/colony/tasks/:id` | Returns the frozen snapshot, member set, quorum, deadline, status and finalized result. Only task members can read it. |
| `POST /api/colony/tasks/:id/votes` | Signed proof with purpose `colony-vote`, matching task ID and snapshot hash, action and checkpoint hash. One immutable vote per member/fly. |
| `POST /api/colony/tasks/:id/finalize` | Finalizes once all members have voted or the deadline has elapsed; incomplete participation may produce `NO_QUORUM`. |
| `GET /api/colony/tasks/:id/corrections` | Returns the requesting member's original vote and separate correction records. |
| `POST /api/colony/tasks/:id/corrections` | `{vote_id, action, correction_id, note?}`; idempotent by member and correction ID. Does not alter the signed vote or apply learning. |

Actions are `BUY`, `SELL`, `HOLD`, `CLOSE` in the separate Colony/legacy directional domain. The UI labels them LONG, SHORT, HOLD, CLOSE. They must not be interpreted as the FlyDesk spot broker's three-action contract.

Advanced routes remain available: `POST /api/colony` creates a colony with `{quorum, proof}`; `POST /api/colony/:id/join` accepts a membership proof; owner-only `POST /api/colony/:id/tasks` accepts `{symbol, duration_ms}`; `GET /api/colony/:id` returns membership to members. Automatic default-colony membership/tasks use the automatic routes instead. The old unsigned `/api/colony/submissions` and `/api/colony/vote` routes are disabled.

## Checkpoints

The personal brain uses IndexedDB, scoped to the session owner. Each persistent write compares the last loaded/saved hash inside the same readwrite transaction before replacing state. Concurrent stale writers fail with a visible error; restarting restores current state. Two branches with equal simulation time are still different when their hashes differ. No checkpoint schema migration is required for existing saved brains.

Colony starts an ephemeral runtime from the personal checkpoint, captures its input checkpoint hash and computes the ballot. Its transient inference does not overwrite the personal checkpoint. Signed reports are not proof that a remote browser executed the kernel faithfully.

## Verification and deployment

Install both browser engines with `npx playwright install chromium webkit`. Run `npm test`, `npm run check` and `npm run worker:build`. Cross-tab checkpoint tests use real IndexedDB in Chromium and WebKit; Worker lifecycle tests additionally use small deterministic brain adapters. These are separate from full-network neural tests and do not establish trading profitability.

Verification on 2026-09-29: the full suite passed 285/285 with no skips. The application syntax check and Worker build passed. `verify-checkpoint-lifecycle.mjs` passed in both Chromium and WebKit using the actual full-brain runtime: saved and restored hashes matched, all 26 checkpoint entries were retained, and observation scope could not save personal state. No production deployment or database migration was performed for this fix.

Required Colony migrations are `0008_federation.sql`, `0009_colony_tasks.sql`, and `0010_colony_auto.sql`. Check the [Cloudflare runbook](cloudflare-deployment.md) before remote migrations; existing tables and an empty migration ledger require schema reconciliation, not blind reapplication.

The original design and prior acceptance notes remain available in Git history: [technical specification](https://github.com/SamoulY/deafly/blob/e744781/docs/design/FlyDesk-v1-technical.md), [product specification](https://github.com/SamoulY/deafly/blob/e744781/docs/design/FlyDesk-v1-product.md), and [earlier personal/Colony acceptance notes](https://github.com/SamoulY/deafly/blob/5595f3b/docs/personal-colony-acceptance.md). Historical evidence is not acceptance of the current revision.
