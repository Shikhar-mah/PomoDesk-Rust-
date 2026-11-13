# PomoDesk

A small, offline pomodoro timer for the desktop: one window, timer presets,
a task list, and just enough statistics to see whether the week went well.

Built with **Tauri 2** (Rust core) + **React / TypeScript / Vite** + **Tailwind CSS**
+ **SQLite** (sqlx) + **zustand**. No account, no network, no telemetry.

---

## Running it

Prerequisites (already installed on this machine):

- Node.js 20+
- Rust (stable, MSVC toolchain) and the Visual Studio C++ build tools
- WebView2 runtime (ships with Windows 11)

```bash
npm install          # once
npm run tauri dev    # develop: starts Vite + the desktop shell
npm run tauri build  # produce an installer in src-tauri/target/release/bundle
```

Tests:

```bash
npm test                              # frontend: vitest + React Testing Library
npm run build                         # type-check + production bundle
cd src-tauri && cargo test            # Rust: timer, services, repositories, DB
cd src-tauri && cargo clippy --all-targets
```

> The Rust side embeds the built frontend (Tauri reads `../dist` when it
> compiles), so run `npm run build` at least once before `cargo test`,
> `cargo clippy` or `cargo run`.

---

## How it works

The Rust core owns everything that must not drift or be lost:

- **Timer** — a wall-clock deadline (`ends_at`) is stored, and a tokio task
  recomputes the remaining time every 250 ms. Minimising or closing the window
  cannot make the clock wrong, because nothing counts down in JavaScript.
  The UI interpolates between ticks with `requestAnimationFrame` for smoothness.
- **Tasks, presets, sessions, settings** — stored in one local SQLite file
  (`pomodesk.db` in the OS app-data folder) through versioned migrations.
- **Tray icon** — Start/Pause, Skip, Restart, Show and Quit, plus a live
  `Focus · 24:13` tooltip, all working with the window closed.
- **Notifications** — fired from Rust when a session ends.

The React view is deliberately thin: it calls commands, renders pushed events and
formats numbers. `src/lib/ipc.ts` is the only file that talks to Rust.

### Layers (Rust)

```
commands/      parse arguments, call a service, emit "something changed"
services/      business rules and validation (what is allowed, and why)
repositories/  all SQL, nothing else
models.rs      the data shapes shared with TypeScript
timer/         the timer state machine (pure functions) + the engine
db.rs          pool, PRAGMAs, migrations, seeded presets
```

Commands never touch SQL, and React never decides timer behaviour.

### Database

`src-tauri/migrations/0001_init.sql` creates `presets`, `tasks`, `sessions` and
`app_state`. The four presets (Classic 25/5/15, Deep Work 50/10/25,
Quick Sprint 15/3/10, Study 45/15/30) are seeded only when the table is empty.

`sessions` stores a snapshot of the preset name and task title, so statistics stay
readable after a preset or task is edited or deleted.

---

## Behaviour notes

These come from `docs/architecture.md`; they are the rules the tests encode.

| Situation | Behaviour |
|---|---|
| Focus session finishes | credits the active task (+1), writes one session row, increments the cycle, picks Short or Long break, auto-starts per settings |
| Skipped or discarded session | never credited, never logged, cycle unchanged |
| Switching preset while a focus session is in progress | confirmation dialog; confirming discards the session |
| Switching preset during a break | switches silently, break is discarded |
| Editing the active preset | applies immediately when idle, otherwise from the next session |
| Marking the active task done | clears the active selection |
| Deleting the last preset | refused |
| First task of the day | no automatic activation — the user picks it |
| Crash while running | restored as **paused**; an expired deadline restores at 0 and completes (and credits) on the next resume |

Cycle counter: `cycle_focus_count` survives preset switches and resets when a long
break finishes. A break is "long" when `count % long_break_every == 0` at the
moment a focus session completes.

---

## Deliberate decisions

- **Sound is synthesised** (WebAudio, two notes) instead of shipping an audio
  file: no binary asset, works offline, still toggleable in Settings.
- **Preset management lives in Settings**, not behind the tabs: tabs are for
  switching, Settings is for editing. Deleting a preset asks inline, avoiding a
  dialog on top of a dialog.
- **No chart library** — the 7-day chart is seven divs.
- **No router** — there is one screen; Stats and Settings are dialogs.
- **Single database connection** — writes are serialised, which removes a whole
  class of SQLite locking problems at this size.
- **Reduced motion** is respected: the ring stops interpolating and mirrors the
  core value directly.

### What was intentionally *not* built

`docs/backend-development-standards.md` describes a networked service. The parts
that make no sense for a local, single-user, offline app were left out:
authentication/JWT, CSRF, RBAC/ABAC, rate limiting, caching (Redis), queues/Kafka,
health/readiness endpoints, API versioning and distributed tracing.

The parts that do apply were kept: layer separation, DTO validation, transactions
for multi-write operations, migrations only, one central error type that maps
technical failures to plain-language messages, and tests at the service layer.

---

## Manual checks (things unit tests cannot cover)

Run `npm run tauri dev` and verify:

1. **Tray** — icon appears; tooltip counts down; Start/Pause, Skip and Restart work
   from the tray with the window closed.
2. **Close to tray** — closing the window hides it; the timer keeps running;
   "Show PomoDesk" brings it back. Turning the setting off makes Close quit.
3. **Notifications** — a system notification appears when a focus session and a
   break end (Windows Focus Assist may suppress it).
4. **Sound** — a short chime plays when a session ends; disabling it in Settings
   silences it.
5. **Restart mid-session** — quit from the tray while a focus session runs,
   reopen: the timer comes back paused with the correct remaining time.
6. **Keyboard** — Space starts/pauses, R restarts, S skips; shortcuts do nothing
   while typing in a field or with a dialog open.
7. **Window resize** — layout holds from 420 px wide upwards without horizontal
   scrolling.
8. **Statistics** — stats reflect only completed focus sessions; finishing the
   day's first session updates "Today" immediately.

---

## Project layout

```
src-tauri/
  migrations/0001_init.sql
  src/
    main.rs, lib.rs        entry point and wiring
    db.rs                  pool, WAL, migrations, seed
    error.rs               AppError → friendly messages
    models.rs              shared structs
    state.rs               AppState
    commands/              presets, tasks, timer, stats, settings
    services/              business rules
    repositories/          SQL
    timer/                 state machine + engine
    tray.rs                tray icon and menu
src/
  App.tsx                  the single screen
  components/              TimerCard, PresetTabs, TaskList, dialogs, ui/
  stores/                  zustand stores
  lib/                     ipc, types, events, format, sound
```
