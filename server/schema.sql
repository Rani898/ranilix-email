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

-- Addresses created from a signed-in browser belong to the same person (owner).
-- A user with no row here is their own owner.
CREATE TABLE IF NOT EXISTS account_owners (
  user_id  INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_owners_owner ON account_owners(owner_id);
-- Per-person address limit set by an admin (default is 5 in the Worker).
CREATE TABLE IF NOT EXISTS account_limits (
  owner_id     INTEGER PRIMARY KEY,
  max_accounts INTEGER NOT NULL
);

-- Account settings: display name, email signature and profile photo (small data URL).
CREATE TABLE IF NOT EXISTS profiles (
  user_id      INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  signature    TEXT NOT NULL DEFAULT '',
  avatar       TEXT,
  updated_at   INTEGER NOT NULL DEFAULT 0
);
-- "Report a problem" messages from users, shown in the admin panel.
CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  email      TEXT NOT NULL,
  category   TEXT NOT NULL,
  message    TEXT NOT NULL,
  page       TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
-- Devices that turned on push notifications (one row per device + account).
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint   TEXT NOT NULL,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (endpoint, user_id)
);

-- Discord accounts linked to Ranilix addresses with /verify (code_hash is set while a code is pending).
CREATE TABLE IF NOT EXISTS discord_links (
  discord_id   TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  code_hash    TEXT,
  code_expires INTEGER NOT NULL DEFAULT 0,
  attempts     INTEGER NOT NULL DEFAULT 0,
  verified_at  INTEGER
);

-- Live support chat (the help window on the site). Visitors who aren't logged in are known by the hash of a random key.
CREATE TABLE IF NOT EXISTS support_threads (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER,
  guest_hash   TEXT,
  name         TEXT,
  email        TEXT,
  topic        TEXT,
  status       TEXT NOT NULL DEFAULT 'open',
  rating       INTEGER,
  lang         TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  last_from    TEXT,
  last_preview TEXT,
  user_unread  INTEGER NOT NULL DEFAULT 0,
  admin_unread INTEGER NOT NULL DEFAULT 0,
  page         TEXT,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_threads(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_support_guest ON support_threads(guest_hash, updated_at);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_threads(status, updated_at);
CREATE TABLE IF NOT EXISTS support_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL,
  sender     TEXT NOT NULL,
  author     TEXT,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_support_msgs ON support_messages(thread_id, id);

-- Auto-reply ("out of office"). One reply per sender every few days (auto_reply_log).
CREATE TABLE IF NOT EXISTS auto_replies (
  user_id    INTEGER PRIMARY KEY,
  enabled    INTEGER NOT NULL DEFAULT 0,
  subject    TEXT,
  body       TEXT,
  starts_at  INTEGER,
  ends_at    INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auto_reply_log (
  user_id INTEGER NOT NULL,
  sender  TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, sender)
);
-- Temporary addresses (tmp-xxxxxxxx@domain) that deliver to their owner's inbox until they expire.
CREATE TABLE IF NOT EXISTS temp_addresses (
  local      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  label      TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  received   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_temp_user ON temp_addresses(user_id, expires_at);
-- Who may create temporary addresses when the admin picked "chosen people".
CREATE TABLE IF NOT EXISTS temp_access (
  user_id    INTEGER PRIMARY KEY,
  granted_by TEXT,
  granted_at INTEGER NOT NULL
);
-- Support team: people who can answer support chats and reports without being full admins.
CREATE TABLE IF NOT EXISTS staff_roles (
  user_id    INTEGER PRIMARY KEY,
  role       TEXT NOT NULL,
  granted_by TEXT,
  granted_at INTEGER NOT NULL
);
