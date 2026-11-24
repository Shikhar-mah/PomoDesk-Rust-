# PomoDesk — Further Features Implementation Plan

**Source of scope:** `further-features.txt` (7 items)
**Stack:** Tauri 2 (Rust core) · React + TypeScript + Vite · SQLite (sqlx) · zustand
**Status:** Plan only. No production code has been changed yet.
**Audience:** an implementing agent (including a small model) that has not read this codebase before.

Read `docs/architecture.md` and `docs/code-standard.md` before starting. This document follows
both: Rust is the single source of truth, tests are written before the implementation, and no
phase may touch files outside its listed scope.

---

## 1. How to use this document

1. Work strictly **one phase at a time**, in the order given in section 4.
2. For each phase: read the phase, read the listed files, write the listed tests first, then implement.
3. Tick the checkbox in section 4 only after that phase's verification command passes.
4. Do **not** start `P7` (tags/subtasks) before `P1`–`P6` pass. It is the only phase that changes the database schema.
5. If anything in section 6 ("Decisions needing confirmation") looks wrong, stop and ask before implementing the affected phase.

---

## 2. Requirement traceability

Every requirement from `further-features.txt` maps to exactly one phase, a backend change, a frontend change, and a test.

| # | Requirement (as written by the user) | Phase | Backend | Frontend | Tests |
|---|---|---|---|---|---|
| 1 | display the running clock inside the preview in the taskbar | P1 | `tray.rs` window title | none (config title untouched) | `tray.rs` unit tests |
| 7 | notification buttons start the session/break, screen should not pop up | P2 | `lib.rs` `on_action` | none | manual check (documented) |
| 2 | end session button that also increments the completed session count | P3 | `timer/mod.rs`, `commands/timer.rs` | `TimerCard`, `App`, store, ipc | Rust engine tests + `App.test.tsx` |
| 6 | three tabs inside the focus timer box: focus / break / long break | P4 | `timer/mod.rs`, `commands/timer.rs` | `TimerCard` tabs, `App`, store, ipc, CSS | Rust engine tests + `App.test.tsx` |
| 4 | ability to change the completed pomodoro count | P5 | `models.rs`, `repositories/tasks.rs`, `services/tasks.rs` | `EditTaskDialog`, types | Rust service tests + new component test |
| 5 | support orphan sessions (sessions that belong to no task) | P6 | one new engine test (behaviour exists) | `App` "No task" affordance | Rust engine test + `App.test.tsx` |
| 3 | better to-do UI: tags, subtasks with their own pomodoro counts | P7a/P7b/P7c | migration `0002`, new repos, services, commands | `TaskItem`, `TaskList`, forms, new dialog, store, ipc | Rust data-layer tests + component tests |
| — | keep repository docs accurate | P8 | — | — | review |

---

## 3. Non-negotiable rules

These are the failure modes that are hard to diagnose later. Follow them in every phase.

- **Never compute time in JavaScript.** The frontend reads `snapshot.remainingMs` / `totalMs` and formats it. All timing lives in the Rust engine (`src-tauri/src/timer/`).
- **Keep the layering.** `commands/` = parse arguments, call one service/engine method, emit events. `services/` = validation and rules. `repositories/` = SQL only. React components = render + call store actions. No SQL in commands, no business rules in React.
- **Every new IPC command needs four edits**, or the app fails silently at runtime and loudly in tests:
  1. the `#[tauri::command]` function,
  2. registration in `src-tauri/src/lib.rs` → `generate_handler![...]`,
  3. a method in `src/lib/ipc.ts`,
  4. an entry in the fake `answerInvokes` map in `src/App.test.tsx` (**it throws on unknown commands**).
