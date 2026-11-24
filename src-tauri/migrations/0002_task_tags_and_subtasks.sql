-- 0002: tags and subtasks for tasks.

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE task_tags (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE subtasks (
  id              INTEGER PRIMARY KEY,
  task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  est_slots       INTEGER NOT NULL DEFAULT 1 CHECK (est_slots BETWEEN 1 AND 99),
  completed_slots INTEGER NOT NULL DEFAULT 0 CHECK (completed_slots >= 0),
  is_done         INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);

CREATE INDEX idx_subtasks_task ON subtasks(task_id);
CREATE INDEX idx_task_tags_task ON task_tags(task_id);