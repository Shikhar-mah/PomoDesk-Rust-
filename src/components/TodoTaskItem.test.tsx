import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Todo, TodoList } from "../lib/types";
import { TodoTaskItem } from "./TodoTaskItem";

const list: TodoList = {
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
  title: "Submit report",
  note: "",
  isDone: false,
  priority: "high",
  dueDate: "2026-11-24",
  dueTime: "17:00",
  sortOrder: 0,
  createdAt: "2026-01-01 09:00:00",
  completedAt: null,
  subtasks: [
    {
      id: 1,
      todoId: 10,
      title: "Check numbers",
      isDone: true,
      sortOrder: 0,
      createdAt: "2026-01-01 09:00:00",
      completedAt: "2026-01-02 09:00:00",
    },
    {
      id: 2,
      todoId: 10,
      title: "Send",
      isDone: false,
      sortOrder: 1,
      createdAt: "2026-01-01 09:00:00",
      completedAt: null,
    },
  ],
  reminder: null,
};

function renderItem(overrides: Partial<Todo> = {}, showList = true, manualOrder = true) {
  const handlers = {
    onOpen: vi.fn(),
    onToggleDone: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    onSnooze: vi.fn(),
  };
  render(
    <ul>
      <TodoTaskItem
        todo={{ ...todo, ...overrides }}
        list={list}
        showList={showList}
        manualOrder={manualOrder}
        canMoveUp
        canMoveDown
        {...handlers}
      />
    </ul>,
  );
  return handlers;
}

describe("TodoTaskItem", () => {
  it("shows due, priority and checklist progress as text", () => {
    renderItem();
    expect(screen.getByText("Today · 17:00")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("hides the list reference inside a concrete list", () => {
    renderItem({}, false);
    expect(screen.queryByText("Work")).not.toBeInTheDocument();
  });

  it("toggles completion with a real checkbox", async () => {
    const user = userEvent.setup();
    const { onToggleDone } = renderItem();

    await user.click(screen.getByRole("checkbox", { name: 'Mark "Submit report" done' }));
    expect(onToggleDone).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }), true);
  });

  it("opens the detail dialog from the title", async () => {
    const user = userEvent.setup();
    const { onOpen } = renderItem();

    await user.click(screen.getByRole("button", { name: "Submit report" }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }));
  });

  it("disables manual moves when the sort is not Manual", async () => {
    const user = userEvent.setup();
    renderItem({}, true, false);

    await user.click(
      screen.getByRole("button", { name: 'More actions for "Submit report"' }),
    );

    expect(screen.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Move down" })).toBeDisabled();
  });

  it("offers snooze options when the task has a reminder", async () => {
    const user = userEvent.setup();
    const { onSnooze } = renderItem({
      reminder: {
        fireAt: "2026-11-24 12:00:00",
        kind: "due",
        leadMinutes: null,
        firedAt: null,
      },
    });

    await user.click(
      screen.getByRole("button", { name: 'More actions for "Submit report"' }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Snooze 15 min" }));

    expect(onSnooze).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }), 15);
  });
});
