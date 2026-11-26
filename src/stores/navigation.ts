// Navigation is component state, not a router: the app has two sections and no
// URLs, so a tiny store keeps notification deep-links simple.

import { create } from "zustand";

import type { TodoView } from "../lib/types";

export type Section = "timer" | "todos";

interface NavigationState {
  section: Section;
  todoView: TodoView;
  listId: number | null;
  sidebarOpen: boolean;
  setSection: (section: Section) => void;
  openView: (view: TodoView) => void;
  openList: (id: number) => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  section: "timer",
  todoView: "all",
  listId: null,
  sidebarOpen: false,

  setSection: (section) => set({ section, sidebarOpen: false }),
  openView: (view) => set({ section: "todos", todoView: view, listId: null, sidebarOpen: false }),
  openList: (id) =>
    set({ section: "todos", todoView: "list", listId: id, sidebarOpen: false }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
