import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Todo, TodoList } from "../lib/types";
import { useNavigationStore } from "../stores/navigation";
import { useTodoStore } from "../stores/todos";
import { AppSidebar } from "./AppSidebar";

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
const work: TodoList = {
  id: 2,
  name: "Work",
  color: "blue",
  icon: "briefcase",
  sortOrder: 1,
  isInbox: false,
  archivedAt: null,
  createdAt: "2026-01-01 09:00:00",
};
const todo: Todo = {
  id: 10,
  listId: 2,
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

function renderSidebar() {
  const handlers = {
    onOpenStats: vi.fn(),
    onOpenSettings: vi.fn(),
    onNewList: vi.fn(),
    onEditList: vi.fn(),
  };
  render(<AppSidebar {...handlers} />);
  return handlers;
}

describe("AppSidebar", () => {
  beforeEach(() => {
    useNavigationStore.setState({
      section: "timer",
      todoView: "all",
      listId: null,
      sidebarOpen: false,
    });
    useTodoStore.setState({
      lists: [inbox, work],
      todos: [todo],
      loading: false,
      error: null,
    });
  });

  it("marks the current section and switches to a smart view", async () => {
    const user = userEvent.setup();
    renderSidebar();

    expect(screen.getByRole("button", { name: "Timer" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.click(screen.getByRole("button", { name: "Today" }));

    const navigation = useNavigationStore.getState();
    expect(navigation.section).toBe("todos");
    expect(navigation.todoView).toBe("today");
  });

  it("opens a list and shows its open-task count", async () => {
    const user = userEvent.setup();
    renderSidebar();

    expect(screen.getByText("1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Work/ }));

    const navigation = useNavigationStore.getState();
    expect(navigation.todoView).toBe("list");
    expect(navigation.listId).toBe(2);
  });

  it("offers Statistics and Settings, and a new list action", async () => {
    const user = userEvent.setup();
    const { onOpenStats, onOpenSettings, onNewList } = renderSidebar();

    await user.click(screen.getByRole("button", { name: "Statistics" }));
    expect(onOpenStats).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "New list" }));
    expect(onNewList).toHaveBeenCalledOnce();
  });
});
