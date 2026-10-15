-- Workspaces and the people in them: access levels, team roles, invite links and notifications.

CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,                           -- one emoji, optional
  owner_id    TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  ver         INTEGER NOT NULL DEFAULT 0      -- goes up on every change; open pages reload when it moves
);

CREATE TABLE ws_members (
  ws_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level       TEXT NOT NULL,                  -- owner | admin | member
  status      TEXT NOT NULL,                  -- active | pending (invited, not answered yet)
  invited_by  TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (ws_id, user_id)
);
CREATE INDEX ws_members_user ON ws_members(user_id);

-- team roles an admin defines ("designer", "editor"); they label people, they do not grant access
CREATE TABLE ws_roles (
  id          TEXT PRIMARY KEY,
  ws_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       INTEGER NOT NULL DEFAULT 0,     -- 0..7, a palette slot
  pos         REAL NOT NULL
);
CREATE INDEX ws_roles_ws ON ws_roles(ws_id);

CREATE TABLE ws_member_roles (
  ws_id       TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  role_id     TEXT NOT NULL REFERENCES ws_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (ws_id, user_id, role_id),
  FOREIGN KEY (ws_id, user_id) REFERENCES ws_members(ws_id, user_id) ON DELETE CASCADE
);

-- the lasting invite link of a workspace (one per workspace), with an optional readable name
CREATE TABLE ws_links (
  token       TEXT PRIMARY KEY,
  ws_id       TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  slug        TEXT UNIQUE,
  created_by  TEXT,
  created_at  INTEGER NOT NULL
);

-- one-person invite links: each lets one person in, and lapses after a week anyway
CREATE TABLE ws_once (
  token       TEXT PRIMARY KEY,
  ws_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                  -- invite | joined | …
  data        TEXT NOT NULL,                  -- json
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX notifications_user ON notifications(user_id, created_at);
