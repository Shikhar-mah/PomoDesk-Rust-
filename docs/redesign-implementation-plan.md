# PomoDesk — UX Redesign & Independent To-do Module

**Document type:** Implementation plan (planning only)
**Status:** Proposed — no source changes made
**Scope:** Pomodoro task UX redesign, independent To-do Lists module, responsive application sidebar, notification refinement
**Stack:** Tauri 2 · Rust · React 19 · TypeScript · Vite · Tailwind CSS v4 · SQLite (sqlx) · Zustand

---

## Table of contents

- [Verified baseline](#verified-baseline)
- [A. Existing Application Assessment](#a-existing-application-assessment)
  - [A.1 How the application is structured](#a1-how-the-application-is-structured)
  - [A.2 How Pomodoro tasks work today](#a2-how-pomodoro-tasks-work-today)
  - [A.3 Why the current Tasks and Edit Task interfaces feel crowded](#a3-why-the-current-tasks-and-edit-task-interfaces-feel-crowded)
  - [A.4 How notifications work today](#a4-how-notifications-work-today)
  - [A.5 What can be reused vs. what must change](#a5-what-can-be-reused-vs-what-must-change)
- [B. Proposed Application Structure](#b-proposed-application-structure)
  - [B.1 Navigation hierarchy](#b1-navigation-hierarchy)
  - [B.2 Layout](#b2-layout)
  - [B.3 Responsive behaviour and window configuration](#b3-responsive-behaviour-and-window-configuration)
  - [B.4 Component composition](#b4-component-composition)
- [C. Proposed UI/UX Design](#c-proposed-uiux-design)
  - [C.1 Main Pomodoro page](#c1-main-pomodoro-page)
  - [C.2 Pomodoro task section — compact redesign](#c2-pomodoro-task-section--compact-redesign)
  - [C.3 To-do navigation](#c3-to-do-navigation)
  - [C.4 Individual To-do list page](#c4-individual-to-do-list-page)
  - [C.5 To-do task details and subtasks](#c5-to-do-task-details-and-subtasks)
  - [C.6 List management](#c6-list-management)
  - [C.7 Search, filters, sorting and smart views](#c7-search-filters-sorting-and-smart-views)
  - [C.8 Notification settings UX](#c8-notification-settings-ux)
  - [C.9 Interaction and accessibility rules](#c9-interaction-and-accessibility-rules)
- [D. Proposed Data Architecture](#d-proposed-data-architecture)
  - [D.1 Separation principle](#d1-separation-principle)
  - [D.2 Migration `0003_todo_lists.sql`](#d2-migration-0003_todo_listssql)
  - [D.3 Why date and time are stored this way](#d3-why-date-and-time-are-stored-this-way)
  - [D.4 Reminder model and lifecycle](#d4-reminder-model-and-lifecycle)
  - [D.5 Scheduler design](#d5-scheduler-design)
  - [D.6 Shared notification module](#d6-shared-notification-module)
  - [D.7 Rust modules and commands](#d7-rust-modules-and-commands)
  - [D.8 Zustand stores](#d8-zustand-stores)
  - [D.9 Data integrity and deletion behaviour](#d9-data-integrity-and-deletion-behaviour)
  - [D.10 Existing tables](#d10-existing-tables)
- [E. Notification Improvement Plan](#e-notification-improvement-plan)
  - [E.1 What to retain](#e1-what-to-retain)
  - [E.2 What to improve](#e2-what-to-improve)
  - [E.3 What to add](#e3-what-to-add)
  - [E.4 Reliability matrix](#e4-reliability-matrix)
  - [E.5 Platform limitations](#e5-platform-limitations)
  - [E.6 Recommended notification wording](#e6-recommended-notification-wording)
  - [E.7 Optional, not v1](#e7-optional-not-v1)
- [F. Phased Implementation Roadmap](#f-phased-implementation-roadmap)
  - [Phase 1 — Application shell and responsive sidebar](#phase-1--application-shell-and-responsive-sidebar)
  - [Phase 2 — Pomodoro task UX redesign](#phase-2--pomodoro-task-ux-redesign)
  - [Phase 3 — To-do backend and migration](#phase-3--to-do-backend-and-migration)
  - [Phase 4 — To-do frontend](#phase-4--to-do-frontend)
  - [Phase 5 — Notifications and reminders](#phase-5--notifications-and-reminders)
  - [Phase 6 — Optional enhancements](#phase-6--optional-enhancements)
- [G. Acceptance Criteria](#g-acceptance-criteria)
- [H. Risks and Important Decisions](#h-risks-and-important-decisions)
- [Appendix — Verification commands and manual checks](#appendix--verification-commands-and-manual-checks)

---

## Verified baseline

This plan was written after inspecting the repository. Every file path, table, command, and behaviour below refers to the current codebase.

**Verified facts**

- Single-screen React application: `src/App.tsx` renders the timer and Pomodoro tasks in one `max-w-[560px]` column. There is no router, no sidebar, and no page structure.
- Window configuration: `560×830`, minimum `420×620`, in `src-tauri/tauri.conf.json`.
- `src/styles.css` defines design tokens and component classes, but **has no width breakpoints** — only `prefers-reduced-motion`. Responsive behaviour today is limited to flex wrapping.
- SQLite migrations `0001_init.sql` and `0002_task_tags_and_subtasks.sql` have already been applied in existing installations. sqlx validates migration checksums, so they must not be edited.
- Existing tables: `presets`, `tasks`, `sessions`, `app_state`, `tags`, `task_tags`, `subtasks`.
- Notifications are fired only from Rust on timer completion, gated only by `settings.notifications_enabled`.
- `sqlx`, `chrono`, and `tokio` (with `time` and `sync`) are already dependencies in `src-tauri/Cargo.toml`. **No new npm or Cargo dependency is required for this plan.**
- Frontend tests that will be affected: `src/App.test.tsx`, `src/App.edit.test.tsx`, `src/components/TaskList.test.tsx`, `src/components/TaskItem.test.tsx`, `src/components/AddTaskForm.test.tsx`, `src/components/EditTaskDialog.test.tsx`.

**What could not be verified**

- The reference screenshots mentioned in the brief are not present in the repository or conversation. Only `src-tauri/app-icon.png` exists as an image. Visual conclusions are therefore drawn from components and CSS, not pixel comparison.
- Windows Focus Assist / Do Not Disturb behaviour, toast sound overlap, and Action Center click reporting require manual testing on the installed build.
- Non-Windows notification behaviour was not exercised on this machine.

---

## A. Existing Application Assessment

### A.1 How the application is structured

| Layer | Location | Responsibility |
|---|---|---|
| Entry / wiring | `src-tauri/src/lib.rs` | Plugins, DB init, timer rebuild, tray, notification action handler, command registration |
| Database | `src-tauri/src/db.rs` | App-data SQLite file, WAL, foreign keys on, `max_connections(1)`, `sqlx::migrate!`, default presets |
| Models | `src-tauri/src/models.rs` | Serde structs; camelCase to the frontend; UTC `%Y-%m-%d %H:%M:%S` timestamps |
| Repositories | `src-tauri/src/repositories/*.rs` | All SQL |
| Services | `src-tauri/src/services/*.rs` | Business rules, validation, transactions |
| Commands | `src-tauri/src/commands/*.rs` | Thin Tauri boundary; emits `*:changed` events |
| Timer | `src-tauri/src/timer/mod.rs` | Authoritative timer engine, wall-clock deadline, session completion pipeline |
| Tray | `src-tauri/src/tray.rs` | Tray menu, tooltip, window title |
| Frontend bridge | `src/lib/ipc.ts` | The only `invoke()` call site |
| Frontend events | `src/lib/events.ts` | Copies Rust events into stores and plays the completion sound |
| State | `src/stores/{tasks,timer,settings,presets,stats,ui}.ts` | Zustand; mutations call IPC then reload |
| UI | `src/components/*` and `src/components/ui/*` | Presentational components, shared primitives |
| Styling | `src/styles.css` | Tokens and component classes; Tailwind utilities inline |

### A.2 How Pomodoro tasks work today

- `tasks` stores `title`, `note`, `est_slots`, `completed_slots`, `is_done`, `sort_order`, `created_at`, `completed_at`.
- Exactly one active task is stored in `app_state.active_task_id`; the active subtask lives in `active_subtask_id`.
- Tags are normalized through `tags` + `task_tags`.
- Subtasks are separate rows in `subtasks`, and **each subtask has its own `est_slots` / `completed_slots` / active flag**. They are not plain checklists.
- On a completed focus session, `TimerEngine::complete_locked` (`src-tauri/src/timer/mod.rs`) writes a `sessions` row, credits `tasks.completed_slots` via `task_repo::credit_slot`, credits the active subtask when applicable, and bumps the cycle. It then calls `TauriHost::notify`.
- `services/tasks.rs` enforces: non-empty title, title ≤ 120 chars, note ≤ 2000 chars, 1–99 planned pomodoros, max 5 tags, one active task, completed tasks cannot be active, and completing the active task clears the selection.
- Statistics use `sessions` and `tasks.completed_at` (`count_completed_on`). To-do completion must never touch these.

### A.3 Why the current Tasks and Edit Task interfaces feel crowded

These are concrete causes in the code, not style opinions.

1. **Permanent creation form.**
   `TaskList` always renders `<AddTaskForm />` (`src/components/TaskList.tsx:130`). The form stacks Title, Pomodoros and Tags (`src/components/AddTaskForm.tsx`), so roughly three labelled fields plus a submit button occupy the bottom of the card permanently.

2. **Every row exposes three icon buttons.**
   `TaskItem` always renders complete/reopen, edit and delete icon buttons (`src/components/TaskItem.tsx:106–125`). The same pattern repeats for every subtask row (`:161–182`).

3. **Subtasks add height even when collapsed.**
   Every open task renders a disclosure button, and expanding it reveals a list plus an inline add form (`:128–228`). That inline form uses `TextField` and `NumberField`, both of which render labels and optional hints through `Field`, so it is taller than a simple input.

4. **Expanded cards can contain nine controls.**
   Three for the task, three per subtask, and three for the add-subtask form. The visual hierarchy is flat: title, tag chips, progress badge, note, actions, subtask toggle, subtask rows and form all compete.

5. **The edit dialog is a stacked form inside a height-limited dialog.**
   `.dialog` is `max-height: min(88vh, 760px)`, `.dialog__inner` matches it, and `.dialog__body` scrolls. On a 620px-high window the body gets roughly 400px. `EditTaskDialog` stacks title, note, planned pomodoros, completed pomodoros, done and tags — scrolling is structural, not incidental.

6. **The timer consumes most of the first screen.**
   The timer ring is 260px (`TimerCard.tsx`), plus header, preset tabs and the “Working on” strip. On the minimum-height window, the Tasks card begins below the fold.

7. **No responsive layout exists.**
   With no `@media` rules, the interface simply shrinks. A sidebar cannot be added sensibly without an explicit breakpoint system.

### A.4 How notifications work today

| Concern | Current implementation |
|---|---|
| Trigger | `TimerEngine::complete_locked` when a focus or break session completes |
| Gate | `settings.notifications_enabled` only |
| Sender | `TauriHost::notify` (`src-tauri/src/timer/mod.rs:66`) via `tauri-plugin-notification` 2.8.1 |
| Actions | Action type `pomodesk-session` with `close` and `start`; label is “Start session” or “Start break” depending on the next type |
| Action handling | `lib.rs:75–101` registers one global `on_action`: `tap` shows the window, `close`/`dismiss` stop the chime, `start` starts the next session without opening the window |
| Sound | Frontend plays a bundled chime on `timer:session_complete` and stops it on `notification:closed` (`src/lib/events.ts`, `src/lib/sound.ts`) |
| Settings UI | One “Notifications” toggle plus sound selection in `SettingsDialog.tsx` |
| Reminders | None |
| Persistence of pending notifications | None |
| Permission handling | None; desktop permission is implicitly granted |

### A.5 What can be reused vs. what must change

| Reuse as-is | Modify | Add |
|---|---|---|
| `components/ui/Button.tsx` (`Button`, `IconButton`), `Dialog`, `Field`, `TextField`, `NumberField`, `TextAreaField`, `Toggle`, `EmptyState`, `Icon` | `App.tsx` (shell/navigation, To-do bootstrap) | `components/AppSidebar.tsx` |
| `ConfirmDialog`, `Notice`, `stores/ui.ts` | `TaskList`, `TaskItem`, `AddTaskForm`, `EditTaskDialog`, `SubtaskDialog` (presentation only) | `components/ui/Menu.tsx` |
| `lib/ipc.ts`, `lib/events.ts`, `lib/format.ts`, `lib/cn.ts`, `lib/sound.ts`, `useBusyRunner` | `SettingsDialog` (notification categories, To-do defaults) | `components/TodoPage.tsx`, `TodoTaskList`, `TodoTaskItem`, `TodoQuickAdd`, `TodoDialog`, `TodoListDialog`, `TodoToolbar` |
| Rust layers, `db.rs` pool/migrations, `error.rs`, `app_state` KV, `announce()` pattern in `commands/tasks.rs` | `models.rs` (Settings + new models), `lib.rs` (commands, scheduler, actions), `timer/mod.rs` notify delegation | `migrations/0003_todo_lists.sql`, `repositories/todo_*.rs`, `services/todos.rs`, `services/reminders.rs`, `commands/todos.rs`, `notifications.rs` |

---

## B. Proposed Application Structure

### B.1 Navigation hierarchy

```text
PomoDesk
├── Timer                      ← existing timer + Pomodoro tasks
├── To-do
│   ├── Views
│   │   ├── All tasks
│   │   ├── Today
│   │   ├── Upcoming
│   │   ├── Overdue
│   │   └── Completed
│   ├── Lists
│   │   ├── Inbox              ← default, cannot be archived/deleted
│   │   ├── Personal
│   │   ├── Work
│   │   ├── Learning
│   │   └── + New list
│   └── Archived lists         ← collapsed entry at the bottom of the list group
├── Statistics                 ← existing dialog, opened from sidebar
└── Settings                   ← existing dialog, opened from sidebar
```

**Recommendation: no router dependency.**
Use a small Zustand navigation store (`section: "timer" | "todos"`, `todoView`, `listId`). Reasons: two top-level sections, no URL requirements, desktop-only, and notification deep-links can be handled with an event. A router would add a dependency and an unnecessary abstraction.

### B.2 Layout

```text
┌───────────────┬────────────────────────────────────────────┐
│  PomoDesk     │                                            │
│               │   page content                             │
│  Timer        │   (timer column max 620px, centred;         │
│  To-do        │    to-do column max 760px, left-aligned)    │
│    All        │                                            │
│    Today      │                                            │
│    …          │                                            │
│    Inbox      │                                            │
│    Work       │                                            │
│               │                                            │
│  Stats        │                                            │
│  Settings     │                                            │
└───────────────┴────────────────────────────────────────────┘
```

- The sidebar uses the existing warm neutral palette (`--surface-muted` / `--border-default`), not a dark rail. The timer must remain the visual focal point.
- The main column keeps the existing `max-w-[560px]` timer layout; the To-do page can use a wider `max-w-[760px]` because rows carry more metadata.
- The sidebar list area scrolls independently; the main content scrolls. The app shell never scrolls horizontally.

### B.3 Responsive behaviour and window configuration

The current default width (560px) is below any sensible sidebar breakpoint, so the window default must change. This is a deliberate product decision, not a code convenience.

**Recommended `tauri.conf.json` window:**

```json
{
  "width": 1000,
  "height": 800,
  "minWidth": 420,
  "minHeight": 620
}
```

| Width | Mode | Behaviour |
|---|---|---|
| ≥ 900px | Expanded | 220–232px sidebar; brand, section labels, smart views and lists visible; active item has tinted background, left bar, and `aria-current` |
| 640–899px | Icon rail | 64px rail; Timer, To-do, Stats, Settings icons only, each with `aria-label` and tooltip; list navigation moves into the To-do page as a horizontal selector |
| < 640px | Drawer | Sidebar hidden; 48px top bar with menu toggle and current section title; drawer opens over content, closes on selection, Escape, or backdrop click; focus returns to the toggle |

Implementation notes:

- Use explicit CSS media queries in `src/styles.css` around `.app-shell`, `.app-sidebar`, `.app-rail`, `.app-drawer`. Do not scatter Tailwind responsive prefixes; the layout is easier to reason about in one place.
- The drawer should be a native `<dialog>` with a left-anchored variant (`inset: 0 auto 0 0; margin: 0; height: 100%`). This reuses platform focus trapping and Escape handling, consistent with `Dialog.tsx`.
- On rail and drawer modes, the To-do page shows a compact horizontal selector for Views + Lists. This satisfies “list navigation remains accessible” without fragile hover flyouts.
- The timer card keeps its 260px ring at all sizes; at 420px width it still fits with side padding.

### B.4 Component composition

```text
App
├── AppSidebar
├── main
│   ├── Timer page (existing App markup, unchanged responsibilities)
│   │   ├── PresetTabs
│   │   ├── TimerCard
│   │   ├── Active-task strip
│   │   └── TaskList → TaskItem (redesigned)
│   └── TodoPage (self-contained; owns its dialogs)
│       ├── TodoHeader
│       ├── TodoToolbar
│       ├── TodoQuickAdd
│       └── TodoTaskList → TodoTaskItem
├── StatsPanel
├── SettingsDialog
├── EditTaskDialog / SubtaskDialog
├── TodoDialog / TodoListDialog
├── ConfirmDialog
└── Notice
```

**Keep the timer markup in `App.tsx` for now.**
Do not extract a `TimerPage` in the first phase. `TodoPage` should own its dialogs locally so `App.tsx` grows by only a switch statement, not another 400 lines. This respects “modify over rewrite”.

---

## C. Proposed UI/UX Design

### C.1 Main Pomodoro page

Keep the existing vertical order, because it works and preserves muscle memory:

```text
Preset tabs → Timer card → Working on → Tasks → keyboard hint
```

Changes:

- The header’s Stats/Settings buttons move to the sidebar. The Timer page keeps only the preset tabs and timer.
- The timer column stays at max 560–620px, centred. Wide windows get whitespace, not a stretched timer.
- No To-do content, counts or badges leak onto the Timer page. Completing a To-do must never change the “Working on” strip.
- Timer shortcuts (`Space`, `R`, `S`) should be scoped to the Timer section (or at minimum not fire while the To-do section is active) to prevent accidental timer resets while reading tasks. The existing “don’t steal keys while typing or a dialog is open” guard stays.

### C.2 Pomodoro task section — compact redesign

**Row anatomy (one line by default):**

```text
(●)  Task title that may wrap to 2 lines       2/4  ⋯
     [tag] [tag]  ·  2/5 subtasks · note preview (meta line, only if present)
```

- `(●)` is both the current-task indicator and the selection button. It keeps the existing `task-select` semantics and `aria-pressed`. Active rows get a left accent bar, a subtle tinted background, and the “Current” badge.
- Completion is a real checkbox at the right of the title row (or immediately before the menu). It is always visible because it is a primary action.
- The three icon buttons are replaced by **one** `⋯` menu containing: Edit, Add subtask, Mark complete/reopen, Delete. This is the main clutter reduction.
- Progress stays textual (`2/4`) plus a thin progress bar. Text remains, so it is not colour-only.
- Tags render as at most two chips plus `+n`; the full set is visible in the edit dialog.
- Notes collapse to a single muted line clamped to one line; the full note is in the editor.
- Subtasks collapse to a `2/5 subtasks` disclosure. When expanded, subtask rows show title, slot progress, and a `⋯` menu; the add-subtask row is one line with an optional compact pomodoro count, not two labelled form fields.
- Completed tasks stay behind the existing “Show completed” control. Keep the control (requirement) but restyle it as a compact checkbox in the panel header.
- Hover/focus reveals secondary affordances, but nothing essential is hover-only: the checkbox, menu button and disclosure are always reachable by keyboard.

**Empty/loading/error states:**
Reuse `EmptyState`; keep the existing loading sentence and `banner` error with a retry action.

**Task creation:**

Replace the permanent `AddTaskForm` with a single collapsed `＋ Add task` row at the bottom of the list (recommended, to preserve current flow). When clicked, it expands inline to:

```text
[ Task title…………………………… ]  [ 1 pomodoro ]  [ Add ]  More ▾   ✕
```

- `Enter` submits; after a successful add, clear the title and keep focus for rapid entry.
- “More” reveals optional note and tags inline; it does not open a modal.
- `Escape` or `✕` collapses it.
- Validation messages appear under the title/stepper as today.
- This retains every field of `TaskInput` without occupying space permanently.

**Task editing:**

Keep `EditTaskDialog` but reorganise into sections and reduce height:

1. **Basics** — title (full width), note (2–3 rows).
2. **Focus plan** — planned and completed pomodoros side by side as compact number fields; “Completed” as a small toggle/checkbox in this section, not another stacked field.
3. **Organisation** — tags (full width).
4. Sticky footer: Cancel / Save.

At dialog width ≥ 520px, use a two-column grid inside sections; below that, one column. Keep `.dialog__body` as the only scroll region. Shorten hint text; remove redundant descriptions. This keeps the dialog usable at 420px width without changing any field or save path.

**Subtask editing:**

Keep `SubtaskDialog` but use the same sectioned layout (title + pomodoros + completed). Do not merge subtasks into the main task dialog; that would change behaviour and increase risk.

### C.3 To-do navigation

- At large widths, the sidebar lists Views and Lists directly. The active view/list is highlighted.
- At medium widths, the rail shows a single To-do icon. The To-do page shows a horizontally scrollable selector: `All · Today · Upcoming · Overdue · Completed`, then a divider, then list chips with colour dots.
- At small widths, the drawer contains the full navigation; it closes immediately after choosing a view/list.
- `+ New list` opens `TodoListDialog`; it is not an inline permanent form.
- Archived lists are hidden behind an “Archived” entry at the bottom of the list group, with Restore and Delete actions.

### C.4 Individual To-do list page

**Header:** view or list name, open-task count, and a list `⋯` menu (Rename, Colour/icon, Archive, Delete). Inbox has no Archive/Delete.

**Toolbar (one compact row):** search input, Filter button (popover), Sort select. On narrow widths the sort collapses into the filter popover. Avoid a permanent row of many dropdowns.

**Quick add:** one always-visible single-line input at the top of the list:

```text
＋ Add a task…
```

On focus, reveal three small chips: `Due`, `Priority`, `List` (the list chip is hidden inside a concrete list). Pressing Enter creates with title only, defaulting to the current list, medium priority, and no due date. This is the lowest-interaction path and does not consume vertical space when idle.

**Task row anatomy:**

```text
☐  Task title                                  Today ·  High  ·  2/4  ⋯
   (overdue chip in text + colour, e.g. “Overdue · 2d”)
```

- Checkbox toggles completion; reopening is the same control.
- Due chip shows `Today`, `Tomorrow`, `Wed 26`, or `Overdue · 2d`, with time when set (`Today · 17:00`). Overdue uses the existing danger surface, not a full-row red background.
- Priority is a short word (`Low`/`Medium`/`High`) or a flag with an accessible label; never colour-only.
- Subtask progress (`2/4`) appears only when subtasks exist.
- In smart views, a small list dot and list name are shown; inside a list they are omitted.
- `⋯` menu: Edit, Move up, Move down, Delete. Manual ordering commands are disabled when the current sort is not “Manual”.
- Clicking the title opens the detail dialog.

**Completed tasks:** hidden by default in list and smart views. The toolbar filter offers `Open / All / Completed`; the Completed view shows only completed tasks sorted by `completed_at` descending (recent first).

### C.5 To-do task details and subtasks

Use a single `TodoDialog` (modal, default 520px, `.dialog--wide` where useful):

- **Title** (single line, required).
- **Notes** (textarea, 3 rows).
- **Due** — native date input plus optional time input, side by side at ≥ 520px.
- **Priority** — segmented Low / Medium / High.
- **List** — select.
- **Reminder** — None / At due time / 10 minutes before / 30 minutes before / 1 hour before / Custom…
- A one-line hint under Reminder: “Reminders arrive while PomoDesk is running.”
- **Subtasks** — a checklist with inline add; each row has a checkbox, title, and a delete button. Single level only.
- Footer: `Delete` (danger, left), `Cancel`, `Save`.

Because subtasks are simple here, they use checkboxes and no pomodoro counts. This is intentionally different from Pomodoro subtasks, which remain in `SubtaskDialog`.

### C.6 List management

`TodoListDialog` (create/rename/colour/icon):

- Name field.
- Six colour swatches and six icon choices, fixed sets. Store tokens (`zinc`, `blue`, `green`, `amber`, `rose`, `violet`; `list`, `inbox`, `briefcase`, `user`, `book`, `heart`), not arbitrary hex values.
- Save/Cancel.

Actions:

- **Archive:** removes the list from navigation and excludes its tasks from smart views; restorable from Archived.
- **Restore:** sets `archived_at = NULL`.
- **Delete:** confirmation dialog explaining the task-handling choice:
  - Default: “Move its tasks to Inbox” (recommended and preselected).
  - Explicit alternative: “Delete its tasks too” (destructive).
- Inbox is protected in the service layer, not only in the UI: it cannot be archived or deleted.
- Reorder lists with Move up / Move down in the list menu. No drag-and-drop dependency in v1.

### C.7 Search, filters, sorting and smart views

| Control | Options |
|---|---|
| Search | Title (case-insensitive), scoped to the current view |
| Completion filter | Open (default) / All / Completed |
| Priority filter | Any / Low / Medium / High (multi-select in a popover) |
| Due filter | Any / Today / Next 7 days / Overdue / No date |
| Sort | Manual / Due date / Priority / Created date |

Smart-view definitions:

- **All:** all non-archived lists, open tasks by default.
- **Today:** due today **plus overdue** open tasks (keeps Today actionable).
- **Upcoming:** due after today, open, ascending by due date/time.
- **Overdue:** due before today, open, ascending by due date; stays visible, never hidden.
- **Completed:** completed tasks across non-archived lists, newest completion first.

Filters and sort are component-local state in v1 (reset on view change). They do not need database persistence and should not become settings.

Filtering happens client-side over the loaded `todos` array. At this app’s scale (hundreds to low thousands of tasks) this is simpler than adding a query API and avoids a second source of truth. If the data set grows, a server-side filter command can be added later without changing the UI contract.

### C.8 Notification settings UX

Extend `SettingsDialog` with a clearly separated **Notifications** group:

- `Enable notifications` (existing master).
- `Pomodoro session notifications` (default on).
- `To-do reminders` (default on).
- Existing `Completion sound` controls remain where they are.
- A short honest note: “Notifications are delivered by your operating system. Focus Assist / Do Not Disturb can silence them, and reminders only fire while PomoDesk is running.”
- Optional: a “Send test notification” button to verify OS delivery. Useful because delivery failure cannot be detected programmatically.

Do not add quiet hours in v1. The OS already provides Focus Assist / Do Not Disturb, and a second in-app quiet-hours system creates ambiguous catch-up semantics (see [H.1](#h1-decisions-requiring-attention)).

### C.9 Interaction and accessibility rules

- Every icon-only control has `aria-label` and a tooltip.
- `⋯` menus use `aria-haspopup="menu"`, `aria-expanded`, arrow-key navigation, Home/End, Enter, Escape, and outside-click close. A shared `Menu` primitive avoids duplicating this in Pomodoro and To-do rows.
- Menus must render in a portal to `document.body` because the task card currently uses `overflow-hidden`, which would clip an absolutely positioned menu.
- Focus is always visible via the existing `--focus-ring`.
- Row checkboxes are real `<input type="checkbox">` with accessible names.
- Drawer/dialog close returns focus to the trigger.
- Status is never communicated by colour alone: “Current”, “Overdue”, “High”, `2/4` remain text.

---

## D. Proposed Data Architecture

### D.1 Separation principle

**Pomodoro tasks and To-do tasks share no tables, no models and no completion pipeline.**

- `tasks` / `subtasks` remain exactly as they are.
- `todos` / `todo_subtasks` are new.
- Completing a To-do only updates `todos` (and its own subtasks). It never touches `tasks`, `sessions`, `app_state.active_task_id`, or stats.
- The existing `subtasks` table is **not** reused: Pomodoro subtasks have `est_slots`, `completed_slots` and an active flag, all meaningless for To-do checklists.
- Shared UI primitives and formatting helpers are fine; shared domain logic is not.

### D.2 Migration `0003_todo_lists.sql`

One additive migration. Do not modify `0001` or `0002`.

```sql
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
  due_date     TEXT,   -- 'YYYY-MM-DD' in the user's local calendar
  due_time     TEXT,   -- 'HH:MM' local wall clock; NULL = date only
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
  fire_at      TEXT    NOT NULL,   -- UTC 'YYYY-MM-DD HH:MM:SS'
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
```

Also add an idempotent `ensure_inbox(pool)` call after migrations in `db::init` (and in `db::memory_pool` for tests) as a safety net if the row is ever lost. It should be a single `INSERT ... WHERE NOT EXISTS`, no schema change.

### D.3 Why date and time are stored this way

- `due_date` / `due_time` are **local wall-clock values**, because “Today”, “Tomorrow” and “Overdue” are calendar concepts, not instants.
- SQLite lexicographic ordering works for both formats.
- The reminder’s absolute instant (`fire_at`) is computed in Rust with `chrono::Local` and stored in UTC, matching the existing timestamp convention.
- This avoids off-by-one-day bugs from storing a local due date as a UTC instant.
- DST edge case: when a local time does not exist (spring forward), `chrono::Local.from_local_datetime()` returns `None`. The helper should resolve to the next valid local instant (add one hour) and log it. Ambiguous times pick the earliest occurrence.
- Timezone changes: pending reminders keep the `fire_at` computed when they were set. Editing the due date/time recomputes it. This is predictable and documented.

### D.4 Reminder model and lifecycle

One reminder per task (`UNIQUE(todo_id)`) is enough for v1. Multiple reminders per task are a later enhancement, not a requirement.

| Event | Rule |
|---|---|
| Task created/updated with a reminder | Upsert row; compute `fire_at` from `due_date`/`due_time` and mode |
| Due date/time changed | Recompute `fire_at` for `due`/`before`; keep explicit `custom` time unless the user changes it |
| Reminder set to None | Delete the row |
| Task completed | Delete the row (reopening does **not** resurrect it; user re-sets it) |
| Task deleted | `ON DELETE CASCADE` |
| List deleted | Cascades through `todos` to reminders |
| List archived | Scheduler skips and leaves the row untouched; restoring resumes if not yet fired |
| Snooze | `fire_at = now + N`, `fired_at = NULL` |
| Fired | `fired_at = now` (kept for deduplication) |

**Due-time anchor when no time is set:** 09:00 local on the due date. This makes “at due time” and “10 minutes before” meaningful for date-only tasks. Document it in the reminder selector hint.

### D.5 Scheduler design

New `src-tauri/src/services/reminders.rs`:

- `pub fn spawn(app: AppHandle, pool: SqlitePool)` starts a `tokio` loop with `tokio::time::interval(Duration::from_secs(30))`, running one pass at startup and then every 30 seconds.
- The pass is awaited to completion before the next tick, so passes never overlap.
- On each pass:
  1. Read settings (`services::settings::get`). Exit if the master switch or `todo_reminders_enabled` is off.
  2. Select pending reminders:

     ```sql
     SELECT r.id, r.todo_id, r.fire_at, r.kind, r.lead_minutes,
            t.title, t.due_date, t.due_time, t.is_done, l.archived_at
     FROM todo_reminders r
     JOIN todos t ON t.id = r.todo_id
     JOIN todo_lists l ON l.id = t.list_id
     WHERE r.fired_at IS NULL AND r.fire_at <= ?
     ORDER BY r.fire_at
     LIMIT 50
     ```

  3. Skip/clean rows whose task is done or whose list is archived.
  4. **Claim before showing:**

     ```sql
     UPDATE todo_reminders SET fired_at = ? WHERE id = ? AND fired_at IS NULL
     ```

     Only show the notification if `rows_affected() == 1`. This is the duplicate guard, and it also protects against two app instances running at once (SQLite serialises the claim).
  5. Catch-up policy: if `now - fire_at > 24 hours`, mark fired and do not show a toast (avoid nagging about stale tasks). If within 24 hours, show one notification.
- Pure helper functions (`reminder_message`, `local_due_to_utc`, `is_within_catch_up`) are unit-tested without a running app.
- The scheduler holds no long-lived database connection while showing a toast.

### D.6 Shared notification module

New `src-tauri/src/notifications.rs`:

```rust
pub fn register_action_types(app: &AppHandle);
pub fn notify_session(app: &AppHandle, title: &str, body: &str, next: SessionType);
pub fn notify_reminder(app: &AppHandle, reminder: &DueReminder);
pub async fn handle_action(app: &AppHandle, action: &ActionPerformed);
```

- Register **all** action types once at startup: the existing `pomodesk-session` and a new `pomodesk-todo` with `todo-open`, `todo-done`, `todo-snooze`.
- `TauriHost::notify` delegates to `notify_session`; the `TimerHost` trait and timer tests stay unchanged.
- The `lib.rs` `on_action` handler becomes a thin call to `notifications::handle_action`. Clone `todo_id` out of `action.notification().extra()` **before** spawning, because the action reference is not `'static`.
- The reminder builder attaches `extra("kind", "todo_reminder")`, `extra("todoId", id)`, and `extra("reminderId", id)`.

### D.7 Rust modules and commands

```text
src-tauri/src/
├── models.rs                     + TodoList, TodoListInput, Todo, TodoInput,
│                                   TodoSubtask, TodoSubtaskInput, Reminder,
│                                   ReminderInput, Priority
├── repositories/
│   ├── todo_lists.rs             list/get/insert/update/archive/reorder/delete
│   ├── todos.rs                  list/get/insert/update/set_done/delete/move
│   ├── todo_subtasks.rs          list_for_todos/insert/update/set_done/delete
│   └── todo_reminders.rs         upsert/delete/pending/mark_fired/snooze
├── services/
│   ├── todos.rs                  validation, Inbox protection, list deletion,
│   │                             ordering, reminder recompute
│   └── reminders.rs              scheduler + pure helpers
├── commands/todos.rs             Tauri boundary + `todos:changed` announce
└── notifications.rs              shared toast + action dispatch
```

**Command surface** (registered in `lib.rs`):

| Command | Args | Returns |
|---|---|---|
| `list_todo_lists` | — | `TodoList[]` (including archived) |
| `create_todo_list` | `input` | `TodoList` |
| `update_todo_list` | `id`, `input` | `TodoList` |
| `set_todo_list_archived` | `id`, `archived` | `TodoList` |
| `delete_todo_list` | `id`, `moveToInbox` | `void` |
| `move_todo_list` | `id`, `direction` (`"up"`/`"down"`) | `void` |
| `list_todos` | — | `Todo[]` with nested subtasks + reminder |
| `create_todo` | `input` | `Todo` |
| `update_todo` | `id`, `input` | `Todo` |
| `set_todo_done` | `id`, `done` | `Todo` |
| `delete_todo` | `id` | `void` |
| `move_todo` | `id`, `direction` | `void` |
| `create_todo_subtask` | `todoId`, `title` | `TodoSubtask` |
| `update_todo_subtask` | `id`, `title` | `TodoSubtask` |
| `set_todo_subtask_done` | `id`, `done` | `TodoSubtask` |
| `delete_todo_subtask` | `id` | `void` |
| `snooze_todo_reminder` | `todoId`, `minutes` | `void` |

`TodoInput` carries the reminder configuration and list assignment, so `create_todo`/`update_todo` can validate and recompute the reminder in the same transaction. `snooze_todo_reminder` stays separate because it is a notification action.

Events:

- `todos:changed` after every mutation (same pattern as `tasks:changed`).
- `todos:reveal` with `{ todoId }` emitted by the notification action handler. The frontend switches to the To-do section and opens that task’s detail dialog.

**TypeScript mirrors** (in `src/lib/types.ts`):

```ts
export type TodoPriority = "low" | "medium" | "high";
export type TodoView =
  | "all" | "today" | "upcoming" | "overdue" | "completed" | "list" | "archived";

export interface TodoList {
  id: number;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  isInbox: boolean;
  archivedAt: string | null;
  createdAt: string;
}

export interface TodoReminder {
  fireAt: string;
  kind: "due" | "before" | "custom";
  leadMinutes: number | null;
  firedAt: string | null;
}

export type ReminderInput =
  | { mode: "due" }
  | { mode: "before"; leadMinutes: number }
  | { mode: "custom"; at: string }; // local 'YYYY-MM-DDTHH:MM'

export interface TodoSubtask {
  id: number;
  todoId: number;
  title: string;
  isDone: boolean;
  sortOrder: number;
  createdAt: string;
  completedAt: string | null;
}

export interface Todo {
  id: number;
  listId: number;
  title: string;
  note: string;
  isDone: boolean;
  priority: TodoPriority;
  dueDate: string | null;   // 'YYYY-MM-DD' local
  dueTime: string | null;   // 'HH:MM' local
  sortOrder: number;
  createdAt: string;
  completedAt: string | null;
  subtasks: TodoSubtask[];
  reminder: TodoReminder | null;
}

export interface TodoInput {
  title: string;
  note: string;
  listId: number;
  priority: TodoPriority;
  dueDate: string | null;
  dueTime: string | null;
  reminder: ReminderInput | null;
}
```

### D.8 Zustand stores

New `src/stores/todos.ts`:

```ts
interface TodosStore {
  lists: TodoList[];
  todos: Todo[];
  loading: boolean;
  error: string | null;

  load(): Promise<void>;

  createList(input: TodoListInput): Promise<TodoList>;
  updateList(id: number, input: TodoListInput): Promise<void>;
  setListArchived(id: number, archived: boolean): Promise<void>;
  deleteList(id: number, moveToInbox: boolean): Promise<void>;
  moveList(id: number, direction: "up" | "down"): Promise<void>;

  add(input: TodoInput): Promise<void>;
  edit(id: number, input: TodoInput): Promise<void>;
  toggleDone(id: number, done: boolean): Promise<void>;
  remove(id: number): Promise<void>;
  move(id: number, direction: "up" | "down"): Promise<void>;

  addSubtask(todoId: number, title: string): Promise<void>;
  editSubtask(id: number, title: string): Promise<void>;
  toggleSubtask(id: number, done: boolean): Promise<void>;
  removeSubtask(id: number): Promise<void>;

  snooze(todoId: number, minutes: number): Promise<void>;
}
```

Follow the existing `stores/tasks.ts` pattern: await IPC, then reload `list_todos` (and `list_todo_lists` when lists change). This is simpler than optimistic patching and consistent with the codebase.

New `src/stores/navigation.ts`:

```ts
type Section = "timer" | "todos";
type TodoView =
  | "all" | "today" | "upcoming" | "overdue" | "completed" | "list" | "archived";

interface NavigationState {
  section: Section;
  todoView: TodoView;
  listId: number | null;
  sidebarOpen: boolean;
  setSection(section: Section): void;
  openView(view: TodoView): void;
  openList(id: number): void;
  setSidebarOpen(open: boolean): void;
}
```

`App.tsx` bootstraps `useTodoStore.getState().load()` alongside the existing loads so the sidebar can show lists while on the Timer page. A To-do load failure must not block the timer; it is shown on the To-do page and as a small sidebar hint.

### D.9 Data integrity and deletion behaviour

| Operation | Behaviour |
|---|---|
| Delete To-do task | Cascades its `todo_subtasks` and `todo_reminders`; no effect on Pomodoro data |
| Complete To-do task | Sets `is_done` + `completed_at`, deletes its reminder; subtasks unchanged (the user may still check them) |
| Reopen To-do task | Clears `completed_at`; reminder is not restored |
| Delete list, default | Transaction: move `todos.list_id` to Inbox, then delete the list |
| Delete list, explicit | Delete the list and let `ON DELETE CASCADE` remove its tasks/subtasks/reminders |
| Delete Inbox | Rejected in `services/todos.rs` with `AppError::conflict(...)` |
| Archive list | `archived_at` set; tasks and reminders retained |
| Restore list | `archived_at = NULL`; tasks return to smart views |
| Reorder | Swap `sort_order` inside a transaction; new tasks/lists append with `MAX(sort_order) + 1` |
| Pomodoro task completion | Existing pipeline unchanged; never touches `todos` |
| To-do completion | Never touches `tasks`, `sessions`, `app_state`, or stats |

### D.10 Existing tables

`presets`, `tasks`, `tags`, `task_tags`, `subtasks`, `sessions`, `app_state` are untouched.

The only non-table change is new keys inside the existing settings JSON (`app_state.settings`). `Settings` already has `#[serde(rename_all = "camelCase", default)]`, so adding fields is backward compatible with existing stored JSON — missing keys use `Default`.

New settings fields:

- `pomodoroNotifications: bool` (default `true`)
- `todoRemindersEnabled: bool` (default `true`)
- Existing `notificationsEnabled` remains the master switch.
- No new sound field for reminders; no default lead-time setting in v1.

---

## E. Notification Improvement Plan

### E.1 What to retain

- OS notifications through `tauri-plugin-notification`; no second notification mechanism.
- Rust-side sending. `src-tauri/capabilities/default.json` can stay at `core:default`; the frontend does not need notification permissions.
- The existing timer notification wording and Close/Start actions.
- The existing completion chime and its settings.
- The master `notifications_enabled` switch.
- `tray::show_window` on tap.

### E.2 What to improve

1. **Category gating.**
   Timer notifications require master + `pomodoroNotifications`; reminders require master + `todoRemindersEnabled`.

2. **Single shared notifier.**
   Move toast construction and action-type registration into `notifications.rs`; register action types once at startup instead of on every timer completion.

3. **Action handler hygiene.**
   Parse action IDs and `extra` synchronously, then spawn async work. No duplicated match logic in `lib.rs`.

4. **Pomodoro message specificity.**
   When a focus session is credited to a task, include the task title: `Focus session complete` / `25 minutes on “Write report” · time for a break`. This is optional polish and must not change timing or `SessionCompletePayload`.

5. **No sound stacking.**
   Investigate whether the OS toast sound and the `sound.ts` chime overlap on Windows. If they do, recommend relying on the OS toast sound when notifications are enabled, and keep the chime for in-app completion when toasts are disabled. Verify on Windows before changing behaviour.

6. **Notification settings UX.**
   Add the Notifications group and the honest OS limitation note; optionally a test-notification button.

### E.3 What to add

- Per-task reminders (due / before / custom), one per task.
- A 30-second Rust scheduler with startup catch-up.
- `Open`, `Done`, and `Snooze 10 min` actions for reminder toasts.
- Deep-link `todos:reveal` to open the task.
- A snooze menu in the To-do task `⋯` menu as a fallback (5 min, 15 min, 1 hour, tomorrow).
- Reminder overview implicitly through Today / Overdue / Upcoming views. No separate notification history in v1.

### E.4 Reliability matrix

| Requirement | Mechanism |
|---|---|
| No duplicates | Claim-first `UPDATE ... WHERE fired_at IS NULL`; only notify when one row was claimed; single scheduler loop; safe across two app instances |
| Cancel on task delete | `ON DELETE CASCADE` on `todo_reminders.todo_id` |
| Update on deadline change | `fire_at` recomputed inside the `update_todo` transaction |
| Skip completed tasks | Reminder deleted on completion **and** scheduler filters `is_done = 0` |
| Skip archived lists | Scheduler joins `todo_lists.archived_at` |
| Catch-up after restart | Startup pass; notify once if ≤ 24h late, otherwise mark fired silently |
| Denied OS permission | Desktop plugin always reports `Granted`; cannot be detected. Do not fake a permission flow. Explain OS-level suppression in Settings |
| Settings persist | Existing JSON blob with serde defaults |
| Local time/date | Local `due_date`/`due_time`; `fire_at` computed with `chrono::Local`, stored UTC |
| No overdue nagging | One reminder row, `fired_at` set once; no repeat until explicitly snoozed or re-set |
| App fully closed | No delivery; catch-up on next launch. Stated in UI and docs |

### E.5 Platform limitations

Verified in `tauri-plugin-notification` 2.8.1:

| Limitation | Consequence |
|---|---|
| Desktop `permission_state()` and `request_permission()` always return `Granted` | No app-level “permission denied” state; Windows Focus Assist / macOS Focus can still suppress toasts silently |
| Windows click reporting only while the toast is on screen; Action Center clicks are not reported | `Open`/`Done`/`Snooze` actions are reliable only while the toast is visible; after it moves to Action Center they may do nothing |
| Windows/macOS `remove_active()` does nothing | A reminder already shown cannot be retracted if the task is deleted; only future reminders can be cancelled |
| macOS shows multiple actions in an “Options” menu and identifies them by title | Action wording must be stable and distinct |
| `builder.show()` on Windows/macOS spawns and discards the OS result | Delivery failure cannot be surfaced to the app; a test-notification button and Settings copy are the honest UX |
| Scheduling/grouping options are ignored on desktop | The Rust scheduler, not the plugin, owns timing |
| Linux/BSD action support depends on the notification daemon | Treat actions as best-effort outside Windows/macOS |

### E.6 Recommended notification wording

- **Focus complete:** `Focus session complete` / `25 minutes on “Write report”. Time for a break.`
- **Break complete:** keep existing wording.
- **Reminder (lead):** title = task title (truncate ~60 chars); body = `Due in 10 minutes · Today at 17:00 · Work`.
- **Reminder (due):** body = `Due now · Today at 17:00 · Work`.
- **Reminder (late):** body = `Was due at 17:00 · Work` — only once; no repeated overdue notifications.
- **Actions:** `Open`, `Done`, `Snooze 10 min`. Longer snooze options live in the in-app menu, not the toast.

### E.7 Optional, not v1

- In-app notification history / reminder inbox.
- Quiet hours.
- Per-list reminder defaults.
- Multiple reminders per task.
- A “snooze until tomorrow” toast action.

---

## F. Phased Implementation Roadmap

Ordered by dependency, not visual importance.

### Phase 1 — Application shell and responsive sidebar
**Size: M**

- **Objective:** introduce navigation without changing timer behaviour.
- **Features:** sidebar with Timer, Statistics, Settings; expanded / rail / drawer modes; window default 1000×800; responsive CSS; keyboard-accessible drawer.
- **Affected files:** `src/App.tsx`, `src/styles.css`, `src-tauri/tauri.conf.json`.
- **New files:** `src/components/AppSidebar.tsx`, `src/stores/navigation.ts`, `src/components/AppSidebar.test.tsx`.
- **Database changes:** none.
- **Depends on:** nothing.
- **Verification:**
  - `npm test` passes.
  - Manual resize at 420, 640, 900, 1000, and 1280px.
  - Stats and Settings still open.
  - Timer controls unchanged.
  - Drawer closes on selection, Escape, and backdrop click, and returns focus.
- **Risk control:** do not extract timer markup into a new page; only wrap it.

### Phase 2 — Pomodoro task UX redesign
**Size: M**

- **Objective:** make the existing Tasks section compact without losing features.
- **Features:** single-line rows, one `⋯` menu, disclosure subtasks, collapsible quick add, sectioned edit dialog, compact subtask editor, Show Completed retained.
- **Affected files:** `TaskList.tsx`, `TaskItem.tsx`, `AddTaskForm.tsx`, `EditTaskDialog.tsx`, `SubtaskDialog.tsx`, `styles.css`.
- **New files:** `src/components/ui/Menu.tsx` (+ test).
- **Database changes:** none.
- **Depends on:** Phase 1 for layout; can run in parallel with Phase 3.
- **Verification:**
  - All existing task behaviours still work: create, edit, complete/reopen, delete, set active, add/edit/complete/delete subtask, credit focus sessions, Show Completed.
  - Tests in `TaskItem.test.tsx`, `TaskList.test.tsx`, `AddTaskForm.test.tsx`, `EditTaskDialog.test.tsx` are updated and passing.
  - Keyboard-only pass.
  - Menu is not clipped.
- **Regression check:** run one focus session with an active task and confirm `completed_slots`, `sessions`, and stats are unchanged.

### Phase 3 — To-do backend and migration
**Size: M**

- **Objective:** a complete, tested data layer with no UI.
- **Features:** `0003` migration, Inbox seed/ensure, list CRUD/archive/reorder, task CRUD/move/done, subtask CRUD, reminder row lifecycle, event announce.
- **Affected files:** `db.rs`, `models.rs`, `repositories/mod.rs`, `services/mod.rs`, `commands/mod.rs`, `lib.rs`.
- **New files:** `migrations/0003_todo_lists.sql`, `repositories/todo_lists.rs`, `repositories/todos.rs`, `repositories/todo_subtasks.rs`, `repositories/todo_reminders.rs`, `services/todos.rs`, `commands/todos.rs`.
- **Database changes:** only `0003`.
- **Depends on:** nothing (but must be merged before Phases 4 and 5).
- **Verification:**
  - `cargo test` and `cargo clippy --all-targets` pass.
  - Unit tests for:
    - Inbox cannot be deleted or archived.
    - Delete list moves tasks to Inbox, or deletes them when asked.
    - Completing a To-do leaves `tasks`, `sessions`, and `app_state` untouched.
    - Reminder row deleted on completion and task delete.
    - Reordering is scoped per list.
    - Validation (empty title, invalid priority, time without date, max lengths).
- **Why first:** UI work needs a stable contract; this phase is independently verifiable.

### Phase 4 — To-do frontend
**Size: L**

- **Objective:** a fully usable To-do module.
- **Features:** navigation entry and sidebar lists, smart views, list page, quick add, rows, detail dialog, subtasks, search/filter/sort, manual ordering, list create/rename/archive/restore/delete/reorder, colour/icon.
- **Affected files:** `App.tsx`, `AppSidebar.tsx`, `navigation.ts`, `styles.css`, `lib/ipc.ts`, `lib/types.ts`, `lib/format.ts`.
- **New files:** `stores/todos.ts`, `TodoPage.tsx`, `TodoTaskList.tsx`, `TodoTaskItem.tsx`, `TodoQuickAdd.tsx`, `TodoToolbar.tsx`, `TodoDialog.tsx`, `TodoListDialog.tsx`, `lib/todoViews.ts`, plus tests for each.
- **Database changes:** none beyond Phase 3.
- **Depends on:** Phase 3 (commands), Phase 1 (navigation shell).
- **Verification:**
  - `npm test` and `npm run build` pass.
  - Manual CRUD and persistence across restart.
  - Independence check: complete a To-do and confirm timer/stat values are unchanged.
  - Correctness of Today/Upcoming/Overdue/Completed views.
  - Filter/sort combinations.
  - Empty/loading/error states.
  - 420px layout.
- **Complexity control:** filters are client-side; manual ordering is menu-based; no drag-and-drop.

### Phase 5 — Notifications and reminders
**Size: L**

- **Objective:** reliable, categorised notifications and per-task reminders.
- **Features:** `notifications.rs`, category settings, reminder scheduler, catch-up, snooze, Open/Done actions, `todos:reveal`, Settings notification group, honest limitation copy.
- **Affected files:** `lib.rs`, `timer/mod.rs` (delegation only), `models.rs` (Settings fields), `SettingsDialog.tsx`, `lib/types.ts`, `App.tsx` (reveal listener), `services/todos.rs` (reminder recompute).
- **New files:** `notifications.rs`, `services/reminders.rs`, reminder tests.
- **Database changes:** `todo_reminders` already added in Phase 3; no new migration unless verification reveals a missing field.
- **Depends on:** Phase 3 (reminder table), Phase 4 (per-task UI).
- **Split if needed:** 5a backend scheduler + gating; 5b settings UI + toast actions.
- **Verification:**
  - `cargo test` for pure reminder helpers and claim/dedupe logic.
  - Manual on Windows: toast appears with the app focused, minimised, and hidden to tray.
  - Change due time → reminder moves; delete task → no toast; complete task → no toast.
  - Two scheduler passes → one toast.
  - Quit the app, relaunch within and outside 24 hours → catch-up policy behaves.
  - Focus Assist on → document that no toast appears and the app cannot detect it.
  - Toast actions while visible; then verify the Action Center limitation.
  - Settings persist across restart; category toggles independently suppress each type.

### Phase 6 — Optional enhancements
Only if Phases 1–5 are stable:

- Recurring tasks.
- Drag-and-drop ordering.
- Notification history / reminder inbox.
- Quiet hours.
- Two-column timer + tasks layout at very wide windows.
- Per-list reminder defaults.

---

## G. Acceptance Criteria

### Layout and navigation

- Sidebar renders expanded at ≥ 900px, icon rail at 640–899px, drawer below 640px.
- No horizontal scrolling at 420, 640, 900, 1000, or 1280px widths.
- Drawer closes after selecting a destination, on Escape, and on backdrop click; focus returns to the menu button.
- Timer controls remain usable at 420×620; no timer feature is hidden by the sidebar.
- Stats and Settings are reachable from the sidebar at all sizes.
- In rail mode, To-do list/view navigation is reachable from the To-do page.

### Pomodoro tasks

- Every existing capability remains: create, edit, delete, complete/reopen, select active, planned/completed pomodoros, notes, tags, subtasks with slot progress, Show Completed.
- Collapsed rows are single-line (two lines maximum when a note/tag line is present) and expose one menu instead of three icons.
- Quick add is collapsed by default; adding a task does not require opening a modal; optional fields are reachable without permanent vertical space.
- Edit dialog is sectioned (Basics / Focus plan / Organisation) and does not require scrolling at the default 1000×800 window; it remains usable at 420px width with body-only scrolling.
- Keyboard users can reach select, complete, menu, disclosure, and every menu item.

### To-do module

- Inbox exists on first launch, cannot be archived or deleted, and accepts tasks immediately.
- Lists can be created, renamed, archived, restored, reordered, coloured, iconed, and deleted with the documented task-handling choice.
- Tasks support title, notes, completion, created date, optional due date/time, priority, list, manual order, subtasks, and reminders.
- Quick creation requires only a title; due/priority/list are optional.
- Completed tasks are hidden by default and visible in the Completed view and with the completion filter.
- Search, priority filter, due filter, completion filter, and all four sort modes produce correct, stable results.
- Today includes overdue tasks; Overdue remains visible; Upcoming excludes the past; Completed is newest-first.
- Manual ordering is honoured only in Manual sort; up/down menu actions persist after restart.
- Subtasks show `done/total` progress and are single-level.
- Deleting a list with tasks either moves them to Inbox or deletes them only after explicit confirmation.
- Archive excludes a list and its tasks from smart views; restore brings them back.

### Data integrity and independence

- `tasks`, `subtasks`, `sessions`, `app_state`, `tags`, `task_tags`, and stats are unchanged by any To-do operation.
- Completing, reopening, or deleting To-do tasks never changes the active Pomodoro task, completed pomodoros, focus statistics, or cycle count.
- All To-do state survives an app restart, including list order, task order, due dates, priorities, subtasks, and reminders.
- `tasks`/`subtasks` behaviour and existing user data are unchanged after migration.

### Notifications

- Pomodoro and To-do notifications can be toggled independently; the master switch suppresses both.
- A reminder fires exactly once at the computed local time while the app is running.
- Deleting a task cancels its pending reminder; changing the due date/time reschedules it; completing it removes it.
- Archived lists and completed tasks never produce reminders.
- After a restart, a missed reminder within 24 hours is delivered once; older reminders are not.
- Duplicate scheduler passes do not produce duplicate toasts.
- Notification actions either perform the stated action or are documented as best-effort where the OS does not report them.
- Settings persist across restart.

### Quality gates

- `npm test` passes.
- `npm run build` passes (`tsc --noEmit` + Vite).
- `cd src-tauri && cargo test` passes.
- `cd src-tauri && cargo clippy --all-targets` passes.
- Manual regression: preset switching, focus/break cycling, auto-start, skip/reset/end, tray behaviour, window title, crash recovery, stats.

---

## H. Risks and Important Decisions

### H.1 Decisions requiring attention

| Decision | Recommendation | Why |
|---|---|---|
| Router vs state navigation | **State navigation** | Two sections, no URLs; avoids a dependency and keeps notification deep-links simple |
| Window default size | **1000×800**, min **420×620** | The current 560px default would force drawer mode and hide the feature; 1000px gives the timer breathing room and the sidebar a purpose |
| Sidebar at medium width | **Icon rail + in-page list selector**, no hover flyout | Hover flyouts are fragile for keyboard/touch and easy to clip |
| Pomodoro subtasks | **Keep existing model and dialog** | They carry pomodoro credits; simplifying them would remove functionality |
| To-do subtasks | **New simple checklist table** | Pomodoro `subtasks` semantics do not fit To-do checklists |
| To-do list deletion | **Default move to Inbox**, explicit delete-tasks option | Prevents accidental data loss |
| Recurring tasks | **Defer to Phase 6** | Recurrence interacts with completion, reminders, timezones, and catch-up; it would dominate v1 complexity |
| Drag-and-drop | **Defer; use Move up/down** | No new dependency, keyboard-friendly, sufficient for manual ordering |
| Filtering | **Client-side** | Data volumes are small; avoids a second query API and keeps one source of truth |
| Reminder storage | **One row per task, precomputed UTC `fire_at`** | Simple dedupe, catch-up, and snooze; multiple reminders are not required |
| Quiet hours | **Not v1** | OS Focus Assist already exists; in-app quiet hours makes catch-up semantics ambiguous |
| Notification history | **Optional, later** | Today/Overdue views already expose what matters; a history adds storage and UI surface |
| Stats/Settings | **Keep as dialogs, opened from sidebar** | Preserves existing components and avoids turning them into pages |

### H.2 Architectural and migration risks

1. **sqlx migration checksums.**
   `0001` and `0002` are already applied. Editing them will make `sqlx::migrate!` fail at startup. All changes must go into `0003` and later. This is the highest-impact migration risk.

2. **Single database connection.**
   `max_connections(1)` serialises all writes. The reminder scheduler must not hold the connection while showing a toast and must not run overlapping passes. The 30-second query is cheap; keep it short.

3. **Migration test coverage.**
   `db::memory_pool()` runs all migrations, so new tables are exercised by Rust tests — but only if tests actually touch them. Add explicit repository/service tests rather than relying on UI tests.

4. **Backward compatibility of settings.**
   `Settings` already uses `#[serde(default)]`, so new fields are safe. Do not change existing field names or semantics.

5. **Existing window-size assumption.**
   Changing the default width alters first-launch appearance. Tauri does not restore window geometry by default here, so this is a one-time change. Document it in release notes.

6. **Timer regression.**
   Task credit logic lives in `timer/mod.rs`; Phase 2 must not touch it. The only planned timer change is delegating `TauriHost::notify` to the new notifier.

7. **Portals and clipping.**
   `.surface-card` currently has `overflow-hidden`; menus must render through a portal or the card must stop clipping. The portal approach is safer and reusable.

8. **Two app instances.**
   The database claim-first update prevents duplicate reminders, but the two windows will have independent stores. Do not add a single-instance dependency for v1 unless testing shows real user confusion.

9. **Time and timezone.**
   Local `due_date`/`due_time` with UTC `fire_at` is predictable, but a timezone change after scheduling does not move an already-scheduled reminder. Document it; do not silently recompute on every launch.

10. **OS notification limitations are not fixable in-app.**
    Focus Assist, Action Center click reporting, and `remove_active` being a no-op on Windows are platform constraints. The plan must not promise otherwise.

### H.3 Essential vs optional

**Essential (Phases 1–5):**

- Responsive sidebar and navigation.
- Compact Pomodoro task rows, quick add, sectioned edit.
- Independent To-do lists with all required task fields, subtasks, views, filters, sorting, manual ordering, archive/restore, and safe deletion.
- Separate data models and verified independence from Pomodoro data.
- Notification categories, per-task reminders, dedupe, cancellation/rescheduling, catch-up, persistence, and honest OS limitations.

**Optional (Phase 6):**

- Recurring tasks.
- Drag-and-drop.
- Notification history.
- Quiet hours.
- Two-column wide layout.
- Per-list defaults.
- Multiple reminders per task.

### H.4 Assumptions

- Windows is the primary target (the development environment is Windows); macOS/Linux are best-effort, consistent with the plugin’s documented desktop behaviour.
- The app remains single-window and offline-first.
- No cloud sync, accounts, or collaboration.
- English-only UI strings.
- The existing 420px minimum width is retained.
- To-do task volumes are small enough for client-side filtering.
- No new runtime dependencies are needed.

---

## Appendix — Verification commands and manual checks

### Commands

```bash
npm test
npm run build
cd src-tauri && cargo test
cd src-tauri && cargo clippy --all-targets
```

### Manual responsive checks

Resize the Tauri window to each width and confirm the expected sidebar mode, no horizontal scroll, and usable timer:

- 420px
- 500px
- 640px
- 720px
- 900px
- 1000px (default)
- 1280px

### Manual notification checks (Windows)

1. Start a focus session with notifications enabled and a task active; confirm the toast and its wording.
2. Repeat with Pomodoro notifications off; confirm no toast, but the in-app completion still behaves correctly.
3. Create a task due in ~2 minutes with a reminder at due time; confirm one toast.
4. Repeat with the window minimised and hidden to tray.
5. Change the due time while a reminder is pending; confirm the new time is used and no duplicate fires.
6. Delete the task; confirm no toast.
7. Complete the task; confirm no toast.
8. Quit the app before the reminder is due, relaunch after it, and confirm the catch-up policy (one toast within 24h; none after).
9. Enable Focus Assist; confirm the app cannot detect suppression and the toast is silently hidden.
10. Click a toast action while visible; then wait and try from Action Center; record the platform limitation.
11. Toggle each notification category and restart; confirm settings persist.

### Data independence check

Before and after completing a To-do task, verify that the following are unchanged:

- `app_state.active_task_id`
- `tasks.completed_slots`
- `tasks.is_done`
- `sessions` row count
- `get_stats_today()` / `get_stats_totals()`
