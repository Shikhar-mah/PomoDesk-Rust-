# PomoDesk — Architecture Document

**Stack:** Tauri 2 (Rust core) · React + TypeScript + Vite · Tailwind CSS · SQLite (sqlx) · zustand

---

## 1. Core Principles

1. **Rust is the single source of truth.** Timer, tasks, presets, stats all live in the Rust core + SQLite. React is a thin, dumb view that invokes commands and renders pushed events. This kills the #1 failure mode of web-tech desktop apps: a JS `setInterval` that drifts or stalls when the window is minimized.
2. **Tasks are global; timer config is swappable.** Switching a preset never touches task state or progress counters.
3. **Slots are pure counts.** A task at `3/8` is 8 slot-units regardless of which preset you're running.
4. **Offline-first, no accounts, no network.** Local SQLite only.

---

## 2. Process Architecture

```
┌─────────────────────────────────────────────┐
│  Rust Core (always alive, window or not)    │
│                                             │
│  ┌──────────────┐   ┌────────────────────┐  │
│  │ Timer Engine │──▶│ SQLite (sqlx, WAL) │  │
│  │ (tokio)      │   │ tasks/presets/     │  │
│  └──────┬───────┘   │ sessions/app_state │  │
│         │           └────────────────────┘  │
│         │ emit("timer:tick" | "timer:...")  │
│  Tray icon ◀── state                        │
└─────────┼───────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────┐
│  React Frontend (webview)                   │
│  zustand stores ← events; invoke() → cmds   │
└─────────────────────────────────────────────┘
```

- **Timer runs in Rust** via a tokio task computing `remaining = ends_at - now` every 250 ms (wall-clock, so no drift). Emits `timer:tick`.
- **Tray icon lives in Rust** — menu items (Start/Pause, Skip, Reset, Show, Quit) and tooltip (`Focus · 24:13`) work with the window closed.
- **OS notifications** fired from Rust (`tauri-plugin-notification`); **sounds** played in the frontend (bundled asset, simpler).
- Frontend can be reloaded/destroyed and the timer keeps ticking — state is re-fetched on mount via `get_timer_state`.

---

## 3. Domain Model

### Preset (timer configuration)
| Field | Type | Notes |
|---|---|---|
| id | i64 | |
| name | String | shown on tab |
| focus_sec / short_break_sec / long_break_sec | u32 | |
| long_break_every | u32 | long break after N completed focus sessions |
| sort_order | i32 | tab order |

Seeded defaults:

| Name | Focus | Short | Long | Every |
|---|---|---|---|---|
| Classic | 25 | 5 | 15 | 4 |
| Deep Work | 50 | 10 | 25 | 2 |
| Quick Sprint | 15 | 3 | 10 | 4 |
| Study | 45 | 15 | 30 | 3 |

### Task
| Field | Type | Notes |
|---|---|---|
| id | i64 | |
| title / note | String | |
| est_slots | u32 | user estimate, 1–99 |
| completed_slots | u32 | may exceed `est_slots` (Pomofocus behavior) |
| is_done | bool | completed_at timestamp when set |
| sort_order | i32 | insertion order in v1; drag-drop optional later |

- Exactly **one active task** at a time (`active_task_id` in app_state). A completed focus session increments its `completed_slots`.
- Marking the active task done **clears the active selection**. Done tasks can't be set active.

### Session log (for stats)
Only **completed focus sessions** are logged. Discarded/skipped sessions are never logged, so a log row always means "this pomodoro counted."

### Cycle counter
`cycle_focus_count` (global, in app_state): completed focus sessions since the last long break. Long-break decision = `cycle_focus_count % active_preset.long_break_every == 0` at the moment focus completes. It survives preset switches, so switching from an "every 4" preset to an "every 2" preset mid-cycle behaves predictably.

---

