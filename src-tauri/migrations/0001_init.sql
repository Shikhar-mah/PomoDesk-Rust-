-- PomoDesk initial schema.
--
-- Notes for whoever reads this next:
--  * Every timestamp is stored as UTC text in the form "YYYY-MM-DD HH:MM:SS".
--    That format is understood by SQLite's date()/datetime() functions, which is
--    how stats are grouped by the user's local day.
--  * "snapshot" columns (preset_name, task_title) keep history readable even
--    when the preset or task is later edited or deleted.
--  * Journal mode (WAL) and foreign-key enforcement are enabled in Rust when the
--    connection pool is created, not here, so they apply to every connection.

CREATE TABLE presets (
  id               INTEGER PRIMARY KEY,
  name             TEXT    NOT NULL,
  focus_sec        INTEGER NOT NULL CHECK (focus_sec > 0),
  short_break_sec  INTEGER NOT NULL CHECK (short_break_sec > 0),
  long_break_sec   INTEGER NOT NULL CHECK (long_break_sec > 0),
  long_break_every INTEGER NOT NULL DEFAULT 4 CHECK (long_break_every > 0),
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_builtin       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tasks (
  id              INTEGER PRIMARY KEY,
  title           TEXT    NOT NULL,
  note            TEXT    NOT NULL DEFAULT '',
  est_slots       INTEGER NOT NULL DEFAULT 1 CHECK (est_slots BETWEEN 1 AND 99),
  completed_slots INTEGER NOT NULL DEFAULT 0 CHECK (completed_slots >= 0),
  is_done         INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);

CREATE TABLE sessions (
  id           INTEGER PRIMARY KEY,
  preset_id    INTEGER REFERENCES presets(id) ON DELETE SET NULL,
  preset_name  TEXT    NOT NULL,
  task_id      INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  task_title   TEXT,
  started_at   TEXT    NOT NULL,
  ended_at     TEXT    NOT NULL,
  duration_sec INTEGER NOT NULL CHECK (duration_sec > 0)
);

CREATE INDEX idx_sessions_started ON sessions(started_at);

CREATE TABLE app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
