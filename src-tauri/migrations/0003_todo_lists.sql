-- 0003: independent To-do lists.
--
-- To-do data shares nothing with the Pomodoro `tasks` / `subtasks` tables. A
-- To-do completion must never touch sessions, statistics or the active task.
--
-- `due_date` / `due_time` are local wall-clock values, because "Today",
-- "Tomorrow" and "Overdue" are calendar concepts. Reminder instants are stored
-- in UTC ('YYYY-MM-DD HH:MM:SS') like every other timestamp.

CREATE TABLE todo_lists (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  color       TEXT    NOT NULL DEFAULT 'zinc',
  icon        TEXT    NOT NULL DEFAULT 'list',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_inbox    INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_todo_lists_inbox
  ON todo_lists(is_inbox) WHERE is_inbox = 1;

CREATE TABLE todos (
  id           INTEGER PRIMARY KEY,
  list_id      INTEGER NOT NULL REFERENCES todo_lists(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  note         TEXT    NOT NULL DEFAULT '',
  is_done      INTEGER NOT NULL DEFAULT 0,
  priority     TEXT    NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high')),
  due_date     TEXT,
  due_time     TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  CHECK (due_time IS NULL OR due_date IS NOT NULL)
);

CREATE INDEX idx_todos_list ON todos(list_id, is_done, sort_order);
CREATE INDEX idx_todos_due  ON todos(is_done, due_date);

CREATE TABLE todo_subtasks (
  id           INTEGER PRIMARY KEY,
  todo_id      INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  is_done      INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX idx_todo_subtasks_todo ON todo_subtasks(todo_id);

CREATE TABLE todo_reminders (
  id           INTEGER PRIMARY KEY,
  todo_id      INTEGER NOT NULL UNIQUE REFERENCES todos(id) ON DELETE CASCADE,
  fire_at      TEXT    NOT NULL,
  kind         TEXT    NOT NULL DEFAULT 'due'
                        CHECK (kind IN ('due', 'before', 'custom')),
  lead_minutes INTEGER,
  fired_at     TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_todo_reminders_pending
  ON todo_reminders(fire_at) WHERE fired_at IS NULL;

-- Default Inbox for existing and new databases.
INSERT INTO todo_lists (name, color, icon, sort_order, is_inbox)
SELECT 'Inbox', 'zinc', 'inbox', 0, 1
WHERE NOT EXISTS (SELECT 1 FROM todo_lists WHERE is_inbox = 1);