- **`src/lib/types.ts` mirrors `src-tauri/src/models.rs`.** Rust structs use `#[serde(rename_all = "camelCase")]`, so TypeScript sees camelCase field names.
- **Migrations are additive only.** Never edit `migrations/0001_init.sql` — it is already applied on the user's machine. Add `0002_*.sql`. `db::memory_pool()` applies migrations in tests automatically.
- **Run `npm run build` before `cargo test` / `cargo clippy`.** The Rust binary embeds `../dist`, so a stale or missing build breaks compilation.
- **Write the tests first** (repository standard). A phase is done when its tests pass, not when the UI looks right.
- **Reuse existing UI primitives:** `Button`, `IconButton`, `Dialog`, `Toggle`, `TextField`, `NumberField`, `TextAreaField`, `EmptyState` from `src/components/ui/`. Add no dependencies.
- **Errors are user-facing sentences.** Backend errors go through `AppError` (`Validation`, `Conflict`, `NeedsConfirmation`, `NotFound`, `Internal`). In `App.tsx`, wrap actions in `timerAction.run(...)` / `taskAction.run(...)` (`useBusyRunner`): it catches, calls `useUiStore.reportError` and renders the friendly text in `Notice`. Never surface a raw SQL or Rust error, and do not catch-and-report a second time — that shows the message twice.
- **Do not refactor, rename, or reformat code outside the phase's file list.**

---

## 4. Implementation order

Work top to bottom. The first two phases are tiny and independent; the last is the only schema change.

| Order | Phase | Feature | Risk | Files touched (count) | Checkbox |
|---|---|---|---|---|---|
| 1 | P1 | Taskbar clock | S | 1 | [ ] |
| 2 | P2 | Notification start without popup | S | 1 | [ ] |
| 3 | P3 | End session counts as completed | M | ~8 | [ ] |
| 4 | P4 | Focus / Break / Long break tabs | M | ~7 | [ ] |
| 5 | P5 | Edit completed pomodoros | S–M | ~5 | [ ] |
| 6 | P6 | Orphan sessions | S | ~2 | [ ] |
| 7 | P7a | Tags + subtasks: schema and data layer | L | ~9 | [ ] |
| 8 | P7b | Tags UI | M | ~4 | [ ] |
| 9 | P7c | Subtasks UI | L | ~6 | [ ] |
| 10 | P8 | Docs refresh | S | 2 | [ ] |

---

## 5. Phase details

### P1 — Running clock in the taskbar preview

**Why the window title:** on Windows the taskbar hover preview and the taskbar button both display the window title. `src-tauri/tauri.conf.json` sets `"title": "PomoDesk"` and nothing ever changes it. The tray tooltip already shows `Focus · 24:13`, and `tray::refresh` is already invoked on **every 250 ms tick** (`TimerEngine::tick_at` → `TimerHost::refresh_tray`), so no new timer or thread is needed.

**Files:** `src-tauri/src/tray.rs` only.

**Steps**

1. Add `last_title: Mutex<String>` to `TrayHandles`, initialised in `setup()` next to `last_tooltip`.
2. Add a pure, testable helper above `refresh`:

   ```rust
   /// Builds the window title shown in the taskbar preview:
   /// "Focus · 24:13 — PomoDesk" while a session is running or paused,
   /// plain "PomoDesk" when there is nothing to count.
   pub fn window_title(snapshot: &TimerSnapshot) -> String
   ```

   - `TimerStatus::Idle` **and** `remaining_ms >= total_ms` → `"PomoDesk"`.
   - Otherwise `format!("{label} · {} — PomoDesk", format_clock(snapshot.remaining_ms))`, reusing the same `label` mapping already inside `refresh` (`"Focus"`, `"Break"`, `"Long break"`).
3. In `refresh`, update the title **before** the `try_state::<TrayHandles>()` early return, so it also works if the tray failed to build:

   ```rust
   if let Some(window) = app.get_webview_window("main") {
       let title = window_title(snapshot);
       // Set only when the text actually changed; ticks arrive 4x/second.
       if changed { let _ = window.set_title(&title); }
   }
   ```

   Compare against the cached `last_title` when `TrayHandles` exists; when it does not, set it without caching.
4. Leave the existing tooltip and Start/Pause label logic untouched.

**Tests first** (new `#[cfg(test)] mod tests` at the bottom of `tray.rs`):

- idle-at-full snapshot → `"PomoDesk"`;
- running focus with `remaining_ms = 24 * 60 * 1000 + 13_000` → `"Focus · 24:13 — PomoDesk"`;
- long break → starts with `"Long break · "`.

