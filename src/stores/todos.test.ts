import { beforeEach, describe, expect, it, vi } from "vitest";

import { ipc } from "../lib/ipc";
import type { Todo, TodoList } from "../lib/types";
import { useTodoStore } from "./todos";

vi.mock("../lib/ipc", () => ({
  ipc: {
    listTodoLists: vi.fn(),
    listTodos: vi.fn(),
    createTodo: vi.fn(),
    updateTodo: vi.fn(),
    setTodoDone: vi.fn(),
    deleteTodo: vi.fn(),
    createTodoList: vi.fn(),
  },
}));

const inbox: TodoList = {
  id: 1,
  name: "Inbox",
  color: "zinc",
  icon: "inbox",
  sortOrder: 0,
  isInbox: true,
  archivedAt: null,
  createdAt: "2026-01-01 09:00:00",
};

const todo: Todo = {
  id: 5,
  listId: 1,
  title: "Report",
  note: "",
  isDone: false,
  priority: "medium",
  dueDate: null,
  dueTime: null,
  sortOrder: 0,
  createdAt: "2026-01-01 09:00:00",
  completedAt: null,
  subtasks: [],
  reminder: null,
};

describe("todo store", () => {
  beforeEach(() => {
    useTodoStore.setState({ lists: [], todos: [], loading: true, error: null });
    vi.mocked(ipc.listTodoLists).mockReset().mockResolvedValue([inbox]);
    vi.mocked(ipc.listTodos).mockReset().mockResolvedValue([todo]);
  });

  it("loads lists and tasks together", async () => {
    await useTodoStore.getState().load();

    const state = useTodoStore.getState();
    expect(state.lists).toEqual([inbox]);
    expect(state.todos).toEqual([todo]);
    expect(state.loading).toBe(false);
  });

  it("explains a load failure in plain language", async () => {
    vi.mocked(ipc.listTodos).mockRejectedValue(new Error("offline"));

    await useTodoStore.getState().load();

    expect(useTodoStore.getState().error).toMatch(/couldn't load your To-do lists/i);
  });

  it("reloads after a mutation", async () => {
    const changed = { ...todo, isDone: true };
    vi.mocked(ipc.setTodoDone).mockResolvedValue(changed);
    vi.mocked(ipc.listTodos).mockResolvedValue([changed]);

    await useTodoStore.getState().toggleDone(5, true);

    expect(ipc.setTodoDone).toHaveBeenCalledWith(5, true);
    expect(useTodoStore.getState().todos[0].isDone).toBe(true);
  });
});
