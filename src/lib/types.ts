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
  minimizeToTray: boolean;
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