**Verify:** `cd src-tauri && cargo test tray`, then `npm run tauri dev` and hover the taskbar button (clock counts down, freezes on pause).

**Done when:** title updates once per second while running, shows the frozen clock while paused, and reverts to `PomoDesk` when reset.

---

### P2 — Notification buttons start the session without showing the window

The user's complaint: answering the toast with "Start session" / "Start break" opens the app window every time. The cause is a single line in the notification action handler.

**Files:** `src-tauri/src/lib.rs` only.

**Steps**

1. Inside `notification.on_action(...)`, in the `"start"` arm, **delete `tray::show_window(&app);`**. Keep the `timer.start().await` call and the error log.
2. Add `let _ = app.emit("notification:closed", ());` in the same arm, so the ringing chime stops when the user answers the toast (this is what the `"close"` arm already does). The frontend listener in `src/lib/events.ts` already exists.
3. Leave the other arms alone: `"tap"` still opens the window (tapping the toast body means "show me the app"), `"close"` / `"dismiss"` still emit `notification:closed`.

**Tests:** none are possible — the callback needs a live `AppHandle`. Record it as a manual check instead: add one line to the `README.md` "Manual checks" list (also covered by P8).

**Verify:** `cd src-tauri && cargo clippy --all-targets`. Then a release build (`npm run tauri build -- --no-bundle`): finish a focus session, click **Start break** on the toast — the timer starts and the window stays where it was.

**Known OS limitation:** Windows can ignore toast action buttons in unpacked/dev builds. If the buttons do nothing under `tauri dev`, re-test with a release build before investigating the code.

---

### P3 — End session (counts as completed)

**Semantics:** the user is three minutes from the end of a 25-minute focus session and has to stop. Pressing **End** closes the session *as completed*: task `+1`, one row in `sessions`, cycle `+1`, next break chosen, auto-start according to settings — the same pipeline as a natural completion, but the logged duration is the **actual elapsed** time.

**Files:** `src-tauri/src/timer/mod.rs`, `src-tauri/src/commands/timer.rs`, `src-tauri/src/lib.rs`, `src/lib/ipc.ts`, `src/stores/timer.ts`, `src/components/TimerCard.tsx`, `src/App.tsx`, `src/styles.css`, tests in `src-tauri/src/timer/mod.rs` and `src/App.test.tsx`.

**Backend steps**

1. `complete_locked(&self, snapshot, now)` becomes `complete_locked(&self, snapshot, now, duration_override: Option<i64>)`. Its single caller in `tick_at` passes `None`.
2. `record_focus_completion(..., duration_sec: i64)` takes the duration instead of reading `snapshot.total_ms`. Compute once inside `complete_locked`:

   ```rust
   let duration_sec = (duration_override.unwrap_or(snapshot.total_ms) / 1000).max(1);
   ```

3. New public engine method:

   ```rust
   /// Ends the current focus session now and counts it as completed.
   pub async fn end_session(&self) -> Result<TimerSnapshot, AppError>
   ```

   1. lock the snapshot;
   2. if `session_type != SessionType::Focus` → `AppError::conflict("Only a focus session can be ended early. Use Skip to leave a break.")`;
   3. if `!state::is_mid_session(&snapshot)` → `AppError::conflict("This session hasn't started yet.")`;
   4. if running, recompute `remaining_ms` from `ends_at` (use the existing `state::remaining_from_deadline`);
   5. `let elapsed_ms = (snapshot.total_ms - snapshot.remaining_ms).max(1000);`
   6. set `remaining_ms = 0`;
   7. `self.complete_locked(&mut snapshot, now, Some(elapsed_ms)).await;`
   8. return the snapshot.

   Nothing else is needed: the existing pipeline already increments the task counter and cycle, inserts the session row, emits `timer:session_complete` / `timer:state_changed` / `tasks:changed`, notifies, and refreshes the tray.

4. `src-tauri/src/commands/timer.rs`: thin command `end_session(state) -> Result<TimerSnapshot, AppError>`.
5. `src-tauri/src/lib.rs`: register `commands::timer::end_session` in `generate_handler!`.

