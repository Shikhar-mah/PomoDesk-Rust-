// The timer store is fed by `timer:*` events from Rust. Its actions are thin
// wrappers around the IPC calls — no countdown logic lives here.

import { create } from "zustand";

import { ipc } from "../lib/ipc";
import type { TickPayload, TimerSnapshot } from "../lib/types";

interface TimerStore {
  snapshot: TimerSnapshot | null;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  applyState: (snapshot: TimerSnapshot) => void;
  applyTick: (tick: TickPayload) => void;

  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  skip: () => Promise<void>;
  reset: () => Promise<void>;
  end: () => Promise<void>;
  /** Throws NEEDS_CONFIRMATION while a focus session is in progress. */
  switchPreset: (presetId: number, force: boolean) => Promise<void>;
  /** Throws NEEDS_CONFIRMATION while a focus session is in progress. */
  switchSessionType: (sessionType: "focus" | "short_break" | "long_break", force: boolean) => Promise<void>;
}

export const useTimerStore = create<TimerStore>((set) => ({
  snapshot: null,
  loading: true,
  error: null,

  load: async () => {
    try {
      const snapshot = await ipc.getTimerState();
      set({ snapshot, loading: false, error: null });
    } catch {
      set({
        loading: false,
        error: "PomoDesk couldn't read the timer state. Please restart the app.",
      });
    }
  },

  applyState: (snapshot) => set({ snapshot, loading: false, error: null }),

  // A tick carries fewer fields than a full snapshot, so we merge into the
  // existing one instead of replacing it.
  applyTick: (tick) =>
    set((current) => {
      const base: TimerSnapshot = current.snapshot ?? {
        ...tick,
        endsAt: null,
        startedAt: null,
      };
      return {
        snapshot: {
          ...base,
          sessionType: tick.sessionType,
          status: tick.status,
          remainingMs: tick.remainingMs,
          totalMs: tick.totalMs,
          cycleFocusCount: tick.cycleFocusCount,
          activePresetId: tick.activePresetId,
        },
      };
    }),

  start: async () => {
    set({ snapshot: await ipc.startTimer() });
  },

  pause: async () => {
    set({ snapshot: await ipc.pauseTimer() });
  },

  resume: async () => {
    set({ snapshot: await ipc.resumeTimer() });
  },

  skip: async () => {
    set({ snapshot: await ipc.skipSession() });
  },

  reset: async () => {
    set({ snapshot: await ipc.resetSession() });
  },

  end: async () => {
    set({ snapshot: await ipc.endSession() });
  },

  switchPreset: async (presetId, force) => {
    // Errors (including the confirmation request) are handled by the caller.
    const snapshot = await ipc.switchPreset(presetId, force);
    set({ snapshot });
  },

  switchSessionType: async (sessionType, force) => {
    const snapshot = await ipc.switchSessionType(sessionType, force);
    set({ snapshot });
  },
}));
