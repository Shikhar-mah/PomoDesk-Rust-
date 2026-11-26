// TypeScript mirrors of the Rust structs in `src-tauri/src/models.rs`.
// Keeping them in one file means a change on the Rust side has one obvious place
// to update on the frontend side.

export type SessionType = "focus" | "short_break" | "long_break";
export type TimerStatus = "idle" | "running" | "paused";

export interface Preset {
  id: number;
  name: string;
  focusSec: number;
  shortBreakSec: number;
  longBreakSec: number;
  longBreakEvery: number;
  sortOrder: number;
  isBuiltin: boolean;
}

export interface PresetInput {
  name: string;
  focusSec: number;
  shortBreakSec: number;
  longBreakSec: number;
  longBreakEvery: number;
}

export interface Task {
  id: number;
  title: string;
  note: string;
  estSlots: number;
  completedSlots: number;
  isDone: boolean;
  isActive: boolean;
  createdAt: string;
  completedAt: string | null;
  tags: string[];
  subtasks: Subtask[];
}

export interface Subtask {
  id: number;
  taskId: number;
  title: string;
  estSlots: number;
  completedSlots: number;
  isDone: boolean;
  isActive: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskInput {
  title: string;
  note: string;
  estSlots: number;
  completedSlots?: number | null;
  tags?: string[];
}

export interface TimerSnapshot {
  sessionType: SessionType;
  status: TimerStatus;
  remainingMs: number;
  totalMs: number;
  endsAt: number | null;
  startedAt: string | null;
  cycleFocusCount: number;
  activePresetId: number;
}

export interface TickPayload {
  sessionType: SessionType;
  status: TimerStatus;
  remainingMs: number;
  totalMs: number;
  cycleFocusCount: number;
  activePresetId: number;
}

export interface SessionCompletePayload {
  completedType: SessionType;
  nextType: SessionType;
  creditedTaskId: number | null;
  willAutoStart: boolean;
}

export interface Settings {
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  /** Id of the bundled notification sound; empty means the default. */
  soundId: string;
  notificationsEnabled: boolean;
  pomodoroNotifications: boolean;
  todoRemindersEnabled: boolean;
  minimizeToTray: boolean;
}

// ---------------------------------------------------------------------------
// To-do (independent of Pomodoro tasks)
// ---------------------------------------------------------------------------

export type TodoPriority = "low" | "medium" | "high";
export type TodoView =
  | "all"
  | "today"
  | "upcoming"
  | "overdue"
  | "completed"
  | "list"
  | "archived";

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

export interface TodoListInput {
  name: string;
  color: string;
  icon: string;
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
  | { mode: "custom"; at: string };

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
  dueDate: string | null;
  dueTime: string | null;
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

export interface StatsToday {
  sessions: number;
  focusMinutes: number;
  tasksCompleted: number;
}

export interface DailyStat {
  date: string;
  sessions: number;
  minutes: number;
}

export interface StatsTotals {
  sessions: number;
  focusMinutes: number;
  streakDays: number;
}
