import { describe, expect, it } from "vitest";

import {
  applyFilters,
  canMove,
  DEFAULT_FILTERS,
  dueLabel,
  sortCompleted,
  sortTodos,
  tasksForView,
} from "./todoViews";
import type { Todo, TodoList } from "./types";

const lists: TodoList[] = [
  {
    id: 1,
    name: "Inbox",
    color: "zinc",
    icon: "inbox",
    sortOrder: 0,
    isInbox: true,
    archivedAt: null,
    createdAt: "2026-01-01 09:00:00",
  },
  {
    id: 2,
    name: "Work",
    color: "blue",
    icon: "briefcase",
    sortOrder: 1,
    isInbox: false,
    archivedAt: null,
    createdAt: "2026-01-01 09:00:00",
  },
  {
    id: 3,
    name: "Old",
    color: "rose",
    icon: "list",
    sortOrder: 2,
    isInbox: false,
    archivedAt: "2026-02-01 09:00:00",
    createdAt: "2026-01-01 09:00:00",
  },
];

function todo(overrides: Partial<Todo> & Pick<Todo, "id" | "title">): Todo {
  return {
    listId: 1,
    note: "",
    isDone: false,
    priority: "medium",
    dueDate: null,
    dueTime: null,
    sortOrder: overrides.id,
    createdAt: "2026-01-01 09:00:00",
    completedAt: null,
    subtasks: [],
    reminder: null,
    ...overrides,
  };
}

const today = "2026-11-24";

describe("todo views", () => {
  const todos: Todo[] = [
    todo({ id: 1, title: "Overdue", dueDate: "2026-11-20", priority: "high" }),
    todo({ id: 2, title: "Today", dueDate: today }),
    todo({ id: 3, title: "Future", dueDate: "2026-12-01", listId: 2 }),
    todo({ id: 4, title: "Someday" }),
    todo({
      id: 5,
      title: "Done older",
      isDone: true,
      completedAt: "2026-11-20 10:00:00",
      listId: 2,
    }),
    todo({
      id: 6,
      title: "Done newer",
      isDone: true,
      completedAt: "2026-11-23 10:00:00",
    }),
    todo({ id: 7, title: "Archived task", listId: 3 }),
  ];

  it("Today includes overdue work so the view stays actionable", () => {
    const titles = tasksForView(todos, lists, "today", null, today).map((t) => t.title);
    expect(titles).toEqual(["Overdue", "Today"]);
  });

  it("Upcoming excludes the past and completed tasks", () => {
    const titles = tasksForView(todos, lists, "upcoming", null, today).map((t) => t.title);
    expect(titles).toEqual(["Future"]);
  });

  it("Overdue stays visible", () => {
    const titles = tasksForView(todos, lists, "overdue", null, today).map((t) => t.title);
    expect(titles).toEqual(["Overdue"]);
  });

  it("completed tasks are newest-first", () => {
    const completed = sortCompleted(tasksForView(todos, lists, "completed", null, today));
    expect(completed.map((entry) => entry.title)).toEqual(["Done newer", "Done older"]);
  });

  it("archived lists are excluded from smart views", () => {
    const all = tasksForView(todos, lists, "all", null, today).map((entry) => entry.title);
    expect(all).not.toContain("Archived task");
  });

  it("search and priority filters combine", () => {
    const visible = applyFilters(
      tasksForView(todos, lists, "all", null, today),
      { ...DEFAULT_FILTERS, search: "over", priorities: ["high"] },
      today,
    );
    expect(visible.map((entry) => entry.title)).toEqual(["Overdue"]);
  });

  it("sorting by due date puts dated work first", () => {
    const sorted = sortTodos(
      [todo({ id: 1, title: "No date" }), todo({ id: 2, title: "Dated", dueDate: today })],
      "due",
    );
    expect(sorted.map((entry) => entry.title)).toEqual(["Dated", "No date"]);
  });

  it("writes due chips in words, not colours", () => {
    expect(dueLabel(todo({ id: 1, title: "A", dueDate: today }), today)).toBe("Today");
    expect(dueLabel(todo({ id: 2, title: "B", dueDate: "2026-11-25" }), today)).toBe(
      "Tomorrow",
    );
    expect(dueLabel(todo({ id: 3, title: "C", dueDate: "2026-11-22" }), today)).toBe(
      "Overdue · 2d",
    );
    expect(
      dueLabel(todo({ id: 4, title: "D", dueDate: today, dueTime: "17:00" }), today),
    ).toBe("Today · 17:00");
  });

  it("manual moves are scoped to a list", () => {
    const a = todo({ id: 10, title: "A", listId: 2 });
    const b = todo({ id: 11, title: "B", listId: 2 });
    expect(canMove(a, [a, b], "down")).toBe(true);
    expect(canMove(a, [a, b], "up")).toBe(false);
  });
});
