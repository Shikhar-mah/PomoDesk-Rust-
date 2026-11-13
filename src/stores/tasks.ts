// Tasks, fetched on mount and reloaded after every change.

import { create } from "zustand";

import { ipc } from "../lib/ipc";
import type { Task, TaskInput } from "../lib/types";

interface TasksStore {
  tasks: Task[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  /** Mutations throw so forms can show the message next to the field. */
  add: (input: TaskInput) => Promise<void>;
  edit: (id: number, input: TaskInput) => Promise<void>;
  toggleDone: (id: number, done: boolean) => Promise<void>;
  remove: (id: number) => Promise<void>;
  activate: (id: number | null) => Promise<void>;
}

export const useTasksStore = create<TasksStore>((set) => ({
  tasks: [],
  loading: true,
  error: null,

  load: async () => {
    try {
      const tasks = await ipc.listTasks();
      set({ tasks, loading: false, error: null });
    } catch {
      set({
        loading: false,
        error: "PomoDesk couldn't load your tasks. Please restart the app.",
      });
    }
  },

  add: async (input) => {
    await ipc.createTask(input);
    set({ tasks: await ipc.listTasks() });
  },

  edit: async (id, input) => {
    await ipc.updateTask(id, input);
    set({ tasks: await ipc.listTasks() });
  },

  toggleDone: async (id, done) => {
    await ipc.setTaskDone(id, done);
    set({ tasks: await ipc.listTasks() });
  },

  remove: async (id) => {
    await ipc.deleteTask(id);
    set({ tasks: await ipc.listTasks() });
  },

  activate: async (id) => {
    await ipc.setActiveTask(id);
    set({ tasks: await ipc.listTasks() });
  },
}));

/** The single active task, if there is one. */
export function selectActiveTask(tasks: Task[]): Task | null {
  return tasks.find((task) => task.isActive) ?? null;
}
