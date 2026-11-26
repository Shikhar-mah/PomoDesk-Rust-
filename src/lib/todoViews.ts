// Client-side view, filter and sort logic for the To-do module.
//
// At this app's scale the whole `todos` array is loaded once, so filtering here
// keeps one source of truth and needs no query API.

import type { Todo, TodoList, TodoPriority, TodoView } from "./types";

export type CompletionFilter = "open" | "all" | "completed";
export type DueFilter = "any" | "today" | "next7" | "overdue" | "none";
export type SortMode = "manual" | "due" | "priority" | "created";

export interface TodoFilters {
  search: string;
  completion: CompletionFilter;
  priorities: TodoPriority[];
  due: DueFilter;
  sort: SortMode;
}

export const DEFAULT_FILTERS: TodoFilters = {
  search: "",
  completion: "open",
  priorities: [],
  due: "any",
  sort: "manual",
};

const PRIORITY_WEIGHT: Record<TodoPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Local calendar day as `YYYY-MM-DD`, matching what the core stores. */
export function todayISO(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

export function isOverdue(todo: Todo, today = todayISO()): boolean {
  return !todo.isDone && todo.dueDate !== null && todo.dueDate < today;
}

export function isDueToday(todo: Todo, today = todayISO()): boolean {
  return todo.dueDate === today;
}

/** The name of the active view, for the page header. */
export function viewTitle(view: TodoView, lists: TodoList[], listId: number | null): string {
  if (view === "list") {
    return lists.find((list) => list.id === listId)?.name ?? "List";
  }
  const labels: Record<Exclude<TodoView, "list">, string> = {
    all: "All tasks",
    today: "Today",
    upcoming: "Upcoming",
    overdue: "Overdue",
    completed: "Completed",
    archived: "Archived lists",
  };
  return labels[view];
}

/** Tasks that belong in a view, before the toolbar filters are applied. */
export function tasksForView(
  todos: Todo[],
  lists: TodoList[],
  view: TodoView,
  listId: number | null,
  today = todayISO(),
): Todo[] {
  const activeListIds = new Set(
    lists.filter((list) => list.archivedAt === null).map((list) => list.id),
  );

  const base = todos.filter((todo) => activeListIds.has(todo.listId));

  switch (view) {
    case "all":
      return base.filter((todo) => !todo.isDone);
    case "today":
      return base.filter(
        (todo) =>
          !todo.isDone && todo.dueDate !== null && todo.dueDate <= today,
      );
    case "upcoming":
      return base.filter(
        (todo) => !todo.isDone && todo.dueDate !== null && todo.dueDate > today,
      );
    case "overdue":
      return base.filter(
        (todo) => !todo.isDone && todo.dueDate !== null && todo.dueDate < today,
      );
    case "completed":
      return base.filter((todo) => todo.isDone);
    case "archived":
      return [];
    case "list":
      return todos.filter((todo) => todo.listId === listId && !todo.isDone);
    default:
      return [];
  }
}

function matchesDueFilter(todo: Todo, filter: DueFilter, today: string): boolean {
  switch (filter) {
    case "any":
      return true;
    case "today":
      return todo.dueDate === today;
    case "next7":
      return (
        todo.dueDate !== null && todo.dueDate >= today && todo.dueDate <= addDays(today, 7)
      );
    case "overdue":
      return isOverdue(todo, today);
    case "none":
      return todo.dueDate === null;
    default:
      return true;
  }
}

export function applyFilters(
  todos: Todo[],
  filters: TodoFilters,
  today = todayISO(),
): Todo[] {
  const search = filters.search.trim().toLowerCase();

  const filtered = todos.filter((todo) => {
    if (search && !todo.title.toLowerCase().includes(search)) return false;

    if (filters.completion === "open" && todo.isDone) return false;
    if (filters.completion === "completed" && !todo.isDone) return false;

    if (filters.priorities.length > 0 && !filters.priorities.includes(todo.priority)) {
      return false;
    }

    if (!matchesDueFilter(todo, filters.due, today)) return false;
    return true;
  });

  return sortTodos(filtered, filters.sort);
}

export function sortTodos(todos: Todo[], sort: SortMode): Todo[] {
  const copy = [...todos];
  switch (sort) {
    case "due":
      return copy.sort((a, b) => {
        if (a.dueDate === null && b.dueDate === null) return a.sortOrder - b.sortOrder;
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;
        const dateCompare = a.dueDate.localeCompare(b.dueDate);
        if (dateCompare !== 0) return dateCompare;
        return (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99");
      });
    case "priority":
      return copy.sort(
        (a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority],
      );
    case "created":
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "manual":
    default:
      return copy.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }
}

/** Newest completion first, as the Completed view requires. */
export function sortCompleted(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) =>
    (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
  );
}

/** One compact chip: `Today`, `Tomorrow`, `Overdue · 2d`, `Wed 26`. */
export function dueLabel(todo: Todo, today = todayISO()): string | null {
  if (todo.dueDate === null) return null;

  let day: string;
  if (todo.dueDate === today) {
    day = "Today";
  } else if (todo.dueDate === addDays(today, -1)) {
    day = "Yesterday";
  } else if (todo.dueDate === addDays(today, 1)) {
    day = "Tomorrow";
  } else if (todo.dueDate < today) {
    const days = Math.max(
      1,
      Math.round(
        (new Date(`${today}T00:00:00`).getTime() -
          new Date(`${todo.dueDate}T00:00:00`).getTime()) /
          86_400_000,
      ),
    );
    day = `Overdue · ${days}d`;
  } else {
    const date = new Date(`${todo.dueDate}T12:00:00`);
    day = date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
  }

  if (todo.dueTime && day === "Today") return `${day} · ${todo.dueTime}`;
  if (todo.dueTime && day === "Tomorrow") return `${day} · ${todo.dueTime}`;
  return day;
}

export const PRIORITY_LABEL: Record<TodoPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function subtaskProgress(todo: Todo): string | null {
  if (todo.subtasks.length === 0) return null;
  return `${todo.subtasks.filter((item) => item.isDone).length}/${todo.subtasks.length}`;
}

/** The compare used by the row's move up/down menu. */
export function canMove(todo: Todo, todos: Todo[], direction: "up" | "down"): boolean {
  const siblings = sortTodos(
    todos.filter((entry) => entry.listId === todo.listId && !entry.isDone),
    "manual",
  );
  const index = siblings.findIndex((entry) => entry.id === todo.id);
  if (index < 0) return false;
  return direction === "up" ? index > 0 : index < siblings.length - 1;
}
