// User preferences. Changes are applied optimistically and rolled back if the
// core rejects them, so the switches feel instant but never lie.

import { create } from "zustand";

import { ipc } from "../lib/ipc";
import type { Settings } from "../lib/types";

interface SettingsStore {
  settings: Settings | null;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  save: (next: Settings) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  loading: true,
  error: null,

  load: async () => {
    try {
      const settings = await ipc.getSettings();
      set({ settings, loading: false, error: null });
    } catch {
      set({
        loading: false,
        error: "PomoDesk couldn't load your settings. Please restart the app.",
      });
    }
  },

  save: async (next) => {
    const previous = get().settings;
    set({ settings: next });

    try {
      const saved = await ipc.updateSettings(next);
      set({ settings: saved });
    } catch (error) {
      set({ settings: previous });
      throw error;
    }
  },
}));
