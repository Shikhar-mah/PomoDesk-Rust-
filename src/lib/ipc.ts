// The only place that talks to the Rust core.
//
// Every call goes through `call()`, which turns whatever the backend rejected
// with into an `IpcError` carrying a sentence that is safe to show a user.

import { invoke } from "@tauri-apps/api/core";

import type {
  DailyStat,
  Preset,
  PresetInput,
  SessionCompletePayload,
  Settings,
  StatsToday,
  StatsTotals,
  Task,
  TaskInput,
  TimerSnapshot,
  TickPayload,
} from "./types";

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

/** A user-safe error coming from the Rust core. */
export class IpcError extends Error {
  readonly code: string;
  readonly remainingMs?: number;
  readonly presetName?: string;

  constructor(
    code: string,
    message: string,
    extra?: { remainingMs?: number; presetName?: string },
  ) {
    super(message);
    this.name = "IpcError";
    this.code = code;
    this.remainingMs = extra?.remainingMs;
    this.presetName = extra?.presetName;
  }
}

function toIpcError(raw: unknown): IpcError {
  if (typeof raw === "object" && raw !== null && "message" in raw) {
    const payload = raw as {
      code?: string;
      message?: string;
      remainingMs?: number;
      presetName?: string;
    };
    return new IpcError(payload.code ?? "UNKNOWN", payload.message ?? GENERIC_MESSAGE, {
      remainingMs: payload.remainingMs,
      presetName: payload.presetName,
    });
  }

  // The core itself is unreachable (for example the UI was opened in a plain
  // browser instead of the desktop app).
  return new IpcError(
    "CORE_UNAVAILABLE",
    "PomoDesk couldn't reach its timer. Please close and reopen the app.",
  );
}

/** Friendly text for any thrown value, without exposing internals. */
export function describeError(error: unknown): string {
  if (error instanceof IpcError) return error.message;
  return GENERIC_MESSAGE;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toIpcError(error);
  }
}

export const ipc = {
  // Presets
  listPresets: () => call<Preset[]>("list_presets"),
  createPreset: (input: PresetInput) => call<Preset>("create_preset", { input }),
  updatePreset: (id: number, input: PresetInput) =>
    call<Preset>("update_preset", { id, input }),
  deletePreset: (id: number) => call<void>("delete_preset", { id }),

  // Tasks
  listTasks: () => call<Task[]>("list_tasks"),
  createTask: (input: TaskInput) => call<Task>("create_task", { input }),
  updateTask: (id: number, input: TaskInput) => call<Task>("update_task", { id, input }),
  setTaskDone: (id: number, done: boolean) => call<Task>("set_task_done", { id, done }),
  deleteTask: (id: number) => call<void>("delete_task", { id }),
  setActiveTask: (id: number | null) => call<number | null>("set_active_task", { id }),

  // Timer
  getTimerState: () => call<TimerSnapshot>("get_timer_state"),
  startTimer: () => call<TimerSnapshot>("start_timer"),
  pauseTimer: () => call<TimerSnapshot>("pause_timer"),
  resumeTimer: () => call<TimerSnapshot>("resume_timer"),
  skipSession: () => call<TimerSnapshot>("skip_session"),
  resetSession: () => call<TimerSnapshot>("reset_session"),
  switchPreset: (presetId: number, force: boolean) =>
    call<TimerSnapshot>("switch_preset", { presetId, force }),

  // Stats
  getStatsToday: () => call<StatsToday>("get_stats_today"),
  getStatsDaily: (days: number) => call<DailyStat[]>("get_stats_daily", { days }),
  getStatsTotals: () => call<StatsTotals>("get_stats_totals"),
  getStreak: () => call<number>("get_streak"),

  // Settings
  getSettings: () => call<Settings>("get_settings"),
  updateSettings: (settings: Settings) =>
    call<Settings>("update_settings", { settings }),
};

export type { SessionCompletePayload, TickPayload };
