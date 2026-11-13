// Statistics are only fetched while the Stats panel is open.

import { create } from "zustand";

import { ipc } from "../lib/ipc";
import type { DailyStat, StatsToday, StatsTotals } from "../lib/types";

interface StatsStore {
  today: StatsToday | null;
  daily: DailyStat[];
  totals: StatsTotals | null;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  clear: () => void;
}

export const useStatsStore = create<StatsStore>((set) => ({
  today: null,
  daily: [],
  totals: null,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [today, daily, totals] = await Promise.all([
        ipc.getStatsToday(),
        ipc.getStatsDaily(7),
        ipc.getStatsTotals(),
      ]);
      set({ today, daily, totals, loading: false });
    } catch {
      set({
        loading: false,
        error: "PomoDesk couldn't load your statistics. Please try again.",
      });
    }
  },

  clear: () => set({ today: null, daily: [], totals: null, error: null }),
}));
