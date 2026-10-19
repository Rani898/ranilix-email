-- Ranilix Email database (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder     TEXT NOT NULL DEFAULT 'inbox',   -- inbox | sent | trash
  from_name  TEXT NOT NULL DEFAULT '',
  from_addr  TEXT NOT NULL DEFAULT '',
  to_addr    TEXT NOT NULL DEFAULT '',
  subject    TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',        -- plain text only (never raw HTML)
  date       INTEGER NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  starred    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_user_folder ON messages(user_id, folder, date);

-- Simple fixed-window rate limiting (signups, logins, sends)
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

-- File attachments. The file bytes live in Workers KV (binding FILES) under kv_key;
-- several rows can share one kv_key (e.g. an internal message copied to each recipient).
CREATE TABLE IF NOT EXISTS attachments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL DEFAULT 'application/octet-stream',
  size       INTEGER NOT NULL,
  kv_key     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_attachments_user ON attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_kv ON attachments(kv_key);

-- Per-user status kept outside the users table so this file can be re-run safely.
CREATE TABLE IF NOT EXISTS user_meta (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  suspended     INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER
);

-- Announcements the admin sent to every inbox.
CREATE TABLE IF NOT EXISTS broadcasts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sent_by    TEXT NOT NULL,
  recipients INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS broadcast_messages (
  broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  message_id   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages ON broadcast_messages(broadcast_id);

-- Site-wide settings (announcement banner, open/closed sign-ups).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Fast "latest message" lookup for the inbox's frequent new-mail check.
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id, id);

-- "Connect Google": one linked Gmail account per user. Tokens are encrypted by the Worker.
CREATE TABLE IF NOT EXISTS google_accounts (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_email   TEXT NOT NULL DEFAULT '',
  refresh_enc    TEXT NOT NULL,
  access_enc     TEXT,
  access_expires INTEGER NOT NULL DEFAULT 0,
  connected_at   INTEGER NOT NULL
);
-- One-time codes that tie Google's redirect back to the user who started it.
CREATE TABLE IF NOT EXISTS oauth_states (
  state      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  return_to  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