**Rust tests first** (in the existing `#[cfg(test)]` module of `timer/mod.rs`, using `crate::db::memory_pool()`):

- `ending_a_focus_session_early_counts_it`: start, then `tick_at(ends_at - 20 * 60_000)` (simulates five minutes elapsed), then `end_session()`. Assert `session_count == 1`, `cycle_focus_count == 1`, `session_type == ShortBreak`, and `SELECT duration_sec FROM sessions` is between 295 and 305.
- `ending_a_focus_session_credits_the_active_task`: same setup with an active task; assert `completed_slots == 1`.
- `ending_a_break_is_refused`: assert the error is a conflict.
- `ending_a_session_that_never_started_is_refused`: same.

**Frontend steps**

6. `src/lib/ipc.ts`: `endSession: () => call<TimerSnapshot>("end_session")`.
7. `src/stores/timer.ts`: action `endSession` that sets the returned snapshot (same shape as `skip`).
8. `src/components/TimerCard.tsx`: new prop `onEnd: () => void`. Render it only when `snapshot.sessionType === "focus"` and (`status === "running"`, or paused with `remainingMs < totalMs`):

   ```tsx
   <button type="button" onClick={onEnd} disabled={busy}
           className="timer-card__end"
           title="End this session now and count it as completed">
     End
   </button>
   ```

   Place it after the skip button in the existing control row.
9. `src/styles.css`: `.timer-card__end` — transparent background, `1px solid rgb(255 255 255 / 0.45)`, white text, `padding: 8px 14px`, `border-radius: 8px`, hover `rgb(0 0 0 / 0.22)`, `:disabled` matching `.timer-card__secondary`. Keep the compact, contiguous rule style used in this file.
10. `src/App.tsx`: copy the shape of the existing `skipTimer` callback exactly:

    ```tsx
    const endTimer = useCallback(() => {
      stopCompletionSound();
      return timerAction.run(() => useTimerStore.getState().endSession());
    }, [timerAction]);
    ```

    `useBusyRunner` already reports failures to the user — do **not** add another `catch`/`reportError`. Pass `onEnd={endTimer}` to `TimerCard`.
11. `src/App.test.tsx`: add `end_session: idleTimer` to `answerInvokes`; add a test that renders a running focus snapshot, clicks `button { name: /end/i }`, and asserts `invoke` was called with `"end_session"`.

**Verify:** `npm test` · `npm run build` · `cd src-tauri && cargo test` · `cargo clippy --all-targets`.

**Done when:** ending a focus session at 5:00 elapsed shows the completion sound + toast, the task's badge goes up by one, stats gain ~5 minutes, and the app moves to the break.

---

### P4 — Focus / Short break / Long break tabs inside the timer card

Reuses the preset-switch confirmation contract (`AppError::NeedsConfirmation` → frontend dialog → retry with `force`), so the app behaves consistently: discarding a **focus session in progress** asks for confirmation; leaving a break is silent.

**Files:** `src-tauri/src/timer/mod.rs`, `src-tauri/src/commands/timer.rs`, `src-tauri/src/lib.rs`, `src/lib/ipc.ts`, `src/stores/timer.ts`, `src/components/TimerCard.tsx`, `src/App.tsx`, `src/styles.css`, tests in `timer/mod.rs` and `App.test.tsx`.

**Backend steps**

1. New engine method:

   ```rust
   /// Switches the current session type. A focus session in progress needs
   /// confirmation, exactly like switching presets does.
   pub async fn switch_session_type(&self, kind: SessionType, force: bool)
       -> Result<TimerSnapshot, AppError>
   ```

   Order of checks:
   1. if `kind == snapshot.session_type && snapshot.status != TimerStatus::Idle` → return the snapshot unchanged (clicking the active tab must never punish the user);
   2. load the active preset (same helper `switch_preset` uses);
   3. if `!force && kind != snapshot.session_type && is_mid_session(&snapshot)` → `AppError::NeedsConfirmation` with message `"Switch to <label>? Your current focus session (<clock> left) will be discarded and won't count."`, plus the usual `remaining_ms` / `preset_name` fields;
   4. otherwise `state::advance_to(&mut snapshot, kind, &preset, false, now)` then `after_change`.
   5. `cycle_focus_count` is **not** touched (matches preset switching).

