CREATE TABLE colonies (
 colony_id TEXT PRIMARY KEY,
 owner_user_id TEXT NOT NULL,
 quorum REAL NOT NULL CHECK(quorum > 0 AND quorum <= 1),
 created_at INTEGER NOT NULL
);
CREATE TABLE colony_members (
 colony_id TEXT NOT NULL REFERENCES colonies(colony_id),
 member_user_id TEXT NOT NULL,
 fly_id TEXT NOT NULL,
 proof_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(colony_id,member_user_id),
 UNIQUE(colony_id,fly_id)
);

CREATE TABLE colony_tasks (
 task_id TEXT PRIMARY KEY,
 colony_id TEXT NOT NULL REFERENCES colonies(colony_id),
 snapshot_json TEXT NOT NULL,
 snapshot_hash TEXT NOT NULL,
 members_json TEXT NOT NULL,
 quorum REAL NOT NULL,
 deadline INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','FINALIZED')),
 result_json TEXT,
 result_hash TEXT
);
CREATE INDEX idx_colony_tasks_colony ON colony_tasks(colony_id);

CREATE TABLE colony_votes (
 vote_id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES colony_tasks(task_id),
 member_user_id TEXT NOT NULL,
 fly_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('BUY','SELL','HOLD','CLOSE')),
 checkpoint_hash TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(task_id,member_user_id),
 UNIQUE(task_id,fly_id)
);
CREATE TRIGGER colony_vote_guard BEFORE INSERT ON colony_votes BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM colony_tasks t,json_each(t.members_json) m WHERE t.task_id=NEW.task_id AND t.status='OPEN' AND t.deadline>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) AND json_extract(m.value,'$.member_user_id')=NEW.member_user_id AND json_extract(m.value,'$.fly_id')=NEW.fly_id) THEN RAISE(ABORT,'TASK_CLOSED_OR_NOT_MEMBER') END;
END;
CREATE TRIGGER colony_vote_no_update BEFORE UPDATE ON colony_votes BEGIN SELECT RAISE(ABORT,'immutable vote'); END;
CREATE TRIGGER colony_vote_no_delete BEFORE DELETE ON colony_votes BEGIN SELECT RAISE(ABORT,'immutable vote'); END;
CREATE TRIGGER colony_task_immutable BEFORE UPDATE ON colony_tasks WHEN OLD.status='FINALIZED' OR NEW.task_id IS NOT OLD.task_id OR NEW.colony_id IS NOT OLD.colony_id OR NEW.snapshot_json IS NOT OLD.snapshot_json OR NEW.snapshot_hash IS NOT OLD.snapshot_hash OR NEW.members_json IS NOT OLD.members_json OR NEW.quorum IS NOT OLD.quorum OR NEW.deadline IS NOT OLD.deadline OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'immutable task'); END;
CREATE TRIGGER colony_task_no_delete BEFORE DELETE ON colony_tasks BEGIN SELECT RAISE(ABORT,'immutable task'); END;
CREATE TRIGGER colony_member_no_update BEFORE UPDATE ON colony_members BEGIN SELECT RAISE(ABORT,'immutable membership'); END;
CREATE TRIGGER colony_member_no_delete BEFORE DELETE ON colony_members BEGIN SELECT RAISE(ABORT,'immutable membership'); END;
CREATE TRIGGER colony_no_update BEFORE UPDATE ON colonies BEGIN SELECT RAISE(ABORT,'immutable colony'); END;

CREATE TRIGGER federation_manifest_owner_guard BEFORE INSERT ON federation_fly_manifests WHEN EXISTS(SELECT 1 FROM federation_fly_manifests WHERE fly_id=NEW.fly_id AND (owner_user_id<>NEW.owner_user_id OR owner_public_key<>NEW.owner_public_key)) BEGIN SELECT RAISE(ABORT,'OWNER_MISMATCH'); END;
CREATE TRIGGER federation_manifest_no_update BEFORE UPDATE ON federation_fly_manifests BEGIN SELECT RAISE(ABORT,'immutable manifest'); END;
CREATE TRIGGER federation_manifest_no_delete BEFORE DELETE ON federation_fly_manifests BEGIN SELECT RAISE(ABORT,'immutable manifest'); END;
