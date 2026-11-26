import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "../lib/types";
import { TaskItem } from "./TaskItem";

const baseTask: Task = {
  id: 7,
  title: "Write architecture doc",
  note: "Keep it short",
  estSlots: 4,
  completedSlots: 2,
  isDone: false,
  isActive: false,
  createdAt: "2026-11-12 09:00:00",
  completedAt: null,
  tags: [],
  subtasks: [],
};

function renderItem(overrides: Partial<Task> = {}) {
  const task = { ...baseTask, ...overrides };
  const handlers = {
    onActivate: vi.fn(),
    onToggleDone: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onAddSubtask: vi.fn(),
    onToggleSubtaskDone: vi.fn(),
    onSelectSubtask: vi.fn(),
    onEditSubtask: vi.fn(),
    onDeleteSubtask: vi.fn(),
  };

  render(<ul><TaskItem task={task} {...handlers} /></ul>);
  return { task, ...handlers };
}

describe("TaskItem", () => {
  it("shows progress as completed over planned pomodoros", () => {
    renderItem();
    expect(
      screen.getByLabelText("2 of 4 planned pomodoros done"),
    ).toHaveTextContent("2/4");
  });

  it("activates a task when its selection control is used", async () => {
    const user = userEvent.setup();
    const { onActivate, task } = renderItem();

    const toggle = screen.getByRole("button", {
      name: `Make "${task.title}" the current task`,
    });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it("marks the active task as pressed", () => {
    renderItem({ isActive: true });
    expect(
      screen.getByRole("button", { name: /is the current task/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("does not let a completed task become the current task", async () => {
    const user = userEvent.setup();
    const { onActivate } = renderItem({ isDone: true });

    const toggle = screen.getByRole("button", { name: /is completed/i });
    expect(toggle).toBeDisabled();

    await user.click(toggle);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("toggles completion with the row checkbox", async () => {
    const user = userEvent.setup();
    const { onToggleDone, task } = renderItem();

    await user.click(screen.getByRole("checkbox", { name: `Mark "${task.title}" done` }));
    expect(onToggleDone).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), true);
  });

  it("exposes edit and delete through the single row menu", async () => {
    const user = userEvent.setup();
    const { onEdit, onDelete, task } = renderItem();

    await user.click(
      screen.getByRole("button", { name: `More actions for "${task.title}"` }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: `More actions for "${task.title}"` }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalled();
  });
});
