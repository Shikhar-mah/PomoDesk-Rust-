// To-do lists and tasks. Mutations await the core, then reload — the same
// pattern the tasks store uses.

import { create } from "zustand";

import { ipc } from "../lib/ipc";
import type { Todo, TodoInput, TodoList, TodoListInput } from "../lib/types";

interface TodosStore {
  lists: TodoList[];
  todos: Todo[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;

  createList: (input: TodoListInput) => Promise<TodoList>;
  updateList: (id: number, input: TodoListInput) => Promise<void>;
  setListArchived: (id: number, archived: boolean) => Promise<void>;
  deleteList: (id: number, moveToInbox: boolean) => Promise<void>;
  moveList: (id: number, direction: "up" | "down") => Promise<void>;

  add: (input: TodoInput) => Promise<void>;
  edit: (id: number, input: TodoInput) => Promise<void>;
  toggleDone: (id: number, done: boolean) => Promise<void>;
  remove: (id: number) => Promise<void>;
  move: (id: number, direction: "up" | "down") => Promise<void>;

  addSubtask: (todoId: number, title: string) => Promise<void>;
  editSubtask: (id: number, title: string) => Promise<void>;
  toggleSubtask: (id: number, done: boolean) => Promise<void>;
  removeSubtask: (id: number) => Promise<void>;

  snooze: (todoId: number, minutes: number) => Promise<void>;
}

async function fetchAll(): Promise<{ lists: TodoList[]; todos: Todo[] }> {
  const [lists, todos] = await Promise.all([ipc.listTodoLists(), ipc.listTodos()]);
  return { lists, todos };
}

export const useTodoStore = create<TodosStore>((set) => ({
  lists: [],
  todos: [],
  loading: true,
  error: null,

  load: async () => {
    try {
      const { lists, todos } = await fetchAll();
      set({ lists, todos, loading: false, error: null });
    } catch {
      set({
        loading: false,
        error: "PomoDesk couldn't load your To-do lists. Please restart the app.",
      });
    }
  },

  createList: async (input) => {
    const created = await ipc.createTodoList(input);
    const { lists, todos } = await fetchAll();
    set({ lists, todos });
    return created;
  },

  updateList: async (id, input) => {
    await ipc.updateTodoList(id, input);
    const { lists, todos } = await fetchAll();
    set({ lists, todos });
  },

  setListArchived: async (id, archived) => {
    await ipc.setTodoListArchived(id, archived);
    const { lists, todos } = await fetchAll();
    set({ lists, todos });
  },

  deleteList: async (id, moveToInbox) => {
    await ipc.deleteTodoList(id, moveToInbox);
    const { lists, todos } = await fetchAll();
    set({ lists, todos });
  },

  moveList: async (id, direction) => {
    await ipc.moveTodoList(id, direction);
    set({ lists: await ipc.listTodoLists() });
  },

  add: async (input) => {
    await ipc.createTodo(input);
    set({ todos: await ipc.listTodos() });
  },

  edit: async (id, input) => {
    await ipc.updateTodo(id, input);
    set({ todos: await ipc.listTodos() });
  },

  toggleDone: async (id, done) => {
    await ipc.setTodoDone(id, done);
    set({ todos: await ipc.listTodos() });
  },

  remove: async (id) => {
    await ipc.deleteTodo(id);
    set({ todos: await ipc.listTodos() });
  },

  move: async (id, direction) => {
    await ipc.moveTodo(id, direction);
    set({ todos: await ipc.listTodos() });
  },

  addSubtask: async (todoId, title) => {
    await ipc.createTodoSubtask(todoId, title);
    set({ todos: await ipc.listTodos() });
  },

  editSubtask: async (id, title) => {
    await ipc.updateTodoSubtask(id, title);
    set({ todos: await ipc.listTodos() });
  },

  toggleSubtask: async (id, done) => {
    await ipc.setTodoSubtaskDone(id, done);
    set({ todos: await ipc.listTodos() });
  },

  removeSubtask: async (id) => {
    await ipc.deleteTodoSubtask(id);
    set({ todos: await ipc.listTodos() });
  },

  snooze: async (todoId, minutes) => {
    await ipc.snoozeTodoReminder(todoId, minutes);
    set({ todos: await ipc.listTodos() });
  },
}));
