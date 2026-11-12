CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dashboard_sessions_expiry ON dashboard_sessions(expires_at);

CREATE TABLE IF NOT EXISTS moderator_join_code (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moderator_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS moderator_requests_created ON moderator_requests(created_at);

CREATE TABLE IF NOT EXISTS approved_moderators (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  approved_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS join_code_attempts (
  user_id TEXT PRIMARY KEY,
  bucket INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS private_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS command_cooldown (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO command_cooldown (id, last_at) VALUES (1, 0);
