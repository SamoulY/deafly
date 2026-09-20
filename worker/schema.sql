PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolios (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  cash REAL NOT NULL DEFAULT 10000 CHECK(cash >= 0),
  quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  avg_cost REAL NOT NULL DEFAULT 0 CHECK(avg_cost >= 0),
  revision INTEGER NOT NULL DEFAULT 0,
  position_side TEXT NOT NULL DEFAULT 'FLAT' CHECK(position_side IN ('FLAT','LONG','SHORT')),
  position_qty REAL NOT NULL DEFAULT 0 CHECK(position_qty >= 0),
  entry_price REAL NOT NULL DEFAULT 0,
  take_profit REAL NOT NULL DEFAULT 0,
  stop_loss REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  mode TEXT NOT NULL CHECK(mode IN ('TRADE','PREDICTION')),
  action TEXT NOT NULL,
  symbol TEXT,
  market_id TEXT,
  server_price REAL,
  fee REAL NOT NULL DEFAULT 0,
  state_json TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS prediction_markets (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  slug TEXT NOT NULL,
  end_date TEXT NOT NULL,
  yes_price REAL NOT NULL,
  no_price REAL NOT NULL,
  volume REAL NOT NULL DEFAULT 0,
  liquidity REAL NOT NULL DEFAULT 0,
  observed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prediction_positions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  market_id TEXT NOT NULL REFERENCES prediction_markets(id),
  side TEXT NOT NULL CHECK(side IN ('YES','NO')),
  stake REAL NOT NULL CHECK(stake > 0),
  entry_price REAL NOT NULL CHECK(entry_price > 0 AND entry_price < 1),
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model_states (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  policy_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  policy_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS autonomous_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('RUNNING','STOPPED')),
  step_count INTEGER NOT NULL DEFAULT 0,
  last_equity REAL NOT NULL,
  last_action TEXT,
  last_features_json TEXT,
  last_decision_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS autonomy_step_claims (
  run_id TEXT NOT NULL REFERENCES autonomous_runs(id),
  slot INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(run_id, slot)
);

CREATE TABLE IF NOT EXISTS learning_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  run_id TEXT,
  decision_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('REWARD','PUNISHMENT','CORRECTION')),
  source_action TEXT,
  corrected_action TEXT,
  reward REAL NOT NULL,
  equity_before REAL,
  equity_after REAL,
  policy_version_before INTEGER NOT NULL,
  policy_version_after INTEGER NOT NULL,
  policy_hash_after TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prediction_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  prediction_id TEXT NOT NULL,
  prediction_action TEXT NOT NULL CHECK(prediction_action IN ('YES','NO')),
  outcome TEXT CHECK(outcome IN ('YES','NO','VOID')),
  reward REAL NOT NULL DEFAULT 0,
  settled_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS prediction_feedback_user ON prediction_feedback(user_id, settled_at DESC);

CREATE TABLE IF NOT EXISTS published_observations (
  id TEXT PRIMARY KEY,
  backend TEXT NOT NULL,
  truth_status TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  checkpoint_hash TEXT NOT NULL,
  memory_hash TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  frame_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS published_observations_created ON published_observations(created_at DESC);

CREATE INDEX IF NOT EXISTS autonomous_runs_user ON autonomous_runs(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS learning_events_user ON learning_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS decisions_user_created ON decisions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prediction_markets_volume ON prediction_markets(volume DESC);
CREATE INDEX IF NOT EXISTS prediction_positions_user ON prediction_positions(user_id, status);
