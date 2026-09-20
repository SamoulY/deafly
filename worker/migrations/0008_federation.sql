CREATE TABLE IF NOT EXISTS federation_router (
 router_id TEXT PRIMARY KEY,
 public_key_json TEXT,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS federation_peers (
 peer_id TEXT PRIMARY KEY,
 base_url TEXT NOT NULL,
 public_key TEXT NOT NULL,
 protocol TEXT NOT NULL,
 last_cursor INTEGER NOT NULL DEFAULT 0,
 last_seen_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'CONFIGURED'
);
CREATE TABLE IF NOT EXISTS federation_fly_manifests (
 fly_id TEXT NOT NULL,
 owner_user_id TEXT NOT NULL REFERENCES users(id),
 owner_public_key TEXT NOT NULL,
 genesis_model_hash TEXT NOT NULL,
 checkpoint_hash TEXT NOT NULL,
 parent_checkpoint_hash TEXT,
 sequence INTEGER NOT NULL CHECK(sequence>=0),
 manifest_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(fly_id,sequence)
);
CREATE TABLE IF NOT EXISTS federation_submissions (
 submission_id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL,
 fly_id TEXT NOT NULL,
 checkpoint_hash TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('BUY','SELL','HOLD','CLOSE')),
 payload_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(task_id,fly_id)
);
