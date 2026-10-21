-- Clusters (خوشه‌ها): kanban boards inside a workspace, with their own members, columns, custom fields and tasks.

CREATE TABLE clusters (
  id          TEXT PRIMARY KEY,
  ws_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  ver         INTEGER NOT NULL DEFAULT 0      -- goes up on every change; an open cluster reloads when it moves
);
CREATE INDEX clusters_ws ON clusters(ws_id);

-- who is in a cluster: always people of the workspace, so leaving the workspace takes them out of its clusters too
CREATE TABLE cluster_members (
  cluster_id  TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  ws_id       TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL,                  -- owner | admin | member
  color       INTEGER NOT NULL DEFAULT 0,     -- 0..7, the person's own colour for this cluster
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (cluster_id, user_id),
  FOREIGN KEY (ws_id, user_id) REFERENCES ws_members(ws_id, user_id) ON DELETE CASCADE
);
CREATE INDEX cluster_members_user ON cluster_members(ws_id, user_id);

-- the statuses (columns) of a cluster, in order
CREATE TABLE cluster_columns (
  id          TEXT PRIMARY KEY,
  cluster_id  TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       INTEGER NOT NULL DEFAULT 0,
  pos         REAL NOT NULL
);
CREATE INDEX cluster_columns_cluster ON cluster_columns(cluster_id);

-- custom fields every task of a cluster has: text, number, phone, link, select, assign, date, check, checklist
CREATE TABLE cluster_fields (
  id          TEXT PRIMARY KEY,
  cluster_id  TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  opts        TEXT NOT NULL DEFAULT '[]',     -- json, the choices of a select: [{ id, name, color }]
  multi       INTEGER NOT NULL DEFAULT 0,     -- a select (or assign) that takes several values
  pos         REAL NOT NULL
);
CREATE INDEX cluster_fields_cluster ON cluster_fields(cluster_id);

CREATE TABLE cluster_tasks (
  id          TEXT PRIMARY KEY,
  cluster_id  TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  col_id      TEXT NOT NULL REFERENCES cluster_columns(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  pos         REAL NOT NULL,                  -- order inside its column; a move lands between two neighbours
  vals        TEXT NOT NULL DEFAULT '{}',     -- json, field id -> value
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX cluster_tasks_cluster ON cluster_tasks(cluster_id);
