-- One-way learning and forward-only, isolated evaluation. No personal balances or models are changed.
CREATE TABLE universe_rounds (
 id TEXT PRIMARY KEY, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING', rules_json TEXT NOT NULL,
 model_json TEXT, model_version INTEGER, start_price REAL, last_price REAL,
 last_mark_at INTEGER, settled_tasks INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE universe_entries (
 round_id TEXT NOT NULL REFERENCES universe_rounds(id), owner_id TEXT NOT NULL,
 fly_id TEXT NOT NULL, display_name TEXT NOT NULL, kind TEXT NOT NULL,
 checkpoint_hash TEXT, teaching_json TEXT, teaching_hash TEXT,
 consent_json TEXT, state_json TEXT, revision INTEGER NOT NULL DEFAULT 0,
 received INTEGER NOT NULL DEFAULT 0, missed INTEGER NOT NULL DEFAULT 0,
 joined_at INTEGER NOT NULL, PRIMARY KEY(round_id,owner_id), UNIQUE(round_id,fly_id)
);
CREATE TABLE universe_tasks (
 id TEXT PRIMARY KEY, round_id TEXT NOT NULL REFERENCES universe_rounds(id), slot INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL, deadline INTEGER NOT NULL,
 fill_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', fill_price REAL,
 created_at INTEGER NOT NULL, UNIQUE(round_id,slot)
);
CREATE TABLE universe_predictions (
 task_id TEXT NOT NULL REFERENCES universe_tasks(id), owner_id TEXT NOT NULL,
 fly_id TEXT NOT NULL, checkpoint_hash TEXT NOT NULL, decoder_json TEXT NOT NULL,
 proof_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(task_id,owner_id)
);
CREATE TABLE universe_events (
 task_id TEXT NOT NULL REFERENCES universe_tasks(id), round_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 expected_revision INTEGER NOT NULL, action TEXT NOT NULL, received INTEGER NOT NULL,
 features_json TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
 fee REAL NOT NULL, fill_price REAL NOT NULL, mark_price REAL NOT NULL,
 created_at INTEGER NOT NULL, PRIMARY KEY(task_id,owner_id)
);
CREATE TABLE universe_models (
 version INTEGER PRIMARY KEY, source_round TEXT UNIQUE NOT NULL,
 model_json TEXT NOT NULL, samples INTEGER NOT NULL, contributors INTEGER NOT NULL,
 created_at INTEGER NOT NULL, training_loss REAL NOT NULL
);
CREATE TABLE universe_clock (id INTEGER PRIMARY KEY CHECK(id=1), lease_until INTEGER NOT NULL, token TEXT, last_tick INTEGER, last_error TEXT);
CREATE TABLE universe_training (round_id TEXT PRIMARY KEY, cursor INTEGER NOT NULL DEFAULT -1, model_json TEXT NOT NULL, parent_version INTEGER NOT NULL, samples INTEGER NOT NULL DEFAULT 0, loss_total REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'RUNNING');
INSERT INTO universe_clock(id,lease_until) VALUES(1,0);
CREATE INDEX universe_tasks_pending ON universe_tasks(status,fill_at);
CREATE INDEX universe_events_round ON universe_events(round_id,owner_id,created_at);
CREATE TRIGGER universe_event_guard BEFORE INSERT ON universe_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM universe_entries WHERE round_id=NEW.round_id AND owner_id=NEW.owner_id AND revision=NEW.expected_revision)
 THEN RAISE(ABORT,'UNIVERSE_REVISION_CONFLICT') END;
END;
CREATE TRIGGER universe_event_apply AFTER INSERT ON universe_events BEGIN
 UPDATE universe_entries SET state_json=NEW.after_json,revision=revision+1,received=received+NEW.received,missed=missed+1-NEW.received
 WHERE round_id=NEW.round_id AND owner_id=NEW.owner_id;
END;
CREATE TRIGGER universe_prediction_guard BEFORE INSERT ON universe_predictions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM universe_tasks t JOIN universe_entries e ON e.round_id=t.round_id AND e.owner_id=NEW.owner_id
 WHERE t.id=NEW.task_id AND t.status='OPEN' AND NEW.created_at<t.deadline AND e.kind='PERSONAL' AND e.checkpoint_hash=NEW.checkpoint_hash AND e.fly_id=NEW.fly_id)
 THEN RAISE(ABORT,'UNIVERSE_PREDICTION_CONFLICT') END;
END;
CREATE TRIGGER universe_predictions_immutable BEFORE UPDATE ON universe_predictions BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER universe_events_immutable BEFORE UPDATE ON universe_events BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER universe_models_immutable BEFORE UPDATE ON universe_models BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER universe_predictions_no_delete BEFORE DELETE ON universe_predictions BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER universe_events_no_delete BEFORE DELETE ON universe_events BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER universe_models_no_delete BEFORE DELETE ON universe_models BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER universe_entry_policy_immutable BEFORE UPDATE OF round_id,owner_id,fly_id,checkpoint_hash,teaching_json,teaching_hash,consent_json ON universe_entries BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER universe_round_policy_immutable BEFORE UPDATE OF rules_json,model_json,model_version,starts_at,ends_at ON universe_rounds WHEN OLD.status<>'PENDING' BEGIN SELECT RAISE(ABORT,'immutable'); END;
