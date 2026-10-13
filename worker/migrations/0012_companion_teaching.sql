-- Observation and teaching are independent of both paper execution and training.
CREATE TABLE IF NOT EXISTS companion_contexts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  snapshot_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS companion_contexts_owner ON companion_contexts(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS companion_lessons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  context_id TEXT NOT NULL UNIQUE REFERENCES companion_contexts(id),
  action TEXT NOT NULL CHECK(action IN ('BUY','SELL','HOLD')),
  idempotency_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS companion_lessons_owner ON companion_lessons(user_id, created_at DESC);