2. `commands/timer.rs`: `switch_session_type(state, session_type: SessionType, force: bool)`. Tauri maps `session_type` to `sessionType` on the JS side, consistent with the existing `preset_id` → `presetId`.
3. Register the command in `lib.rs`.

**Rust tests first**

- idle focus → short break switches silently;
- running focus → long break returns `NeedsConfirmation`;
- retry with `force = true` lands on `LongBreak` / `Idle`, with `session_count == 0` and the cycle unchanged;
- clicking the current break tab is a no-op.

**Frontend steps**

4. `ipc.ts`: `switchSessionType: (sessionType: SessionType, force: boolean) => call<TimerSnapshot>("switch_session_type", { sessionType, force })`.
5. `stores/timer.ts`: `switchSessionType` action that throws on error (like `switchPreset`) so the caller can inspect `IpcError.code === "NEEDS_CONFIRMATION"`.
6. `TimerCard.tsx`:
   - new prop `onSelectMode: (mode: SessionType) => void`;
   - keep the section label but make it assistive-only (`<h2 id="timer-mode-label" className="sr-only">`), and render the visible tablist in its place:
     ```tsx
     <div role="tablist" aria-label="Session type" className="timer-tabs">
       {(["focus", "short_break", "long_break"] as const).map((mode) => (
         <button key={mode} type="button" role="tab" className="timer-tab"
                 aria-selected={snapshot.sessionType === mode}
                 disabled={busy} onClick={() => onSelectMode(mode)}>
           {MODE_LABEL[mode]}
         </button>
       ))}
     </div>
     ```
   - keep the cycle badge on the same row, right-aligned.
7. `styles.css`: `.timer-tabs` (flex, `gap: 6px`, translucent track `rgb(0 0 0 / 0.18)`, `border-radius: 10px`, `padding: 4px`), `.timer-tab` (white text, `border: none`, `padding: 5px 10px`, `border-radius: 7px`), `.timer-tab[aria-selected="true"]` (**white background, `var(--text-primary)` text** — the same high-contrast treatment `.preset-tab[aria-selected]` uses), `.timer-tab:disabled`.
8. `App.tsx`: turn `pendingSwitch` from `{ presetId, message }` into a union
   `{ kind: "preset"; presetId: number; message: string } | { kind: "mode"; mode: SessionType; message: string }`.
   - `selectMode` mirrors `selectPreset` and, on `IpcError` with code `NEEDS_CONFIRMATION`, stores `{ kind: "mode", mode, message }`.
   - `confirmSwitch` branches on `kind`.
   - The `ConfirmDialog` title/label becomes `"Switch preset?"` / `"Switch preset"` for presets and `"Switch session?"` / `"Switch session"` for modes.
9. `App.test.tsx`: add `switch_session_type: idleTimer`; test that clicking the `Long break` tab invokes `"switch_session_type"` with `{ sessionType: "long_break", force: false }`; second test where the fake rejects with `{ code: "NEEDS_CONFIRMATION", message, remainingMs, presetName }` → dialog appears → confirm sends `force: true`.

**Verify:** same four commands as P3.

---

### P5 — Editing completed pomodoros

Correction of the task counter only. It does **not** rewrite the `sessions` table, so statistics and streaks stay honest. The dialog says so in plain language.

**Files:** `src-tauri/src/models.rs`, `src-tauri/src/repositories/tasks.rs`, `src-tauri/src/services/tasks.rs`, `src/lib/types.ts`, `src/components/EditTaskDialog.tsx`, new `src/components/EditTaskDialog.test.tsx`.

**Backend steps**

1. `models.rs`: `TaskInput.completed_slots: Option<i64>` with `#[serde(default)]`. `None` means "leave unchanged", so the quick-add form can never reset a count.
2. `repositories/tasks.rs` `update`: bind the value and keep the old one when absent:

   ```sql
   UPDATE tasks SET title = ?, note = ?, est_slots = ?,
                    completed_slots = COALESCE(?, completed_slots)
   WHERE id = ?
   ```

