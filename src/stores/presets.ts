// Timer presets (the tabs along the top of the app).

import { create } from "zustand";

import { ipc } from "../lib/ipc";
import type { Preset, PresetInput } from "../lib/types";

interface PresetsStore {
  presets: Preset[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  create: (input: PresetInput) => Promise<void>;
  update: (id: number, input: PresetInput) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export const usePresetsStore = create<PresetsStore>((set) => ({
  presets: [],
  loading: true,
  error: null,

  load: async () => {
    try {
      const presets = await ipc.listPresets();
      set({ presets, loading: false, error: null });
    } catch {
      set({
        loading: false,
        error: "PomoDesk couldn't load your timer presets. Please restart the app.",
      });
    }
  },

  create: async (input) => {
    await ipc.createPreset(input);
    set({ presets: await ipc.listPresets() });
  },

  update: async (id, input) => {
    await ipc.updatePreset(id, input);
    set({ presets: await ipc.listPresets() });
  },

  remove: async (id) => {
    await ipc.deletePreset(id);
    set({ presets: await ipc.listPresets() });
  },
}));