## 4. Database Schema

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE presets (
  id               INTEGER PRIMARY KEY,
  name             TEXT    NOT NULL,
  focus_sec        INTEGER NOT NULL,
  short_break_sec  INTEGER NOT NULL,
  long_break_sec   INTEGER NOT NULL,
  long_break_every INTEGER NOT NULL DEFAULT 4,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_builtin       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tasks (
  id              INTEGER PRIMARY KEY,
  title           TEXT    NOT NULL,
  note            TEXT    NOT NULL DEFAULT '',
  est_slots       INTEGER NOT NULL DEFAULT 1,
  completed_slots INTEGER NOT NULL DEFAULT 0,
  is_done         INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);

CREATE TABLE sessions (
  id           INTEGER PRIMARY KEY,
  preset_id    INTEGER REFERENCES presets(id) ON DELETE SET NULL,
  preset_name  TEXT    NOT NULL,           -- snapshot, survives preset edits/deletes
  task_id      INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  task_title   TEXT,                       -- snapshot
  started_at   TEXT    NOT NULL,           -- UTC ISO-8601
  ended_at     TEXT    NOT NULL,
  duration_sec INTEGER NOT NULL            -- planned focus duration
);
CREATE INDEX idx_sessions_started ON sessions(started_at);

CREATE TABLE app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- keys: active_task_id, active_preset_id, cycle_focus_count,
--       timer_snapshot (JSON, for crash recovery), settings (JSON)
```

Settings (JSON in `app_state`): `auto_start_breaks`, `auto_start_focus`, `sound_enabled`, `notifications_enabled`, `minimize_to_tray`.

Migrations: `sqlx::migrate!` with `migrations/0001_init.sql`. Use runtime `sqlx::query` (not compile-time macros) to avoid needing a live DB at build time. Single connection pool — no concurrency concerns at this scale.

---

## 5. Timer Engine (Rust)

### State
```
session_type: Focus | ShortBreak | LongBreak
status:       Idle | Running | Paused
remaining_ms: u64          (Paused/Idle: stored; Running: derived from ends_at)
ends_at:      Option<Instant-ish epoch ms>
total_ms:     u64          (full duration of current session, from preset)
started_at:   Option<DateTime<Utc>>
```

### Transitions

| From | Event | To / Action |
|---|---|---|
| Focus, Running | timer hits 0 | credit active task +1, insert session row, `cycle_focus_count++`, choose LongBreak if `count % N == 0` else ShortBreak → auto-start per setting |
| ShortBreak/LongBreak, Running | timer hits 0 | → Focus (Idle, or auto-start per setting) |
| Any Running | Pause | store `remaining_ms`, status = Paused |
| Any Paused | Resume | `ends_at = now + remaining_ms` |
| Focus (any) | Skip | **no credit, no log, no cycle increment** → break selection (Short/Long per current count) |
| Break (any) | Skip | → Focus, Idle |
| Any | Reset ("restart" ↺) | `remaining_ms = total_ms`, status = Idle, same session type |
| Any | Preset switch (confirmed) | discard session, load new preset's `focus_sec`, Focus/Idle, `cycle_focus_count` untouched |

### Tick loop
Tokio interval every **250 ms** while Running. Emits `timer:tick { sessionType, status, remainingMs, totalMs, cycleFocusCount, activePresetId }`. UI renders the ring from `remainingMs/totalMs` and interpolates with `requestAnimationFrame` for smoothness between ticks. Display = `ceil(remainingMs/1000)`.

### Crash recovery
`timer_snapshot` (type, status, remaining_ms, ends_at, preset_id, started_at) persisted on every transition and every 5 s while running. On boot: if a Focus session was running and `ends_at` hasn't passed → restore **Paused** at computed remaining; if `ends_at` has passed → restore Paused at 0, and it completes (credits/logs) on next resume. No silent double-crediting since logging only happens at completion.

---

## 6. Preset Switching Semantics (your #2)

**"Mid-session"** = session type is Focus **and** (status is Running, or Paused with `remaining_ms < total_ms`). Breaks never trigger confirmation.

| Situation | Behavior |
|---|---|
| Idle, or nothing started | **Switch silently.** New preset's focus time loads immediately. |
| Mid-focus session | **Confirm dialog:** *"Switch to 'Deep Work'? Your current focus session (12:34 remaining) will be discarded and won't count."* → On confirm: **discard session** (no task credit, no session log, cycle count unchanged), load new preset, timer returns to new preset's Focus/Idle. On cancel: nothing changes. |
| During a break | Switch silently; break is discarded, new preset loads at Focus/Idle, cycle count kept. |

> ⚠️ This "discard on confirm" reading of your answer is the one decision I made unilaterally — the alternative (keep session running, apply new preset next time) requires no confirmation at all, so it contradicted asking. Say the word if you want the softer behavior.

Editing the **active** preset's durations: takes effect immediately if idle; if running, applies to the next session (non-destructive, no confirm).

---

## 7. IPC Surface

### Commands (frontend → Rust)

| Group | Commands |
|---|---|
| Presets | `list_presets`, `create_preset`, `update_preset`, `delete_preset`¹, `reorder_presets` |
| Tasks | `list_tasks`, `create_task`, `update_task`, `set_task_done`, `delete_task`, `set_active_task` |
| Timer | `get_timer_state`, `start_timer`, `pause_timer`, `resume_timer`, `skip_session`, `reset_session`, `switch_preset(preset_id, force: bool)`² |
| Stats | `get_stats_today`, `get_stats_daily(days)`, `get_stats_totals`, `get_streak` |
| Settings | `get_settings`, `update_settings` |

¹ Refuse to delete the last remaining preset. Deleting the active preset → switch to first remaining (same confirm flow if mid-session).
² `force = false` returns `Err`/`NeedsConfirmation { remainingMs, presetName }` if mid-session; frontend shows dialog, then re-calls with `force = true`.

### Events (Rust → frontend)

| Event | Payload |
|---|---|
| `timer:tick` | remainingMs, totalMs, sessionType, status, cycleFocusCount |
| `timer:session_complete` | completedType, nextType, creditedTaskId?, willAutoStart |
| `timer:state_changed` | full timer state (on start/pause/skip/switch/reset) |
| `tasks:changed` / `presets:changed` | (fired after mutations originating in tray or core) |

---

## 8. Frontend

### Layout (Pomofocus-inspired, but with preset tabs)
Single centered column, `max-width ~560px`:
```
┌──────────────────────────────────────┐
│  PomoDesk          [Stats] [⚙]       │
│  [Classic] [Deep Work] [Quick] [Study]  ← preset tabs (active = filled)
│  ┌────────────────────────────────┐  │
│  │        FOCUS  ·  Cycle 2/4     │  │
│  │           ( ring )             │  │
│  │           24:13                │  │
│  │      [▶ Start]  [↺]  [⏭]      │  │
│  └────────────────────────────────┘  │
│  Current: Write architecture doc     │
│  ┌────────────────────────────────┐  │
│  │ ○ Task A           2/4   ✎ 🗑  │  │
│  │ ● Task B (active)  0/1   ✎ 🗑  │  │
│  │ ✓ Task C           3/3         │  │
│  │ + Add task                     │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```
- Mode label (Focus / Short Break / Long Break) + cycle indicator `2/4` driven by preset's `long_break_every`.
- Ring = SVG circle with stroke-dashoffset.
- Clicking a preset tab runs the confirmation flow from §6.
- Stats opens as a panel/dialog (not a whole separate route — keep it light).

### State (zustand)
- `timerStore` — fed exclusively by `timer:*` events; actions are thin `invoke()` wrappers.
- `tasksStore` / `presetsStore` — fetched on mount, refreshed after mutations.
- `statsStore` — fetched on demand when Stats opens.
No derived timer math in JS beyond formatting — the core is authoritative.

### Project layout
```
pomodesk/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── migrations/0001_init.sql
│   └── src/
│       ├── main.rs            # app setup, plugins, tray
│       ├── db.rs              # pool, migrations, seeds
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── tasks.rs
│       │   ├── presets.rs
│       │   ├── timer.rs
│       │   └── stats.rs
│       ├── timer/
│       │   ├── mod.rs         # TimerEngine (tokio task), state machine
│       │   └── state.rs
│       ├── tray.rs
│       └── models.rs          # serde structs
└── src/
    ├── main.tsx / App.tsx
    ├── components/
    │   ├── TimerCard.tsx  PresetTabs.tsx  TaskList.tsx
    │   ├── TaskItem.tsx   AddTaskForm.tsx  ConfirmDialog.tsx
    │   └── StatsPanel.tsx  SettingsDialog.tsx
    ├── stores/  (timer.ts, tasks.ts, presets.ts, stats.ts)
    ├── lib/ipc.ts           # typed invoke wrappers + event listeners
    └── lib/types.ts         # mirrors models.rs
```
Rust deps: `tauri 2`, `tokio`, `sqlx` (sqlite, runtime-tokio), `serde`, `chrono`, `tauri-plugin-notification`, `tauri-plugin-opener` (for nothing yet, skip). Frontend deps: `@tauri-apps/api`, `zustand`, `clsx`, Tailwind. **No chart library** — the 7-day bar chart is 7 divs.

---

## 9. Statistics (basic scope)

| View | Data |
|---|---|
| **Today** | focus sessions completed, total focus time, tasks completed today |
| **Last 7 days** | bar chart of focus minutes (or sessions) per day, CSS-only |
| **All time** | total sessions, total hours, current streak (consecutive days with ≥1 completed focus session) |
| Optional v1.1 | per-preset breakdown (group `sessions` by `preset_name`) — cheap since it's snapshotted |

Queries group by `date(started_at, 'localtime')` to respect the user's timezone. Streak computed in Rust over distinct days.

---

## 10. Build Order

| Milestone | Deliverable |
|---|---|
| **M0** | Scaffold: `create-tauri-app` (React/TS), Tailwind, window sizing, SQLite pool + migration + seed presets |
| **M1** | Presets & tasks CRUD commands + frontend (tabs, task list, add/edit/delete, active task). No timer yet. |
| **M2** | Timer engine: start/pause/resume/skip/reset, tick events, cycle logic, ring UI. **Switch presets with confirmation flow.** |
| **M3** | Completion pipeline: task crediting, session logging, notifications, sound, settings (auto-start toggles) |
| **M4** | Stats panel, crash recovery, persistence of active preset/task/cycle |
| **M5** | Tray icon + menu + live tooltip; keyboard shortcuts (Space start/pause, R reset, S skip); visual polish |

---

## Open Items

1. **Confirm = discard** (§6) — confirm or overrule.
2. Task reordering (drag-drop) — I've deferred it past v1; insertion order + a small "move up/down" is the fallback. OK?
3. Presets deletable but not the last one — any objection to that guard?