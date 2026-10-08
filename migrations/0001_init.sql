-- Money is stored in micro-dollars (1 USD = 1,000,000) so chat token costs stay exact.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  use_case TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  webhook_secret TEXT NOT NULL,
  signup_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX users_ip ON users(signup_ip, created_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  last4 TEXT NOT NULL,
  daily_cap INTEGER NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX api_keys_user ON api_keys(user_id);

-- One row per media task or chat request.
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  key_id TEXT,
  model TEXT NOT NULL,
  kind TEXT NOT NULL,                      -- media | chat
  status TEXT NOT NULL,                    -- queued | running | succeeded | failed
  cost INTEGER NOT NULL DEFAULT 0,         -- micro-USD, refunded to 0 billed when failed
  input_json TEXT,
  metadata_json TEXT,
  callback_url TEXT,
  upstream_id TEXT,
  result_json TEXT,
  error TEXT,
  usage_json TEXT,
  polled_at TEXT,
  callback_attempts INTEGER NOT NULL DEFAULT 0,
  callback_due_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  finished_at TEXT
);
CREATE INDEX tasks_user ON tasks(user_id, created_at);
CREATE INDEX tasks_key ON tasks(key_id, created_at);
CREATE INDEX tasks_open ON tasks(status, polled_at);
CREATE INDEX tasks_callback ON tasks(callback_due_at);

-- Every balance change. ref is unique so payments and refunds apply once.
CREATE TABLE ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,                      -- signup | topup | charge | refund | adjust
  ref TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX ledger_user ON ledger(user_id, created_at);

CREATE TABLE login_failures (
  ip TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX login_failures_ip ON login_failures(ip, at);
