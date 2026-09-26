CREATE TABLE flydesk_credentials (username TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES users(id),salt TEXT NOT NULL,password_hash TEXT NOT NULL,iterations INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE flydesk_auth_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE TABLE flydesk_auth_limits (bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
