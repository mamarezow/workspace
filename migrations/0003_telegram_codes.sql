-- Signing in with a code from the bot: whoever has started the bot, and the codes it has sent.

CREATE TABLE telegram_chats (
  telegram_id  TEXT PRIMARY KEY,              -- also the chat to message them in
  tg_username  TEXT,                          -- lowercase, without @
  first_name   TEXT,
  last_name    TEXT,
  seen_at      INTEGER NOT NULL
);
CREATE INDEX telegram_chats_username ON telegram_chats(tg_username);

CREATE TABLE login_codes (
  telegram_id  TEXT PRIMARY KEY,              -- one live code per Telegram account
  code_hash    TEXT NOT NULL,
  tries        INTEGER NOT NULL DEFAULT 0,    -- wrong guesses so far
  sent_at      INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