3. `services/tasks.rs` `validate`: when `Some(n)`, require `0..=999`, otherwise `AppError::validation("Pomodoros done must be between 0 and 999.")`. `create` always stores `0` regardless of the input.
4. Rust tests: `Some(7)` sets 7; `None` leaves 3 unchanged; `Some(5000)` is refused.

**Frontend steps**

5. `types.ts`: `TaskInput { title; note; estSlots; completedSlots?: number | null }`.
6. `EditTaskDialog.tsx`: add state for the count and a `NumberField` labelled **Pomodoros done** (`min={0} max={999}`, hint: "Correct this if a session was counted by mistake. Your statistics won't change."). Include `completedSlots` in the save payload. `AddTaskForm` stays unchanged (it omits the field).
7. New `src/components/EditTaskDialog.test.tsx`, following `AddTaskForm.test.tsx` conventions: saving sends `completedSlots`; `0` is accepted; `1000` shows the field-level error and does not submit.

**Verify:** `npm test` · `npm run build` · `cargo test`.

Subtask counts reuse the same `Option<i64>` pattern in P7.

---

### P6 — Orphan sessions

The backend already supports them: `record_focus_completion` logs `task_id = NULL` when `app_state::ACTIVE_TASK_ID` is absent, and `services::tasks::set_active(pool, None)` clears it. What is missing is **discoverability** and a **regression test**.

**Files:** `src-tauri/src/timer/mod.rs` (tests), `src/App.tsx`, `src/App.test.tsx`.

**Steps**

1. `timer/mod.rs` — new test `a_focus_session_without_an_active_task_is_logged`: no tasks at all → run one focus session to completion → `session_count == 1`, `SELECT task_id FROM sessions` is `NULL`, `cycle_focus_count == 1`, and no error is returned.
2. `App.tsx` — make the orphan mode an explicit, visible choice in the "Working on" card:
   - when a task is active: the existing `Clear` button is relabelled **"No task"**, with `title="Run sessions without counting them against a task"` and a matching `aria-label`;
   - when no task is active: the copy reads *"No task — this focus time won't be counted against anything. Pick one below to start counting."* and a `badge badge--neutral` labelled **"Orphan session"** sits next to the heading, so the state is visible rather than an absence.
3. `App.test.tsx`: with one task, clicking `No task` invokes `"set_active_task"` with `{ id: null }`; with no active task, the text `Orphan session` is present.

**Verify:** `npm test` · `cargo test`.

**Done when:** a user can start, finish, and see a session with no task attached even while tasks exist in the list.

---

### P7 — Tags and subtasks with their own pomodoro counts

The largest change, and the only schema change. Split into three shippable steps. Run the full suite between them.

#### P7a — Schema, models, data layer

