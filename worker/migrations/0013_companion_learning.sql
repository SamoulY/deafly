CREATE TABLE IF NOT EXISTS companion_models (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 version INTEGER NOT NULL,
 checkpoint_json TEXT NOT NULL,
 model_hash TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS companion_training (
 lesson_id TEXT PRIMARY KEY REFERENCES companion_lessons(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 version_before INTEGER NOT NULL,
 version_after INTEGER NOT NULL,
 checkpoint_json TEXT NOT NULL,
 model_hash TEXT NOT NULL,
 probability_before REAL NOT NULL,
 probability_after REAL NOT NULL,
 features_json TEXT NOT NULL,
 trained_at INTEGER NOT NULL,
 UNIQUE(user_id, version_after)
);
CREATE TRIGGER IF NOT EXISTS companion_training_guard BEFORE INSERT ON companion_training
BEGIN
 SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM companion_models m JOIN companion_lessons l ON l.user_id=m.user_id
 WHERE m.user_id=NEW.user_id AND l.id=NEW.lesson_id AND m.version=NEW.version_before
 AND NEW.version_after=NEW.version_before+1
 ) THEN RAISE(ABORT,'TEACHING_VERSION_CONFLICT') END;
END;
CREATE TRIGGER IF NOT EXISTS companion_training_apply AFTER INSERT ON companion_training
BEGIN
 UPDATE companion_models SET version=NEW.version_after,checkpoint_json=NEW.checkpoint_json,model_hash=NEW.model_hash,updated_at=NEW.trained_at WHERE user_id=NEW.user_id;
END;
CREATE TABLE IF NOT EXISTS companion_inference (
 challenge_id TEXT PRIMARY KEY REFERENCES browser_autonomy_challenges(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 checkpoint_json TEXT NOT NULL,
 model_hash TEXT NOT NULL,
 features_json TEXT NOT NULL
);
