// Global, non-persistent UI feedback: one toast at a time.

import { create } from "zustand";

import { describeError } from "../lib/ipc";

export type NoticeKind = "success" | "error";

interface UiState {
  notice: { kind: NoticeKind; text: string } | null;
  showNotice: (kind: NoticeKind, text: string) => void;
  reportError: (error: unknown) => void;
  clearNotice: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  notice: null,
  showNotice: (kind, text) => set({ notice: { kind, text } }),
  // Turns any thrown value into a sentence a non-technical user can act on.
  reportError: (error) => set({ notice: { kind: "error", text: describeError(error) } }),
  clearNotice: () => set({ notice: null }),
}));