1. New `src-tauri/migrations/0002_task_tags_and_subtasks.sql` (additive; `0001` is already applied on the user's machine):

   ```sql
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
   ```

   `COLLATE NOCASE UNIQUE` means "Work" and "work" are the same tag with no application logic.

2. `models.rs`
   - `Task` gains `tags: Vec<String>` and `subtasks: Vec<Subtask>`.
   - `TaskInput` gains `tags: Vec<String>` (`#[serde(default)]`) and keeps `completed_slots: Option<i64>` from P5.
   - New `SubtaskRow` (`sqlx::FromRow`) and `Subtask` (`Serialize`, camelCase): `id, task_id, title, est_slots, completed_slots, is_done, is_active, created_at, completed_at`.
   - New `SubtaskInput { title, est_slots, completed_slots: Option<i64> }`.
   - `Task::from_row` keeps its signature; tags and subtasks are attached by the service.
3. New `repositories/tags.rs` (SQL only): `list_for_tasks(conn)` (one join query returning `(task_id, name)`), `find_or_create(conn, name)` (`INSERT … ON CONFLICT(name) DO NOTHING` then `SELECT id`), `replace_for_task(conn, task_id, names)`, `delete_orphans(conn)`.
4. New `repositories/subtasks.rs` (SQL only): `list_all(conn)`, `get`, `insert`, `update`, `set_done`, `delete`, `credit_slot`, `count_done_for_task`.
5. `services/tasks.rs`
   - `list` / `create` / `update` attach tags and subtasks. Fetch `tags::list_for_tasks` and `subtasks::list_all` **once** and group into `HashMap<i64, Vec<_>>` — no N+1 queries.
   - Validation extended: tags are trimmed, non-empty, max **5** per task, max **24** characters each, de-duplicated case-insensitively; otherwise `AppError::validation("Keep tags to 5 or fewer, 24 characters each.")`.
   - `update` writes tags through `replace_for_task` on the same connection, then `delete_orphans`.
   - `delete` relies on `ON DELETE CASCADE` (foreign keys are already enabled in `db.rs`).
   - New `set_active_subtask(pool, id: Option<i64>)`: validates the subtask exists, is not done, writes `app_state::ACTIVE_SUBTASK_ID`, **and also sets the parent task active** (a focused subtask implies its task).
6. `repositories/app_state.rs`: `pub const ACTIVE_SUBTASK_ID: &str = "active_subtask_id";`
7. `timer/mod.rs` crediting: inside `record_focus_completion`, on the **same transaction**, after crediting the task, read `ACTIVE_SUBTASK_ID`; if present and `subtask.task_id == credited task`, call `subtasks::credit_slot`. Errors are logged only — a credit failure must never freeze the timer (same rule the engine already follows).
8. `services/tasks.rs` `set_active(None)` must also clear `ACTIVE_SUBTASK_ID`, so orphan mode is unambiguous.
9. Commands: `create_subtask`, `update_subtask`, `set_subtask_done`, `delete_subtask`, `set_active_subtask` (each emits `tasks:changed`). Register in `lib.rs`, add to `ipc.ts` and to the `App.test.tsx` fakes.
10. Rust tests: find-or-create de-duplicates `"Work"`/`"work"`; editing tags replaces the set and removes orphans; deleting a task cascades its subtasks and tag links; a completed focus credits both the task and its active subtask; 6 tags are rejected; a subtask belonging to another task is never credited.

#### P7b — Tags UI

11. `AddTaskForm.tsx` / `EditTaskDialog.tsx`: one `TextField` labelled **Tags**, placeholder `"work, deep-focus"`, hint `"Up to 5, separated by commas"`. Parse with `value.split(",").map(t => t.trim()).filter(Boolean)`.
12. `TaskItem.tsx`: after the title, render `task.tags.map(t => <span className="tag-chip">{t}</span>)`.
13. `styles.css`: `.tag-chip` — `background: var(--surface-sunken)`, `color: var(--text-secondary)`, `border-radius: 4px`, `padding: 1px 6px`, `font-size: 11px`. The text itself carries the meaning, so contrast, not colour alone, is what must pass.
14. Tests: `TaskList` renders a chip; `AddTaskForm` sends `tags: ["work"]` for input `"work , "`.

#### P7c — Subtasks UI

15. `TaskItem.tsx`:
    - second line gains a button `"{done}/{total} subtasks"` with `aria-expanded`, toggling a nested `<ul className="subtask-list">`;
    - each row: select circle (existing `.task-select` + `aria-pressed={subtask.isActive}`), title, `x/y` badge, done toggle (`CheckIcon`/`UndoIcon`), edit (`EditIcon`), delete (`TrashIcon`, `tone="danger"`), all through `IconButton`;
    - at the bottom of the expanded area, an inline add form (`TextField` title + `NumberField` pomodoros + `Button` "Add subtask") following `AddTaskForm`'s field-error handling.
16. New `src/components/SubtaskDialog.tsx` mirroring `EditTaskDialog`: Title, Planned pomodoros, Pomodoros done (P5 pattern), Cancel / Save.
17. `TaskList.tsx`: thread the new props `onAddSubtask`, `onToggleSubtaskDone`, `onSelectSubtask`, `onEditSubtask`, `onDeleteSubtask`. `TaskList` keeps its single responsibility: layout and prop plumbing only.
18. `stores/tasks.ts`: `addSubtask`, `updateSubtask`, `toggleSubtaskDone`, `removeSubtask`, `activateSubtask` — each follows the existing pattern (`await ipc.*` then `set({ tasks: await ipc.listTasks() })`).
19. `App.tsx`: wire callbacks through `taskAction.run`, plus `subtaskForDialog` state for `SubtaskDialog`.
20. Tests: `TaskList.test.tsx` — expanding shows subtasks and adding calls `onAddSubtask` with parsed values; update its `renderList` helpers with the new required props (TypeScript will flag omissions). `App.test.tsx` gains the new commands in its fake map.

**Verify:** `npm test` · `npm run build` · `cargo test` · `cargo clippy --all-targets`, then manually: create a task with two tags and three subtasks, focus a subtask, finish a session → parent and subtask both `+1`.

---

### P8 — Documentation refresh

- `README.md`: extend **Behaviour notes** (early end, mode tabs, orphan sessions, tags/subtasks) and **Manual checks** (taskbar clock, notification buttons starting without opening the window, end session).
- `docs/architecture.md`: add `tags` / `task_tags` / `subtasks` to the schema section and the new IPC commands to the command table.

---

## 6. Decisions needing confirmation

The repository standard forbids silent assumptions, so these are the judgement calls baked into this plan. Each has a one-line alternative.

1. **Early end logs the elapsed time**, not the planned 25:00, so statistics don't inflate. *(Alt: log the full duration.)*
2. **End applies to focus sessions only**; for breaks, the existing Skip already does the right thing.
3. **Mode tabs follow the preset-switch rules:** switching away from a focus session in progress asks for confirmation; leaving a break is silent; clicking the active tab does nothing.
4. **Editing completed pomodoros never rewrites the session log**, so stats stay untouched; the dialog says so.
5. **Tags are normalised** (`tags` + `task_tags`), created implicitly from the task form, max 5 per task, with no separate tag-management screen in this phase.
6. **A task's `completed_slots` stays independent of its subtasks** (crediting increments the task *and* the selected subtask). Summing subtasks would silently rewrite existing user data.
7. **The taskbar clock is the window title**, because that is the text Windows shows in the taskbar preview. Optional follow-up, not in scope: `window.set_progress_bar(...)` for a fill on the taskbar button.

---

## 7. Global verification

Run before declaring any phase complete, from the repository root:

```bash
npm test                     # Vitest + React Testing Library
npm run build                # required before any cargo command (Rust embeds ../dist)
cd src-tauri && cargo test   # engine, services, repositories
cd src-tauri && cargo clippy --all-targets
```

For a phase that changes Rust only, `cargo test <filter>` plus `cargo clippy` is enough. The full suite runs once per phase completion, per the repository standard, not after every edit.

---

## 8. Out of scope

Do not add these while implementing the phases above:

- routing, a second window, or a settings page redesign;
- any new npm or Cargo dependency;
- a tag management screen (rename/delete/merge tags);
- rewriting historical sessions or statistics;
- keyboard shortcuts beyond the existing Space / R / S;
- reformatting or reorganising files that the phase does not list.

---

## 9. Appendix — new IPC surface

| Command | Phase | Arguments | Returns | Events emitted |
|---|---|---|---|---|
| `end_session` | P3 | — | `TimerSnapshot` | `timer:state_changed`, `timer:session_complete`, `tasks:changed` |
| `switch_session_type` | P4 | `sessionType`, `force` | `TimerSnapshot` | `timer:state_changed` |
| `create_subtask` | P7a | `taskId`, `title`, `estSlots` | `Subtask` | `tasks:changed` |
| `update_subtask` | P7a | `id`, `title`, `estSlots`, `completedSlots?` | `Subtask` | `tasks:changed` |
| `set_subtask_done` | P7a | `id`, `done` | `Subtask` | `tasks:changed` |
| `delete_subtask` | P7a | `id` | `void` | `tasks:changed` |
| `set_active_subtask` | P7a | `id` (nullable) | `void` | `tasks:changed` |

Existing commands reused without signature changes: `get_timer_state`, `start`, `pause`, `resume`, `skip`, `reset`, `switch_preset`, `list_tasks`, `create_task`, `update_task`, `set_task_done`, `delete_task`, `set_active_task`, `get_stats`, `get_settings`, `update_settings`, list/save/delete presets.
