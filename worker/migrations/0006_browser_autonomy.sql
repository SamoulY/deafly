CREATE TABLE IF NOT EXISTS browser_autonomy_runs (
 run_id TEXT PRIMARY KEY REFERENCES autonomous_runs(id),
 backend TEXT NOT NULL,
 manifest_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS browser_autonomy_challenges (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 run_id TEXT NOT NULL REFERENCES autonomous_runs(id),
 snapshot_hash TEXT NOT NULL,
 observed_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 portfolio_revision INTEGER NOT NULL,
 consumed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS browser_autonomy_receipts (
 challenge_id TEXT PRIMARY KEY REFERENCES browser_autonomy_challenges(id),
 decision_id TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL,
 run_id TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 response_json TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS browser_receipt_guard BEFORE INSERT ON browser_autonomy_receipts
BEGIN
 SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM browser_autonomy_challenges c
 JOIN autonomous_runs r ON r.id=c.run_id
 JOIN browser_autonomy_runs b ON b.run_id=r.id
 JOIN portfolios p ON p.user_id=c.user_id
 WHERE c.id=NEW.challenge_id AND c.user_id=NEW.user_id AND c.run_id=NEW.run_id
 AND r.user_id=NEW.user_id AND r.status='RUNNING' AND c.consumed=0
 AND c.expires_at>=NEW.created_at AND p.revision=c.portfolio_revision
 ) THEN RAISE(ABORT,'BROWSER_CHALLENGE_CONFLICT') END;
END;
CREATE TRIGGER IF NOT EXISTS browser_receipt_consume AFTER INSERT ON browser_autonomy_receipts
BEGIN
 UPDATE browser_autonomy_challenges SET consumed=1 WHERE id=NEW.challenge_id;
END;
CREATE INDEX IF NOT EXISTS browser_challenge_expiry ON browser_autonomy_challenges(expires_at);
