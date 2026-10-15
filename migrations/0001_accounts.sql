-- Accounts: the only tables that know about people. Everything else keeps just users.id.

CREATE TABLE users (
  id           TEXT PRIMARY KEY,              -- never changes, even when the username does
  username     TEXT NOT NULL UNIQUE,          -- lowercase, what people see and invite by
  pass_hash    TEXT,                          -- NULL = no password yet (made through Telegram)
  salt         TEXT NOT NULL,
  display_name TEXT,
  about        TEXT,                          -- one line on the profile
  email        TEXT,                          -- optional; later used for Google Calendar invites
  lang         TEXT NOT NULL DEFAULT 'fa',    -- fa | en
  cal          TEXT NOT NULL DEFAULT 'shamsi',-- shamsi | gregorian
  week_start   INTEGER NOT NULL DEFAULT 6,    -- 6 saturday, 0 sunday, 1 monday
  plan         TEXT NOT NULL DEFAULT 'free',
  auto         INTEGER NOT NULL DEFAULT 0,    -- 1 = made automatically by Telegram, may be swapped for an older account
  created_at   INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,              -- only a hash of the cookie is kept
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  key          TEXT PRIMARY KEY,              -- "login:<username>"
  count        INTEGER NOT NULL,
  reset_at     INTEGER NOT NULL
);

CREATE TABLE telegram_links (
  telegram_id  TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  tg_username  TEXT,
  write_ok     INTEGER NOT NULL DEFAULT 0,    -- 1 = the bot may message them
  created_at   INTEGER NOT NULL
);
