CREATE TABLE colony_auto_dispatch (
 colony_id TEXT PRIMARY KEY REFERENCES colonies(colony_id),
 next_attempt_at INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT
);
CREATE UNIQUE INDEX idx_colony_auto_open ON colony_tasks(colony_id) WHERE colony_id='defly-default-v1' AND status='OPEN';
CREATE TABLE colony_task_claims (
 claim_id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES colony_tasks(task_id),
 member_user_id TEXT NOT NULL,
 fly_id TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(task_id,member_user_id),
 UNIQUE(task_id,fly_id)
);
CREATE TRIGGER colony_claim_guard BEFORE INSERT ON colony_task_claims BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM colony_tasks t,json_each(t.members_json) m WHERE t.task_id=NEW.task_id AND t.status='OPEN' AND t.deadline>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) AND json_extract(m.value,'$.member_user_id')=NEW.member_user_id AND json_extract(m.value,'$.fly_id')=NEW.fly_id) THEN RAISE(ABORT,'TASK_CLOSED_OR_NOT_MEMBER') END;
END;
CREATE TRIGGER colony_claim_no_update BEFORE UPDATE ON colony_task_claims BEGIN SELECT RAISE(ABORT,'immutable claim'); END;
CREATE TRIGGER colony_claim_no_delete BEFORE DELETE ON colony_task_claims BEGIN SELECT RAISE(ABORT,'immutable claim'); END;
CREATE TABLE colony_human_corrections (
 correction_id TEXT NOT NULL,
 task_id TEXT NOT NULL REFERENCES colony_tasks(task_id),
 vote_id TEXT NOT NULL REFERENCES colony_votes(vote_id),
 member_user_id TEXT NOT NULL,
 fly_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('BUY','SELL','HOLD','CLOSE')),
 note TEXT NOT NULL CHECK(length(note)<=1000),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(member_user_id,correction_id)
);
CREATE INDEX idx_colony_corrections_vote ON colony_human_corrections(vote_id);
CREATE TRIGGER colony_correction_guard BEFORE INSERT ON colony_human_corrections BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM colony_votes WHERE vote_id=NEW.vote_id AND task_id=NEW.task_id AND member_user_id=NEW.member_user_id AND fly_id=NEW.fly_id) THEN RAISE(ABORT,'VOTE_OWNER_MISMATCH') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM colony_human_corrections WHERE vote_id=NEW.vote_id)>=20 THEN RAISE(ABORT,'CORRECTION_LIMIT') END;
END;
CREATE TRIGGER colony_correction_no_update BEFORE UPDATE ON colony_human_corrections BEGIN SELECT RAISE(ABORT,'immutable correction'); END;
CREATE TRIGGER colony_correction_no_delete BEFORE DELETE ON colony_human_corrections BEGIN SELECT RAISE(ABORT,'immutable correction'); END;
